const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { one, q } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '30d' });
}

async function login(email, password) {
  const u = await one('SELECT * FROM users WHERE (lower(email)=lower($1) OR phone=$1) AND active', [String(email || '').trim()]);
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) return null;
  return u;
}

// Attach req.user from Bearer token or cookie
async function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  let token = h.startsWith('Bearer ') ? h.slice(7) : (req.cookies && req.cookies.itp_token);
  if (!token && req.method === 'GET' && req.query.t) { // short-lived file token (PDF/CSV opened outside the app)
    try { const f = jwt.verify(String(req.query.t), SECRET); if (f.file) token = jwt.sign({ id: f.id }, SECRET, { expiresIn: 60 }); } catch (e) { /* invalid */ }
  }
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const p = jwt.verify(token, SECRET);
    const u = await one('SELECT id,name,email,phone,role,active,categories,target FROM users WHERE id=$1', [p.id]);
    if (!u || !u.active) return res.status(401).json({ error: 'Account disabled' });
    req.user = u;
    next();
  } catch (e) { return res.status(401).json({ error: 'Session expired' }); }
}

// Backend role gate: allow(...roles)
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not permitted for your role' });

async function audit(req, action, entity, entityId, detail) {
  try {
    await q('INSERT INTO audit_log(user_id,action,entity,entity_id,detail,ip) VALUES($1,$2,$3,$4,$5,$6)',
      [req.user ? req.user.id : null, action, entity, entityId == null ? null : String(entityId), detail || {}, req.ip]);
  } catch (e) { /* never block on audit */ }
}

module.exports = { sign, login, authenticate, allow, audit, hash: (p) => bcrypt.hash(p, 10), SECRET };
