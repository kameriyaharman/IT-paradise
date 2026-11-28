// CRM REST API — role-based access enforced on every route (owner / sales / tech)
const express = require('express');
const multer = require('multer');
const { q, one, tx, nextNumber, getSettings } = require('../db');
const { login, sign, authenticate, allow, audit, hash } = require('../auth');
const { captureLead, addActivity, SOURCE_LABEL } = require('../leads');
const { sendWhatsApp, normPhone, last10 } = require('../notify');
const W = require('../workflows');
const pdf = require('../pdf');
const { jobs: autoJobs } = require('../automations');

const r = express.Router();
const SLA_HOURS_ = { urgent: 4, high: 8, normal: 24, low: 72 };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const OWNER = allow('owner');
const OS = allow('owner', 'sales');

// ---------- Auth ----------
r.post('/auth/login', h(async (req, res) => {
  const u = await login(req.body.email, req.body.password);
  if (!u) return res.status(401).json({ error: 'Invalid login or password' });
  if (req.body.role && req.body.role !== u.role) return res.status(403).json({ error: `This account is "${u.role}", not "${req.body.role}"` });
  const token = sign(u);
  res.cookie('itp_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 864e5, secure: req.secure });
  await q('INSERT INTO audit_log(user_id,action,entity,ip) VALUES($1,$2,$3,$4)', [u.id, 'login', 'user', req.ip]);
  res.json({ token, user: { id: u.id, name: u.name, role: u.role, email: u.email } });
}));
r.post('/auth/logout', (req, res) => { res.clearCookie('itp_token'); res.json({ ok: true }); });

r.use(authenticate);

r.get('/auth/file-token', (req, res) => res.json({ t: require('jsonwebtoken').sign({ id: req.user.id, file: true }, require('../auth').SECRET, { expiresIn: 300 }) }));
r.get('/me', h(async (req, res) => {
  const att = await one('SELECT * FROM attendance WHERE user_id=$1 AND day=CURRENT_DATE', [req.user.id]);
  const s = await getSettings();
  res.json({ user: req.user, attendance: att, company: s.company_name || 'IT PARADISE', wa_ready: !!(s.wa_token && s.wa_phone_id) });
}));
r.post('/me/password', h(async (req, res) => {
  if (String(req.body.password || '').length < 6) return res.status(400).json({ error: 'Min 6 characters' });
  await q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await hash(req.body.password)]);
  res.json({ ok: true });
}));
r.post('/attendance/:act', h(async (req, res) => {
  const loc = req.body.location || null;
  if (req.params.act === 'in') await q(`INSERT INTO attendance(user_id,day,check_in,location) VALUES($1,CURRENT_DATE,now(),$2) ON CONFLICT(user_id,day) DO NOTHING`, [req.user.id, loc]);
  else await q(`UPDATE attendance SET check_out=now(), out_location=$2 WHERE user_id=$1 AND day=CURRENT_DATE`, [req.user.id, loc]);
  if (loc && /^-?[\d.]+,-?[\d.]+$/.test(loc)) { const [la, ln] = loc.split(',').map(Number); await q('INSERT INTO locations(user_id,lat,lng,kind) VALUES($1,$2,$3,$4)', [req.user.id, la, ln, req.params.act === 'in' ? 'check_in' : 'check_out']); }
  res.json(await one('SELECT * FROM attendance WHERE user_id=$1 AND day=CURRENT_DATE', [req.user.id]));
}));
// Live location pings from the staff app (while checked in)
r.post('/location', h(async (req, res) => {
  const s = await getSettings();
  if (s.location_tracking === '0') return res.json({ ok: false, off: true });
  const { lat, lng, accuracy, kind, note } = req.body;
  if (!isFinite(+lat) || !isFinite(+lng)) return res.status(400).json({ error: 'lat/lng required' });
  const last = await one('SELECT lat,lng,at FROM locations WHERE user_id=$1 ORDER BY at DESC LIMIT 1', [req.user.id]);
  const moved = !last || Math.abs(last.lat - lat) + Math.abs(last.lng - lng) > 0.0003 || Date.now() - new Date(last.at) > 10 * 60000;
  if (moved || kind !== 'ping') await q('INSERT INTO locations(user_id,lat,lng,accuracy,kind,note) VALUES($1,$2,$3,$4,$5,$6)', [req.user.id, +lat, +lng, accuracy ? +accuracy : null, kind || 'ping', note || null]);
  res.json({ ok: true, interval: +(s.location_interval_min || 5) });
}));
r.get('/team/locations', OWNER, h(async (req, res) => {
  res.json(await q(`SELECT u.id, u.name, u.role, l.lat, l.lng, l.at, l.kind, a.check_in, a.check_out,
    (SELECT title FROM jobs j WHERE j.technician_id=u.id AND j.status IN ('on_the_way','in_progress') LIMIT 1) on_job
    FROM users u LEFT JOIN LATERAL (SELECT * FROM locations x WHERE x.user_id=u.id ORDER BY at DESC LIMIT 1) l ON true
    LEFT JOIN attendance a ON a.user_id=u.id AND a.day=CURRENT_DATE WHERE u.active AND u.role<>'owner' ORDER BY u.role, u.name`));
}));
r.get('/team/locations/:uid', OWNER, h(async (req, res) => {
  const day = req.query.date || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  res.json(await q(`SELECT lat,lng,at,kind,note,accuracy FROM locations WHERE user_id=$1 AND (at AT TIME ZONE 'Asia/Kolkata')::date=$2 ORDER BY at`, [req.params.uid, day]));
}));
r.get('/attendance', OWNER, h(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), to = req.query.to || new Date().toISOString().slice(0, 10);
  const rows = await q(`SELECT a.*, u.name, u.role, round((extract(epoch FROM (coalesce(a.check_out, CASE WHEN a.day=CURRENT_DATE THEN now() END) - a.check_in))/3600)::numeric,1)::float hours
    FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.day BETWEEN $1 AND $2 ${req.query.user ? 'AND a.user_id=' + +req.query.user : ''} ORDER BY a.day DESC, u.name`, [from, to]);
  if (req.query.format === 'csv') { res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="attendance-${from}-to-${to}.csv"`); return res.send('\uFEFF' + toCsv(rows.map(r => ({ date: r.day, name: r.name, role: r.role, check_in: r.check_in, check_out: r.check_out, hours: r.hours, in_location: r.location, out_location: r.out_location })))); }
  res.json(rows);
}));
r.get('/customers/:id/sites', OS, h(async (req, res) => res.json(await q('SELECT * FROM customer_sites WHERE customer_id=$1 ORDER BY id', [req.params.id]))));
r.post('/customers/:id/sites', OS, h(async (req, res) => { const d = req.body; res.json(await one('INSERT INTO customer_sites(customer_id,name,address,city,contact,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [req.params.id, d.name, d.address, d.city, d.contact, normPhone(d.phone) || null])); }));
r.delete('/customers/:id/sites/:sid', OS, h(async (req, res) => { await q('DELETE FROM customer_sites WHERE id=$1 AND customer_id=$2', [req.params.sid, req.params.id]); res.json({ ok: true }); }));

// ---------- Notifications ----------
r.get('/notifications', h(async (req, res) => {
  res.json({ items: await q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]),
    unread: +(await one('SELECT count(*) c FROM notifications WHERE user_id=$1 AND NOT read', [req.user.id])).c });
}));
r.post('/notifications/read', h(async (req, res) => { await q('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]); res.json({ ok: true }); }));

// ---------- Dashboard ----------
r.get('/dashboard', h(async (req, res) => {
  const u = req.user;
  if (u.role === 'tech') {
    const jobs = await q(`SELECT j.*, c.name cname, c.phone cphone FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id WHERE j.technician_id=$1 AND j.status NOT IN ('closed','cancelled') ORDER BY (j.status='completed'), j.scheduled_at NULLS LAST`, [u.id]);
    const done = await one(`SELECT count(*) c, coalesce(sum(collected),0) s FROM jobs WHERE technician_id=$1 AND status='completed' AND date_trunc('month',completed_at)=date_trunc('month',now())`, [u.id]);
    return res.json({ role: 'tech', jobs, completed_month: +done.c, collected_month: +done.s });
  }
  const own = u.role === 'sales' ? ' AND owner_id=' + u.id : '';
  const ownQ = u.role === 'sales' ? ' AND user_id=' + u.id : '';
  const k = await one(`SELECT
    (SELECT count(*)::int FROM leads WHERE created_at::date=CURRENT_DATE ${own}) leads_today,
    (SELECT count(*)::int FROM leads WHERE created_at::date=CURRENT_DATE AND source='whatsapp' ${own}) leads_today_wa,
    (SELECT count(*)::int FROM followups WHERE NOT done AND due_at::date<=CURRENT_DATE ${ownQ}) fu_due,
    (SELECT count(*)::int FROM followups WHERE NOT done AND due_at<now() ${ownQ}) fu_overdue,
    (SELECT count(*)::int FROM quotations WHERE date_trunc('month',created_at)=date_trunc('month',now()) ${ownQ}) quotes_month,
    (SELECT coalesce(sum(total),0) FROM quotations WHERE date_trunc('month',created_at)=date_trunc('month',now()) ${ownQ}) quotes_value,
    (SELECT coalesce(sum(total),0) FROM orders WHERE status<>'cancelled' AND date_trunc('month',created_at)=date_trunc('month',now()) ${ownQ}) sales_month,
    (SELECT coalesce(sum(total),0) FROM orders WHERE status<>'cancelled' AND date_trunc('month',created_at)=date_trunc('month',now()-interval '1 month') ${ownQ}) sales_prev,
    (SELECT coalesce(sum(total-paid),0) FROM invoices WHERE total-paid>1) dues,
    (SELECT count(*)::int FROM invoices WHERE total-paid>1) dues_count,
    (SELECT coalesce(sum(amount),0) FROM payments WHERE date_trunc('month',date)=date_trunc('month',now())) collected_month,
    (SELECT count(*)::int FROM products WHERE min_stock>0 AND stock-reserved<min_stock) low_stock,
    (SELECT count(*)::int FROM quotations WHERE status IN ('pending_approval','sent') ${ownQ}) pending_quotes,
    (SELECT count(*)::int FROM jobs WHERE kind='installation' AND status NOT IN ('completed','closed','cancelled')) pending_installs,
    (SELECT count(*)::int FROM jobs WHERE kind<>'installation' AND status NOT IN ('completed','closed','cancelled')) pending_tickets,
    (SELECT count(*)::int FROM amcs WHERE status='active' AND end_date < CURRENT_DATE + 30) amc_expiring,
    (SELECT coalesce(sum(stock*buy_price),0) FROM products) stock_value`);
  const funnel = await q(`SELECT stage, count(*)::int c FROM leads WHERE date_trunc('month',created_at)=date_trunc('month',now()) ${own} GROUP BY stage`);
  const sources = await q(`SELECT source, count(*)::int c FROM leads WHERE created_at > now()-interval '30 days' ${own} GROUP BY source ORDER BY c DESC`);
  const followups = await q(`SELECT f.*, l.name, l.need, l.stage FROM followups f JOIN leads l ON l.id=f.lead_id WHERE NOT f.done ${ownQ.replace('user_id', 'f.user_id')} ORDER BY f.due_at LIMIT 8`);
  const top = await q(`SELECT p.id, p.name, p.art, sum(oi.qty)::int qty FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
    WHERE o.status<>'cancelled' AND date_trunc('month',o.created_at)=date_trunc('month',now()) GROUP BY p.id ORDER BY qty DESC LIMIT 5`);
  const team = u.role === 'owner' ? await q(`SELECT u.id, u.name, u.role,
      (SELECT count(*)::int FROM activities a WHERE a.user_id=u.id AND a.type='call' AND a.created_at::date=CURRENT_DATE)::int calls,
      (SELECT count(*)::int FROM quotations x WHERE x.user_id=u.id AND x.created_at::date=CURRENT_DATE)::int quotes,
      (SELECT count(*)::int FROM messages m WHERE m.user_id=u.id AND m.created_at::date=CURRENT_DATE)::int chats,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.kind='installation' AND j.completed_at::date=CURRENT_DATE)::int installs,
      (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.kind<>'installation' AND j.completed_at::date=CURRENT_DATE)::int services,
      (SELECT check_in FROM attendance a WHERE a.user_id=u.id AND a.day=CURRENT_DATE) check_in
    FROM users u WHERE u.active AND u.role<>'owner' ORDER BY u.role, u.name`) : [];
  res.json({ role: u.role, k, funnel, sources, followups, top, team });
}));

// ---------- Global search ----------
r.get('/search', h(async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  if (!req.query.q) return res.json([]);
  const own = req.user.role === 'sales' ? ` AND owner_id=${req.user.id}` : '';
  const out = [];
  if (req.user.role !== 'tech') {
    (await q(`SELECT id,name,need,phone FROM leads WHERE (name ILIKE $1 OR phone ILIKE $1 OR company ILIKE $1) ${own} LIMIT 6`, [s])).forEach(x => out.push({ type: 'Lead', label: x.name, sub: x.need || x.phone, link: `#/leads/${x.id}` }));
    (await q(`SELECT id,name,phone,company FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 OR company ILIKE $1 LIMIT 5`, [s])).forEach(x => out.push({ type: 'Customer', label: x.name, sub: x.company || x.phone, link: `#/customers/${x.id}` }));
    (await q(`SELECT id,number,total FROM quotations WHERE number ILIKE $1 LIMIT 4`, [s])).forEach(x => out.push({ type: 'Quotation', label: x.number, sub: W.inr(x.total), link: `#/quotations/${x.id}` }));
    (await q(`SELECT i.id,i.number,i.total,i.order_id FROM invoices i WHERE number ILIKE $1 LIMIT 4`, [s])).forEach(x => out.push({ type: 'Invoice', label: x.number, sub: W.inr(x.total), link: `#/orders/${x.order_id}` }));
  }
  (await q(`SELECT s.serial,p.name FROM serials s LEFT JOIN products p ON p.id=s.product_id WHERE serial ILIKE $1 LIMIT 4`, [s])).forEach(x => out.push({ type: 'Serial', label: x.serial, sub: x.name, link: `#/serial/${encodeURIComponent(x.serial)}` }));
  (await q(`SELECT id,name,sku FROM products WHERE name ILIKE $1 OR sku ILIKE $1 LIMIT 4`, [s])).forEach(x => out.push({ type: 'Product', label: x.name, sub: x.sku, link: `#/stock` }));
  res.json(out);
}));

// ---------- Leads ----------
async function getLeadChecked(req, id) {
  const lead = await one('SELECT * FROM leads WHERE id=$1', [id]);
  if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
  if (req.user.role === 'sales' && lead.owner_id !== req.user.id) throw Object.assign(new Error('This lead is assigned to someone else'), { status: 403 });
  if (req.user.role === 'tech') throw Object.assign(new Error('Not permitted'), { status: 403 });
  return lead;
}
r.get('/leads', OS, h(async (req, res) => {
  const w = ['1=1'], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.split('?').join('$' + p.length)); };
  if (req.user.role === 'sales') add('l.owner_id=?', req.user.id);
  else if (req.query.owner) add('l.owner_id=?', +req.query.owner);
  if (req.query.stage) add('l.stage=?', req.query.stage);
  if (req.query.category) add('l.category=?', req.query.category);
  if (req.query.source) add('l.source=?', req.query.source);
  if (req.query.q) add(`(l.name ILIKE ? OR l.phone ILIKE ? OR l.need ILIKE ? OR l.company ILIKE ?)`, `%${req.query.q}%`);
  const rows = await q(`SELECT l.*, u.name owner_name, (SELECT min(due_at) FROM followups f WHERE f.lead_id=l.id AND NOT f.done) next_fu
    FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE ${w.join(' AND ')} ORDER BY l.updated_at DESC LIMIT 500`, p);
  const cats = await q(`SELECT category, count(*)::int c FROM leads l WHERE ${req.user.role === 'sales' ? 'owner_id=' + req.user.id : '1=1'} GROUP BY category`);
  res.json({ rows, cats });
}));
r.post('/leads', OS, h(async (req, res) => {
  const d = req.body;
  if (!d.name || !(d.phone || d.email)) return res.status(400).json({ error: 'Name and mobile/email required' });
  const owner = req.user.role === 'sales' ? req.user.id : (d.owner_id || null);
  const result = await captureLead({ ...d, owner_id: owner, userId: req.user.id, source: d.source || 'walkin' });
  await audit(req, 'create', 'lead', result.lead.id);
  res.json(result);
}));
r.get('/leads/:id', OS, h(async (req, res) => {
  const lead = await getLeadChecked(req, req.params.id);
  const [acts, fus, quotes, msgs, owner, product] = await Promise.all([
    q('SELECT a.*, u.name uname FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE lead_id=$1 ORDER BY a.id DESC', [lead.id]),
    q('SELECT f.*, u.name uname FROM followups f LEFT JOIN users u ON u.id=f.user_id WHERE lead_id=$1 ORDER BY due_at DESC', [lead.id]),
    q('SELECT id,number,total,status,opened_count,created_at FROM quotations WHERE lead_id=$1 ORDER BY id DESC', [lead.id]),
    q(`SELECT * FROM messages WHERE lead_id=$1 OR ($2<>'' AND right(phone,10)=$2) ORDER BY id DESC LIMIT 30`, [lead.id, last10(lead.phone)]),
    lead.owner_id ? one('SELECT id,name FROM users WHERE id=$1', [lead.owner_id]) : null,
    lead.product_id ? one('SELECT id,name,price FROM products WHERE id=$1', [lead.product_id]) : null,
  ]);
  res.json({ lead, activities: acts, followups: fus, quotations: quotes, messages: msgs.reverse(), owner, product });
}));
r.patch('/leads/:id', OS, h(async (req, res) => {
  const lead = await getLeadChecked(req, req.params.id);
  const fields = ['name', 'company', 'phone', 'email', 'city', 'need', 'category', 'quantity', 'budget', 'stage', 'priority', 'value', 'lost_reason', 'score'];
  if (req.user.role === 'owner') fields.push('owner_id');
  const set = [], p = [lead.id];
  for (const f of fields) if (f in req.body) { p.push(req.body[f] === '' ? null : req.body[f]); set.push(`${f}=?`); }
  if (!set.length) return res.json(lead);
  const upd = await one(`UPDATE leads SET ${set.join(',')}, updated_at=now() WHERE id=$1 RETURNING *`, p);
  if (req.body.stage && req.body.stage !== lead.stage) {
    await addActivity(lead.id, 'stage', `Stage: ${lead.stage} → ${req.body.stage}${req.body.lost_reason ? ' (' + req.body.lost_reason + ')' : ''}`, req.user.id);
    if (['won', 'lost'].includes(req.body.stage)) await q('UPDATE followups SET done=true, done_at=now() WHERE lead_id=$1 AND NOT done', [lead.id]);
  }
  if (req.body.owner_id && +req.body.owner_id !== lead.owner_id) {
    const u = await one('SELECT name FROM users WHERE id=$1', [req.body.owner_id]);
    await addActivity(lead.id, 'system', `Transferred to ${u ? u.name : '-'}`, req.user.id);
    await q('UPDATE followups SET user_id=$2 WHERE lead_id=$1 AND NOT done', [lead.id, req.body.owner_id]);
    require('../notify').notifyUser(+req.body.owner_id, `Lead transferred to you: ${lead.name}`, lead.need || '', `/crm#/leads/${lead.id}`);
  }
  if (upd.customer_id) await q('UPDATE customers SET name=coalesce($2,name), company=coalesce($3,company), email=coalesce($4,email), city=coalesce($5,city) WHERE id=$1',
    [upd.customer_id, req.body.name || null, req.body.company || null, req.body.email || null, req.body.city || null]);
  await audit(req, 'update', 'lead', lead.id, req.body);
  res.json(upd);
}));
r.post('/leads/:id/activity', OS, h(async (req, res) => {
  const lead = await getLeadChecked(req, req.params.id);
  const type = ['call', 'whatsapp', 'visit', 'note', 'email'].includes(req.body.type) ? req.body.type : 'note';
  await addActivity(lead.id, type, req.body.body || type, req.user.id, req.body.meta);
  if (lead.stage === 'new' && type !== 'note') await q(`UPDATE leads SET stage='contacted', updated_at=now() WHERE id=$1`, [lead.id]);
  if (type === 'visit' && ['new', 'contacted'].includes(lead.stage)) await q(`UPDATE leads SET stage='demo' WHERE id=$1`, [lead.id]);
  if (req.body.close_followups) await q('UPDATE followups SET done=true, done_at=now() WHERE lead_id=$1 AND NOT done AND due_at<=now()+interval \'1 hour\'', [lead.id]);
  res.json({ ok: true });
}));
r.post('/leads/:id/followups', OS, h(async (req, res) => {
  const lead = await getLeadChecked(req, req.params.id);
  if (!req.body.due_at) return res.status(400).json({ error: 'Date/time required' });
  const f = await one('INSERT INTO followups(lead_id,user_id,due_at,type,note,auto_nudge) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [lead.id, lead.owner_id || req.user.id, req.body.due_at, req.body.type || 'call', req.body.note || null, req.body.auto_nudge !== false]);
  await q('UPDATE leads SET next_followup_at=$2 WHERE id=$1', [lead.id, req.body.due_at]);
  await addActivity(lead.id, 'system', `Follow-up scheduled: ${new Date(req.body.due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · ${req.body.type || 'call'}${req.body.note ? ' — ' + req.body.note : ''}`, req.user.id);
  res.json(f);
}));
r.get('/followups', OS, h(async (req, res) => {
  const mine = req.user.role === 'sales' ? `AND f.user_id=${req.user.id}` : (req.query.user ? `AND f.user_id=${+req.query.user}` : '');
  const rows = await q(`SELECT f.*, l.name, l.phone, l.need, l.stage, l.priority, l.value, u.name uname FROM followups f JOIN leads l ON l.id=f.lead_id LEFT JOIN users u ON u.id=f.user_id
    WHERE NOT f.done ${mine} ORDER BY f.due_at LIMIT 300`);
  res.json(rows);
}));
r.patch('/followups/:id', OS, h(async (req, res) => {
  const f = await one('SELECT * FROM followups WHERE id=$1', [req.params.id]);
  if (!f || (req.user.role === 'sales' && f.user_id !== req.user.id)) return res.status(403).json({ error: 'Not permitted' });
  const u = await one('UPDATE followups SET done=coalesce($2,done), done_at=CASE WHEN $2 THEN now() END, due_at=coalesce($3,due_at), reminded=CASE WHEN $3 IS NOT NULL THEN false ELSE reminded END WHERE id=$1 RETURNING *',
    [f.id, req.body.done == null ? null : !!req.body.done, req.body.due_at || null]);
  if (req.body.done) await addActivity(f.lead_id, 'system', `Follow-up done${req.body.outcome ? ': ' + req.body.outcome : ''}`, req.user.id);
  res.json(u);
}));

// ---------- WhatsApp / omni inbox ----------
r.get('/inbox', OS, h(async (req, res) => {
  const own = req.user.role === 'sales' ? `AND (l.owner_id=${req.user.id})` : '';
  const rows = await q(`SELECT DISTINCT ON (m.phone) m.phone, m.body, m.created_at, m.direction, l.id lead_id, l.name, l.owner_id,
      (SELECT count(*)::int FROM messages x WHERE x.phone=m.phone AND x.direction='in' AND NOT x.read)::int unread
    FROM messages m LEFT JOIN leads l ON l.id=m.lead_id WHERE m.channel='whatsapp' ${own} ORDER BY m.phone, m.id DESC`);
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(rows);
}));
r.get('/inbox/:phone', OS, h(async (req, res) => {
  const phone = normPhone(req.params.phone);
  const lead = await one(`SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE right(regexp_replace(coalesce(l.phone,''),'\\D','','g'),10)=$1 ORDER BY l.id DESC LIMIT 1`, [last10(phone)]);
  if (req.user.role === 'sales' && (!lead || lead.owner_id !== req.user.id)) return res.status(403).json({ error: 'Chat belongs to another salesperson' });
  const msgs = await q('SELECT m.*, u.name uname FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.phone=$1 ORDER BY m.id', [phone]);
  await q(`UPDATE messages SET read=true WHERE phone=$1 AND direction='in'`, [phone]);
  const quick = (await getSettings()).quick_replies;
  res.json({ lead, messages: msgs, quick_replies: quick ? JSON.parse(quick) : [] });
}));
r.post('/inbox/:phone', OS, h(async (req, res) => {
  const phone = normPhone(req.params.phone);
  const lead = await one(`SELECT * FROM leads WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1 ORDER BY id DESC LIMIT 1`, [last10(phone)]);
  if (req.user.role === 'sales' && (!lead || lead.owner_id !== req.user.id)) return res.status(403).json({ error: 'Not permitted' });
  const out = await sendWhatsApp(phone, req.body.template ? { template: req.body.template, params: req.body.params } : { text: String(req.body.text || '').slice(0, 4000) }, { leadId: lead && lead.id, userId: req.user.id });
  if (lead && lead.stage === 'new') await q(`UPDATE leads SET stage='contacted' WHERE id=$1`, [lead.id]);
  res.json(out);
}));

// ---------- Customers ----------
r.get('/customers', OS, h(async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  const own = req.user.role === 'sales' ? `AND (EXISTS (SELECT 1 FROM leads l WHERE l.customer_id=c.id AND l.owner_id=${req.user.id}) OR EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.user_id=${req.user.id}))` : '';
  res.json(await q(`SELECT c.*, (SELECT coalesce(sum(total),0) FROM orders o WHERE o.customer_id=c.id AND o.status<>'cancelled') business,
    (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.customer_id=c.id) due
    FROM customers c WHERE (c.name ILIKE $1 OR c.phone ILIKE $1 OR c.company ILIKE $1) ${own} ORDER BY c.id DESC LIMIT 300`, [s]));
}));
r.post('/customers', OS, h(async (req, res) => {
  const d = req.body;
  res.json(await one('INSERT INTO customers(name,company,phone,email,city,address,gstin,type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [d.name, d.company, normPhone(d.phone) || null, d.email, d.city, d.address, d.gstin, d.type || 'retail']));
}));
r.patch('/customers/:id', OS, h(async (req, res) => {
  const d = req.body; const f = ['name', 'company', 'phone', 'email', 'city', 'address', 'gstin', 'type'];
  const set = [], p = [req.params.id];
  for (const k of f) if (k in d) { p.push(k === 'phone' ? normPhone(d[k]) : d[k]); set.push(`${k}=?`); }
  res.json(set.length ? await one(`UPDATE customers SET ${set.join(',')} WHERE id=$1 RETURNING *`, p) : {});
}));
r.get('/customers/:id', OS, h(async (req, res) => {
  const id = req.params.id;
  const c = await one('SELECT * FROM customers WHERE id=$1', [id]);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const [leads, quotes, orders, invoices, payments, jobs, serials, amcs] = await Promise.all([
    q('SELECT l.id,l.name,l.need,l.stage,l.source,l.created_at,u.name owner FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT id,number,total,status,created_at FROM quotations WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT id,number,total,status,created_at FROM orders WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT id,number,total,paid,date,due_date,order_id FROM invoices WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT id,number,amount,mode,date FROM payments WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT id,number,kind,title,issue,status,created_at FROM jobs WHERE customer_id=$1 ORDER BY id DESC', [id]),
    q('SELECT s.serial,s.warranty_until,p.name FROM serials s LEFT JOIN products p ON p.id=s.product_id WHERE s.customer_id=$1', [id]),
    q('SELECT * FROM amcs WHERE customer_id=$1 ORDER BY id DESC', [id]),
  ]);
  // Ledger: invoices debit, payments credit
  const ledger = [...invoices.map(i => ({ date: i.date, ref: i.number, debit: +i.total, credit: 0 })), ...payments.map(p => ({ date: p.date, ref: p.number || 'Payment', debit: 0, credit: +p.amount, mode: p.mode }))]
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  let bal = 0; ledger.forEach(l => { bal += l.debit - l.credit; l.balance = bal; });
  res.json({ customer: c, leads, quotes, orders, invoices, payments, jobs, serials, amcs, ledger });
}));

// ---------- Products (read for all roles) ----------
r.get('/products', h(async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  const cols = req.user.role === 'owner' ? 'p.*' : 'p.id,p.name,p.sku,p.price,p.mrp,p.gst_rate,p.stock,p.reserved,p.art,p.image_ids,p.category_id,p.warranty_months';
  res.json(await q(`SELECT ${cols}, c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.name ILIKE $1 OR p.sku ILIKE $1 ORDER BY p.best_seller DESC, p.name LIMIT 200`, [s]));
}));

// ---------- Quotations ----------
r.get('/quote-defaults', OS, h(async (req, res) => { const st = await getSettings(); res.json({ terms: st.quote_terms || '', delivery_terms: st.delivery_terms || '' }); }));
r.get('/quote-templates', OS, h(async (req, res) => res.json(await q('SELECT * FROM quote_templates ORDER BY name'))));
r.post('/quote-templates', OWNER, h(async (req, res) => res.json(await one('INSERT INTO quote_templates(name,items) VALUES($1,$2) RETURNING *', [req.body.name, JSON.stringify(req.body.items || [])]))));
r.delete('/quote-templates/:id', OWNER, h(async (req, res) => { await q('DELETE FROM quote_templates WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

r.get('/quotations', OS, h(async (req, res) => {
  const own = req.user.role === 'sales' ? `WHERE qt.user_id=${req.user.id}` : '';
  res.json(await q(`SELECT qt.*, c.name cname, c.company, u.name uname FROM quotations qt LEFT JOIN customers c ON c.id=qt.customer_id LEFT JOIN users u ON u.id=qt.user_id ${own} ORDER BY qt.id DESC LIMIT 300`));
}));
async function quoteChecked(req, id) {
  const qt = await one('SELECT * FROM quotations WHERE id=$1', [id]);
  if (!qt) throw Object.assign(new Error('Not found'), { status: 404 });
  if (req.user.role === 'sales' && qt.user_id !== req.user.id) throw Object.assign(new Error('Not your quotation'), { status: 403 });
  return qt;
}
r.get('/quotations/:id', OS, h(async (req, res) => {
  const qt = await quoteChecked(req, req.params.id);
  const items = await q(`SELECT qi.*, p.stock, p.reserved, p.art, p.image_ids FROM quotation_items qi LEFT JOIN products p ON p.id=qi.product_id WHERE quotation_id=$1 ORDER BY qi.id`, [qt.id]);
  const c = await one('SELECT * FROM customers WHERE id=$1', [qt.customer_id]);
  if (req.user.role !== 'owner') items.forEach(i => delete i.buy_rate);
  res.json({ quotation: req.user.role === 'owner' ? qt : { ...qt, margin: undefined }, items, customer: c, public_url: `${await W.baseUrl()}/q/${qt.token}` });
}));
r.post('/quotations', OS, h(async (req, res) => {
  if (req.body.lead_id) await getLeadChecked(req, req.body.lead_id);
  if (!req.body.customer_id && !req.body.lead_id) {
    if (!req.body.customer || !req.body.customer.name) return res.status(400).json({ error: 'Select a lead or customer' });
    const c = req.body.customer;
    req.body.customer_id = (await one('INSERT INTO customers(name,company,phone,email,city,gstin) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [c.name, c.company, normPhone(c.phone), c.email, c.city, c.gstin])).id;
  }
  const qt = await W.saveQuotation(req.body, req.user);
  await audit(req, 'create', 'quotation', qt.id);
  res.json(qt);
}));
r.put('/quotations/:id', OS, h(async (req, res) => { await quoteChecked(req, req.params.id); res.json(await W.saveQuotation({ ...req.body, id: +req.params.id }, req.user)); }));
r.post('/quotations/:id/approve', OWNER, h(async (req, res) => {
  const qt = await one(`UPDATE quotations SET status='approved', approved_by=$2 WHERE id=$1 AND status='pending_approval' RETURNING *`, [req.params.id, req.user.id]);
  if (qt) require('../notify').notifyUser(qt.user_id, `Quotation ${qt.number} approved`, 'You can now send it to the customer', `/crm#/quotations/${qt.id}`);
  await audit(req, 'approve', 'quotation', req.params.id);
  res.json(qt || { error: 'Not pending' });
}));
r.post('/quotations/:id/send', OS, h(async (req, res) => { await quoteChecked(req, req.params.id); res.json(await W.sendQuotation(req.params.id, req.user, req.body.channel)); }));
r.post('/quotations/:id/status', OS, h(async (req, res) => {
  const qt = await quoteChecked(req, req.params.id);
  if (!['accepted', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Bad status' });
  await q('UPDATE quotations SET status=$2 WHERE id=$1', [qt.id, req.body.status]);
  if (qt.lead_id) await addActivity(qt.lead_id, 'quote', `Customer ${req.body.status} ${qt.number}`, req.user.id);
  if (req.body.status === 'accepted' && (await W.isOn('quote_to_order'))) return res.json({ order: await W.convertToOrder(qt.id, req.user) });
  if (req.body.status === 'rejected' && qt.lead_id) await q(`UPDATE leads SET stage='negotiation' WHERE id=$1 AND stage='quotation'`, [qt.lead_id]);
  res.json({ ok: true });
}));
r.post('/quotations/:id/convert', OS, h(async (req, res) => { await quoteChecked(req, req.params.id); const o = await W.convertToOrder(+req.params.id, req.user); await audit(req, 'convert', 'quotation', req.params.id); res.json(o); }));
r.get('/quotations/:id/pdf', OS, h(async (req, res) => { await quoteChecked(req, req.params.id); await pdf.quotationPdf(res, req.params.id); }));

// ---------- Orders & invoices ----------
r.get('/orders', OS, h(async (req, res) => {
  const own = req.user.role === 'sales' ? `WHERE o.user_id=${req.user.id}` : '';
  const rows = await q(`SELECT o.*, c.name cname, t.name tech, i.number inv, i.id inv_id, i.paid,
     (SELECT string_agg(qty::int || '× ' || description, ', ') FROM order_items WHERE order_id=o.id) items_text
     FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users t ON t.id=o.technician_id LEFT JOIN invoices i ON i.order_id=o.id ${own} ORDER BY o.id DESC LIMIT 300`);
  const k = await one(`SELECT count(*)::int n, coalesce(sum(total),0) v, coalesce(avg(total),0) avg FROM orders WHERE status<>'cancelled' AND date_trunc('month',created_at)=date_trunc('month',now()) ${own ? 'AND user_id=' + req.user.id : ''}`);
  const k2 = await one(`SELECT count(*)::int n FROM orders WHERE status IN ('confirmed','scheduled','partially_delivered') ${own ? 'AND user_id=' + req.user.id : ''}`);
  const k3 = await one(`SELECT count(*)::int n, coalesce(sum(total-paid),0) v FROM invoices WHERE total-paid>1`);
  res.json({ rows, k: { ...k, to_deliver: k2.n, inv_due: k3.n, inv_due_v: k3.v } });
}));
r.get('/orders/:id', h(async (req, res) => {
  const o = await one('SELECT o.*, c.name cname, c.phone cphone, c.address, c.city FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=$1', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'sales' && o.user_id !== req.user.id) return res.status(403).json({ error: 'Not permitted' });
  if (req.user.role === 'tech' && o.technician_id !== req.user.id) return res.status(403).json({ error: 'Not permitted' });
  const [items, invoices, payments, jobs, serials] = await Promise.all([
    q('SELECT oi.*, p.stock, p.serial_tracked FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE order_id=$1 ORDER BY oi.id', [o.id]),
    q('SELECT * FROM invoices WHERE order_id=$1', [o.id]), q('SELECT * FROM payments WHERE order_id=$1 ORDER BY id', [o.id]),
    q('SELECT j.*, u.name tech FROM jobs j LEFT JOIN users u ON u.id=j.technician_id WHERE order_id=$1', [o.id]),
    q('SELECT s.serial, p.name FROM serials s LEFT JOIN products p ON p.id=s.product_id WHERE s.order_id=$1', [o.id])]);
  if (req.user.role !== 'owner') { delete o.margin; items.forEach(i => delete i.buy_rate); }
  res.json({ order: o, items, invoices, payments, jobs, serials, pay_link: await W.payLink(o.id) });
}));
r.post('/orders', OS, h(async (req, res) => { // direct order (walk-in counter sale) = quick quote + convert
  const qt = await W.saveQuotation({ ...req.body, payment_terms: req.body.payment_terms || '100% advance' }, req.user);
  if (qt.status === 'pending_approval') return res.json({ quotation: qt, pending: true });
  res.json(await W.convertToOrder(qt.id, req.user));
}));
r.patch('/orders/:id', OS, h(async (req, res) => {
  const o = await one('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  if (!o || (req.user.role === 'sales' && o.user_id !== req.user.id)) return res.status(403).json({ error: 'Not permitted' });
  if (req.body.status === 'cancelled') {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Only owner can cancel orders' });
    const items = await q('SELECT * FROM order_items WHERE order_id=$1', [o.id]);
    for (const i of items) if (i.product_id) await q('UPDATE products SET reserved=GREATEST(0,reserved-$2) WHERE id=$1', [i.product_id, +i.qty - +i.delivered_qty]);
  }
  const u = await one(`UPDATE orders SET status=coalesce($2,status), delivery_date=coalesce($3,delivery_date), technician_id=coalesce($4,technician_id), notes=coalesce($5,notes) WHERE id=$1 RETURNING *`,
    [o.id, req.body.status || null, req.body.delivery_date || null, req.body.technician_id || null, req.body.notes || null]);
  if (req.body.technician_id) await q(`UPDATE jobs SET technician_id=$2, status=CASE WHEN status='open' THEN 'assigned' ELSE status END WHERE order_id=$1 AND status NOT IN ('completed','closed')`, [o.id, req.body.technician_id]);
  if (req.body.status === 'confirmed') await W.createInstallJob(o.id);
  await audit(req, 'update', 'order', o.id, req.body);
  res.json(u);
}));
r.post('/orders/:id/deliver', OS, h(async (req, res) => res.json(await W.deliverOrder(+req.params.id, req.body.items, req.user))));
r.post('/orders/:id/install-job', OS, h(async (req, res) => res.json(await W.createInstallJob(+req.params.id))));
r.get('/invoices/:id/pdf', h(async (req, res) => {
  if (req.user.role === 'tech') { const ok = await one('SELECT 1 FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.id=$1 AND o.technician_id=$2', [req.params.id, req.user.id]); if (!ok) return res.status(403).end(); }
  await pdf.invoicePdf(res, req.params.id);
}));

// ---------- Payments & dues ----------
r.get('/payments/dues', OS, h(async (req, res) => {
  const own = req.user.role === 'sales' ? `AND o.user_id=${req.user.id}` : '';
  const rows = await q(`SELECT i.*, c.name cname, c.phone, o.number order_no, o.status ostatus, (CURRENT_DATE - i.due_date) od FROM invoices i
    LEFT JOIN customers c ON c.id=i.customer_id LEFT JOIN orders o ON o.id=i.order_id WHERE i.total-i.paid>1 ${own} ORDER BY i.due_date`);
  const k = await one(`SELECT coalesce(sum(total-paid),0) total, coalesce(sum(CASE WHEN due_date<CURRENT_DATE THEN total-paid END),0) overdue FROM invoices WHERE total-paid>1`);
  res.json({ rows, k });
}));
r.get('/payments', OS, h(async (req, res) => {
  const own = req.user.role === 'sales' ? `WHERE p.user_id=${req.user.id}` : '';
  res.json(await q(`SELECT p.*, c.name cname, i.number inv, u.name uname FROM payments p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN invoices i ON i.id=p.invoice_id LEFT JOIN users u ON u.id=p.user_id ${own} ORDER BY p.id DESC LIMIT 300`));
}));
r.post('/payments', h(async (req, res) => {
  if (req.user.role === 'tech') { // technicians may only collect against their own jobs/orders
    const ok = await one('SELECT 1 FROM jobs WHERE technician_id=$1 AND (order_id=$2 OR id=$3)', [req.user.id, req.body.order_id || 0, req.body.job_id || 0]);
    if (!ok) return res.status(403).json({ error: 'Payment entry only for your assigned jobs' });
  }
  const p = await W.recordPayment(req.body, req.user);
  await audit(req, 'create', 'payment', p.id, { amount: p.amount });
  res.json(p);
}));
r.post('/payments/remind/:invoiceId', OS, h(async (req, res) => {
  const i = await one('SELECT i.*, c.name, c.phone FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=$1', [req.params.invoiceId]);
  if (!i) return res.status(404).json({ error: 'Not found' });
  const s = await getSettings();
  const od = Math.floor((Date.now() - new Date(i.due_date)) / 864e5);
  const text = `🙏 Namaste ${i.name} ji, invoice ${i.number} ka ${W.inr(i.total - i.paid)} ${od > 0 ? od + ' din se pending hai' : 'due hai'}. Pay karein: ${await W.payLink(i.order_id)} (UPI / card / netbanking) — ${s.company_name || 'IT Paradise'}`;
  res.json(await sendWhatsApp(i.phone, { text }, { userId: req.user.id }));
}));
r.get('/payments/:id/receipt', OS, h(async (req, res) => pdf.receiptPdf(res, req.params.id)));

// ---------- Stock, purchase, suppliers, serials ----------
r.get('/stock', OS, h(async (req, res) => {
  const rows = await q(`SELECT p.id,p.name,p.sku,p.art,p.stock,p.reserved,p.min_stock,${req.user.role === 'owner' ? 'p.buy_price,' : ''}p.price,c.name category,
    CASE WHEN p.min_stock>0 AND p.stock-p.reserved<p.min_stock THEN 'reorder' ELSE 'ok' END status FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY (p.min_stock>0 AND p.stock-p.reserved<p.min_stock) DESC, p.name`);
  const sugg = req.user.role === 'owner' ? await q(`SELECT p.id, p.name, GREATEST(p.min_stock*2 - (p.stock-p.reserved), 1)::int qty, p.buy_price FROM products p WHERE p.min_stock>0 AND p.stock-p.reserved<p.min_stock ORDER BY p.name`) : [];
  res.json({ rows, suggestions: sugg });
}));
r.post('/stock/adjust', OWNER, h(async (req, res) => {
  const { product_id, qty, note, reason, serial } = req.body;
  await q('UPDATE products SET stock=stock+$2 WHERE id=$1', [product_id, +qty]);
  await q(`INSERT INTO stock_moves(product_id,qty,kind,note,user_id,reason) VALUES($1,$2,'adjust',$3,$4,$5)`, [product_id, +qty, note, req.user.id, reason || null]);
  if (serial) { const st = { defective: 'defective', returned: 'in_stock', replacement: 'replaced', damaged: 'defective' }[reason] || null;
    if (st) await q(`INSERT INTO serials(serial,product_id,status) VALUES(upper($1),$2,$3) ON CONFLICT(serial) DO UPDATE SET status=$3`, [serial, product_id, st]); }
  await audit(req, 'adjust', 'stock', product_id, { qty, note });
  res.json({ ok: true });
}));
r.get('/stock/moves', OWNER, h(async (req, res) => res.json(await q(`SELECT m.*, p.name FROM stock_moves m JOIN products p ON p.id=m.product_id ${req.query.reason ? 'WHERE m.reason=$1' : ''} ORDER BY m.id DESC LIMIT 300`, req.query.reason ? [req.query.reason] : []))));
r.get('/suppliers', OWNER, h(async (req, res) => res.json(await q(`SELECT s.*, (SELECT coalesce(sum(total),0) FROM purchases p WHERE p.supplier_id=s.id) billed,
  (SELECT coalesce(sum(amount),0) FROM supplier_payments sp WHERE sp.supplier_id=s.id) paid FROM suppliers s ORDER BY name`))));
r.post('/suppliers', OWNER, h(async (req, res) => { const d = req.body; res.json(await one('INSERT INTO suppliers(name,phone,email,gstin,address) VALUES($1,$2,$3,$4,$5) RETURNING *', [d.name, normPhone(d.phone) || null, d.email, d.gstin, d.address])); }));
r.patch('/suppliers/:id', OWNER, h(async (req, res) => { const d = req.body; res.json(await one('UPDATE suppliers SET name=coalesce($2,name),phone=coalesce($3,phone),email=coalesce($4,email),gstin=coalesce($5,gstin),address=coalesce($6,address) WHERE id=$1 RETURNING *', [req.params.id, d.name, d.phone, d.email, d.gstin, d.address])); }));
r.post('/suppliers/:id/payment', OWNER, h(async (req, res) => res.json(await one('INSERT INTO supplier_payments(supplier_id,amount,mode,reference) VALUES($1,$2,$3,$4) RETURNING *', [req.params.id, +req.body.amount, req.body.mode, req.body.reference]))));
r.get('/purchases', OWNER, h(async (req, res) => res.json(await q('SELECT p.*, s.name supplier FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC LIMIT 200'))));
r.post('/purchases', OWNER, h(async (req, res) => { const pb = await W.stockIn(req.body, req.user); await audit(req, 'create', 'purchase', pb.id); res.json(pb); }));
r.get('/purchase-orders', OWNER, h(async (req, res) => res.json(await q(`SELECT po.*, s.name supplier, (SELECT json_agg(json_build_object('product_id',i.product_id,'name',p.name,'qty',i.qty,'rate',i.rate)) FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE i.po_id=po.id) items FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id ORDER BY po.id DESC`))));
r.post('/purchase-orders', OWNER, h(async (req, res) => {
  const items = req.body.items || [];
  const po = await tx(async (c) => {
    const n = await nextNumber('PO');
    const po = await c.one('INSERT INTO purchase_orders(number,supplier_id,total,notes) VALUES($1,$2,$3,$4) RETURNING *', [n, req.body.supplier_id || null, items.reduce((a, i) => a + i.qty * i.rate, 0), req.body.notes]);
    for (const i of items) await c.q('INSERT INTO purchase_order_items(po_id,product_id,qty,rate) VALUES($1,$2,$3,$4)', [po.id, i.product_id, i.qty, i.rate]);
    return po;
  });
  res.json(po);
}));
r.get('/purchase-orders/:id/pdf', OWNER, h(async (req, res) => pdf.poPdf(res, req.params.id)));
r.post('/purchase-orders/:id/send', OWNER, h(async (req, res) => {
  const po = await one('SELECT po.*, s.phone, s.name FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=$1', [req.params.id]);
  const items = await q('SELECT p.name, i.qty FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE po_id=$1', [po.id]);
  const s = await getSettings();
  const out = await sendWhatsApp(po.phone, { text: `Purchase order ${po.number} from ${s.company_name || 'IT Paradise'}:\n${items.map(i => `• ${i.name} × ${i.qty}`).join('\n')}\nPlease confirm availability & dispatch.` }, { userId: req.user.id });
  await q(`UPDATE purchase_orders SET status='sent' WHERE id=$1 AND status='draft'`, [po.id]);
  res.json(out);
}));
r.get('/serials/:serial', h(async (req, res) => {
  const s = await one(`SELECT s.*, p.name product, c.name customer, pb.number purchase_no, pb.bill_date, o.number order_no FROM serials s LEFT JOIN products p ON p.id=s.product_id
    LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN purchases pb ON pb.id=s.purchase_id LEFT JOIN orders o ON o.id=s.order_id WHERE upper(s.serial)=upper($1)`, [req.params.serial]);
  if (!s) return res.status(404).json({ error: 'Serial not found' });
  const jobs = await q(`SELECT number,kind,status,created_at FROM jobs WHERE id=$1 OR (customer_id=$2 AND kind='service') ORDER BY id DESC LIMIT 10`, [s.job_id || 0, s.customer_id || 0]);
  res.json({ ...s, jobs });
}));

// ---------- Service, installation & AMC ----------
async function jobChecked(req, id) {
  const j = await one('SELECT * FROM jobs WHERE id=$1', [id]);
  if (!j) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (req.user.role === 'tech' && j.technician_id !== req.user.id) throw Object.assign(new Error('Job not assigned to you'), { status: 403 });
  return j;
}
r.get('/jobs', h(async (req, res) => {
  const w = [];
  if (req.user.role === 'tech') w.push('j.technician_id=' + req.user.id);
  if (req.query.kind === 'installation') w.push(`j.kind='installation'`);
  else if (req.query.kind === 'service') w.push(`j.kind<>'installation'`);
  else if (req.query.kind === 'carry_in') w.push(`j.kind='carry_in'`);
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const rows = await q(`SELECT j.*, c.name cname, c.phone cphone, u.name tech, o.number order_no FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id
    LEFT JOIN users u ON u.id=j.technician_id LEFT JOIN orders o ON o.id=j.order_id ${where} ORDER BY (j.status IN ('completed','closed','cancelled')), j.id DESC LIMIT 300`);
  const k = await one(`SELECT (SELECT count(*)::int FROM amcs WHERE status='active')::int active_amc,
     (SELECT count(*)::int FROM amcs WHERE status='active' AND end_date < CURRENT_DATE+30)::int renewals, (SELECT coalesce(sum(amount),0) FROM amcs WHERE status='active' AND end_date < CURRENT_DATE+30) renewals_v,
     (SELECT count(*)::int FROM jobs WHERE kind='preventive' AND status NOT IN ('completed','closed'))::int preventive,
     (SELECT coalesce(round(avg(extract(epoch FROM completed_at-created_at)/3600)::numeric,1),0) FROM jobs WHERE completed_at IS NOT NULL AND kind='service') avg_hr`);
  res.json({ rows, k });
}));
r.get('/jobs/:id', h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const c = j.customer_id ? await one('SELECT * FROM customers WHERE id=$1', [j.customer_id]) : null;
  const items = j.order_id ? await q('SELECT oi.description, oi.qty, oi.product_id, p.serial_tracked FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE order_id=$1', [j.order_id]) : [];
  const serials = await q('SELECT s.serial, p.name FROM serials s LEFT JOIN products p ON p.id=s.product_id WHERE s.job_id=$1 OR ($2::int IS NOT NULL AND s.order_id=$2)', [j.id, j.order_id]);
  const order = j.order_id ? await one('SELECT o.number, o.total, (SELECT coalesce(sum(amount),0) FROM payments WHERE order_id=o.id) paid FROM orders o WHERE id=$1', [j.order_id]) : null;
  const tech = j.technician_id ? await one('SELECT id,name,phone FROM users WHERE id=$1', [j.technician_id]) : null;
  const history = c ? await q(`SELECT number,kind,title,issue,status,created_at FROM jobs WHERE customer_id=$1 AND id<>$2 ORDER BY id DESC LIMIT 10`, [c.id, j.id]) : [];
  const parts = await q('SELECT * FROM job_parts WHERE job_id=$1 ORDER BY id', [j.id]);
  const linked = await q('SELECT id, number, status, title FROM jobs WHERE parent_job_id=$1 OR id=$2', [j.id, j.parent_job_id || 0]);
  const out = { job: j, customer: c, items, serials, order, tech, history, parts, linked };
  if (req.user.role === 'tech') delete out.job.otp; // technician must get OTP from customer
  res.json(out);
}));
r.post('/jobs', OS, h(async (req, res) => {
  const d = req.body;
  let custId = d.customer_id;
  if (!custId && d.phone) {
    const c = await one(`SELECT id FROM customers WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1`, [last10(d.phone)]);
    custId = c ? c.id : (await one('INSERT INTO customers(name,phone,city,address,company) VALUES($1,$2,$3,$4,$5) RETURNING id', [d.name || 'Customer', normPhone(d.phone), d.city, d.address, d.company || null])).id;
  }
  const kind = ['installation', 'service', 'preventive', 'carry_in'].includes(d.kind) ? d.kind : 'service';
  const dev = d.device || {};
  let coverage = d.coverage || 'paid';
  const serial = d.serial || dev.serial;
  if (!d.coverage && serial) { const s = await one('SELECT warranty_until FROM serials WHERE upper(serial)=upper($1)', [serial]); if (s && new Date(s.warranty_until) >= new Date()) coverage = 'warranty'; }
  if (!d.coverage && custId) { const a = await one(`SELECT id FROM amcs WHERE customer_id=$1 AND status='active' AND end_date>=CURRENT_DATE`, [custId]); if (a) coverage = 'amc'; }
  const priority = ['low', 'normal', 'high', 'urgent'].includes(d.priority) ? d.priority : 'normal';
  const number = await nextNumber(kind === 'installation' ? 'JOB' : 'ITP-T');
  const status = kind === 'carry_in' ? 'received' : (d.technician_id ? 'assigned' : 'open');
  const title = kind === 'carry_in' ? [dev.type, dev.brand, dev.model].filter(Boolean).join(' ') || 'Carry-in repair' : (d.title || d.issue);
  const checklist = d.checklist || (kind === 'carry_in' ? [{ t: 'Diagnose & note fault', done: false }, { t: 'Share estimate with customer', done: false }, { t: 'Repair / replace parts', done: false }, { t: 'Test & clean device', done: false }] : [{ t: 'Diagnose issue', done: false }, { t: 'Fix / replace', done: false }, { t: 'Test with customer', done: false }]);
  const j = await one(`INSERT INTO jobs(number,kind,customer_id,order_id,title,issue,category,coverage,technician_id,status,scheduled_at,address,phone,source,otp,track_token,checklist,priority,sla_due,device,estimate,site_id,parent_job_id,history)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,md5(random()::text),$16,$17, now() + ($18 || ' hours')::interval,$19,$20,$21,$22,$23) RETURNING *`,
    [number, kind, custId, d.order_id || null, title, d.issue, d.category || dev.type || null, coverage, d.technician_id || null, status, d.scheduled_at || null, d.address, normPhone(d.phone) || null,
      d.source || (kind === 'carry_in' ? 'walkin' : 'manual'), String(Math.floor(1000 + Math.random() * 9000)), JSON.stringify(checklist), priority, String(SLA_HOURS_[priority]),
      JSON.stringify({ ...dev, serial: serial || dev.serial || null }), +d.estimate || 0, d.site_id || null, d.parent_job_id || null,
      JSON.stringify([{ s: status, at: new Date().toISOString(), by: req.user.name }])]);
  if (j.technician_id) require('../notify').notifyUser(j.technician_id, `New ${kind === 'carry_in' ? 'carry-in repair' : kind} ${j.number}`, j.title || '', `/app#/jobs/${j.id}`);
  if (kind === 'carry_in') { const W2 = require('../workflows'); const jj = await one('SELECT * FROM jobs WHERE id=$1', [j.id]); require('../workflows'); await (async () => { const c = custId ? await one('SELECT name, phone FROM customers WHERE id=$1', [custId]) : null; const ph = (c && c.phone) || j.phone; if (ph) await sendWhatsApp(ph, { text: `🙏 ${c ? c.name : ''} ji, aapka ${title} (ticket ${j.number}) receive ho gaya hai. Status track karein: ${await W2.baseUrl()}/track?ticket=${j.number}` }).catch(() => {}); })(); }
  await audit(req, 'create', 'job', j.id);
  res.json(j);
}));
r.post('/jobs/:id/status', h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const st = req.body.status;
  const carry = ['received', 'diagnosing', 'awaiting_approval', 'repairing', 'ready', 'delivered', 'cancelled'];
  const site = ['open', 'assigned', 'on_the_way', 'in_progress', 'cancelled'];
  if (!(j.kind === 'carry_in' ? carry : site).includes(st)) return res.status(400).json({ error: 'Invalid status for this ticket' });
  if (req.user.role === 'tech' && st === 'cancelled') return res.status(403).json({ error: 'Not permitted' });
  if (req.body.estimate != null) await q('UPDATE jobs SET estimate=$2 WHERE id=$1', [j.id, +req.body.estimate]);
  if (st === 'delivered' && +req.body.collect > 0) { await W.recordPayment({ customer_id: j.customer_id, order_id: j.order_id, amount: req.body.collect, mode: req.body.mode || 'Cash', kind: 'service' }, req.user); await q('UPDATE jobs SET collected=collected+$2 WHERE id=$1', [j.id, +req.body.collect]); }
  const u = await W.setJobStatus(j.id, st, req.user, req.body.note);
  if (req.user.role === 'tech') delete u.otp;
  res.json(u);
}));
r.get('/jobs/:id/parts', h(async (req, res) => { await jobChecked(req, req.params.id); res.json(await q('SELECT jp.*, u.name uname FROM job_parts jp LEFT JOIN users u ON u.id=jp.user_id WHERE job_id=$1 ORDER BY id', [req.params.id])); }));
r.post('/jobs/:id/parts', h(async (req, res) => { await jobChecked(req, req.params.id); res.json(await W.addPart(+req.params.id, req.body, req.user)); }));
r.delete('/jobs/:id/parts/:pid', h(async (req, res) => {
  await jobChecked(req, req.params.id);
  const p = await one('DELETE FROM job_parts WHERE id=$1 AND job_id=$2 RETURNING *', [req.params.pid, req.params.id]);
  if (p && p.product_id) await q('UPDATE products SET stock=stock+$2 WHERE id=$1', [p.product_id, +p.qty]);
  res.json({ ok: true });
}));
r.get('/jobs/:id/pdf', h(async (req, res) => { await jobChecked(req, req.params.id); await pdf.jobPdf(res, req.params.id); }));
// Technician brings a device back from site → linked carry-in ticket
r.post('/jobs/:id/carry-in', h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const d = req.body; const dev = d.device || {};
  const number = await nextNumber('ITP-T');
  const title = [dev.type, dev.brand, dev.model].filter(Boolean).join(' ') || 'Device taken for repair';
  const n = await one(`INSERT INTO jobs(number,kind,customer_id,title,issue,category,coverage,technician_id,status,phone,address,source,track_token,checklist,priority,sla_due,device,parent_job_id,history,otp)
    VALUES($1,'carry_in',$2,$3,$4,$5,$6,$7,'received',$8,$9,'onsite_pickup',md5(random()::text),$10,'normal',now()+interval '72 hours',$11,$12,$13,$14) RETURNING *`,
    [number, j.customer_id, title, d.issue || j.issue, dev.type || j.category, j.coverage, req.user.role === 'tech' ? req.user.id : j.technician_id, j.phone, j.address,
      JSON.stringify([{ t: 'Diagnose & note fault', done: false }, { t: 'Share estimate with customer', done: false }, { t: 'Repair / replace parts', done: false }, { t: 'Return & install at site', done: false }]),
      JSON.stringify(dev), j.id, JSON.stringify([{ s: 'received', at: new Date().toISOString(), by: req.user.name, note: 'Picked up from site by technician (' + j.number + ')' }]), String(Math.floor(1000 + Math.random() * 9000))]);
  await W.pushHistory(j.id, j.status, req.user, `Device taken to workshop → ${number}`);
  const c = j.customer_id ? await one('SELECT name, phone FROM customers WHERE id=$1', [j.customer_id]) : null;
  const ph = (c && c.phone) || j.phone;
  if (ph) sendWhatsApp(ph, { text: `🙏 ${c ? c.name : ''} ji, aapka ${title} repair ke liye hamare technician ${req.user.name} ne liya hai. Ticket ${number}. Track: ${await W.baseUrl()}/track?ticket=${number}` }).catch(() => {});
  require('../notify').notifyRole('owner', `Device taken to workshop ${number}`, `${title} from ${c ? c.name : ''} (job ${j.number})`, '/crm#/service');
  res.json(n);
}));
r.patch('/jobs/:id', h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const d = req.body; const set = [], p = [j.id];
  const allowed = req.user.role === 'tech' ? ['status', 'checklist', 'notes', 'location', 'device'] : ['status', 'checklist', 'notes', 'technician_id', 'scheduled_at', 'coverage', 'title', 'issue', 'address', 'location', 'priority', 'estimate', 'device'];
  for (const k of allowed) if (k in d) { p.push(k === 'checklist' ? JSON.stringify(d[k]) : (d[k] === '' ? null : d[k])); set.push(`${k}=?`); }
  if (req.user.role === 'tech' && d.status && !['on_the_way', 'in_progress', 'assigned'].includes(d.status)) return res.status(400).json({ error: 'Use Complete job to finish' });
  if ('technician_id' in d && d.technician_id && j.status === 'open') set.push(`status='assigned'`);
  const u = set.length ? await one(`UPDATE jobs SET ${set.join(',')} WHERE id=$1 RETURNING *`, p) : j;
  if (d.technician_id && +d.technician_id !== j.technician_id) require('../notify').notifyUser(+d.technician_id, `Job ${j.number} assigned to you`, j.title || '', `/app#/jobs/${j.id}`);
  if (d.status && d.status !== j.status) await W.pushHistory(j.id, d.status, req.user);
  if (d.status === 'on_the_way') {
    const c = j.customer_id ? await one('SELECT name, phone FROM customers WHERE id=$1', [j.customer_id]) : null;
    if (c) sendWhatsApp(c.phone || j.phone, { text: `Namaste ${c.name} ji, technician ${req.user.name} aapke paas aa rahe hain (${j.number}). Track: ${await W.baseUrl()}/track/${j.track_token}` }).catch(() => {});
  }
  if (req.user.role === 'tech') delete u.otp;
  res.json(u);
}));
r.post('/jobs/:id/photos', upload.array('photos', 10), h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const which = req.query.when === 'after' ? 'photos_after' : 'photos_before';
  const ids = [];
  for (const f of req.files || []) ids.push((await one('INSERT INTO media(filename,mime,data,kind) VALUES($1,$2,$3,$4) RETURNING id', [f.originalname, f.mimetype, f.buffer, 'job'])).id);
  if (req.query.when === 'signature' && ids[0]) { await q('UPDATE jobs SET signature_id=$2 WHERE id=$1', [j.id, ids[0]]); return res.json({ signature_id: ids[0] }); }
  res.json(await one(`UPDATE jobs SET ${which}=${which} || $2::int[] WHERE id=$1 RETURNING photos_before, photos_after`, [j.id, ids]));
}));
r.post('/jobs/:id/serial', h(async (req, res) => { await jobChecked(req, req.params.id); res.json(await W.linkSerial(req.body.serial, +req.params.id, req.user)); }));
r.post('/jobs/:id/otp', h(async (req, res) => {
  const j = await jobChecked(req, req.params.id);
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  await q('UPDATE jobs SET otp=$2 WHERE id=$1', [j.id, otp]);
  const c = j.customer_id ? await one('SELECT name, phone FROM customers WHERE id=$1', [j.customer_id]) : null;
  const s = await getSettings();
  const out = await sendWhatsApp((c && c.phone) || j.phone, s.wa_tpl_otp ? { template: s.wa_tpl_otp, params: [otp] } : { text: `${s.company_name || 'IT Paradise'}: job ${j.number} complete karne ke liye OTP ${otp} technician ko batayein.` });
  res.json({ sent: out.ok, status: out.status });
}));
r.post('/jobs/:id/complete', h(async (req, res) => { await jobChecked(req, req.params.id); const j = await W.completeJob(+req.params.id, req.body, req.user); await audit(req, 'complete', 'job', j.id); delete j.otp; res.json(j); }));
r.post('/jobs/:id/close', OWNER, h(async (req, res) => res.json(await one(`UPDATE jobs SET status='closed' WHERE id=$1 RETURNING *`, [req.params.id]))));

r.get('/amcs', OS, h(async (req, res) => res.json(await q(`SELECT a.*, c.name cname, c.phone, (a.end_date-CURRENT_DATE) left_days FROM amcs a LEFT JOIN customers c ON c.id=a.customer_id ORDER BY a.end_date`))));
r.post('/amcs', OS, h(async (req, res) => {
  const d = req.body;
  res.json(await one(`INSERT INTO amcs(number,customer_id,title,start_date,end_date,amount,visits_per_year,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [await nextNumber('AMC'), d.customer_id, d.title, d.start_date, d.end_date, +d.amount || 0, +d.visits_per_year || 4, d.notes]));
}));
r.patch('/amcs/:id', OS, h(async (req, res) => {
  const d = req.body;
  if (d.renew) {
    const a = await one('SELECT * FROM amcs WHERE id=$1', [req.params.id]);
    return res.json(await one(`UPDATE amcs SET start_date=$2, end_date=$2::date + interval '1 year' - interval '1 day', amount=coalesce($3,amount), status='active' WHERE id=$1 RETURNING *`,
      [a.id, new Date(Math.max(new Date(a.end_date).getTime() + 864e5, Date.now())).toISOString().slice(0, 10), d.amount || null]));
  }
  res.json(await one(`UPDATE amcs SET title=coalesce($2,title), end_date=coalesce($3,end_date), amount=coalesce($4,amount), status=coalesce($5,status), visits_per_year=coalesce($6,visits_per_year) WHERE id=$1 RETURNING *`,
    [req.params.id, d.title, d.end_date, d.amount, d.status, d.visits_per_year]));
}));

// ---------- Team, targets & tasks ----------
r.get('/users', h(async (req, res) => res.json(await q(`SELECT id,name,role,phone,email,active,categories,target FROM users ${req.user.role === 'owner' ? '' : 'WHERE active'} ORDER BY role,name`))));
r.post('/users', OWNER, h(async (req, res) => {
  const d = req.body;
  if (!d.email || !d.password || !d.name || !['owner', 'sales', 'tech'].includes(d.role)) return res.status(400).json({ error: 'Name, email, password, role required' });
  const u = await one('INSERT INTO users(name,email,phone,password_hash,role,categories,target) VALUES($1,lower($2),$3,$4,$5,$6,$7) RETURNING id,name,email,role',
    [d.name, d.email, normPhone(d.phone) || null, await hash(d.password), d.role, d.categories || '', +d.target || 0]);
  await audit(req, 'create', 'user', u.id); res.json(u);
}));
r.patch('/users/:id', OWNER, h(async (req, res) => {
  const d = req.body;
  if (d.password) await q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.params.id, await hash(d.password)]);
  const u = await one(`UPDATE users SET name=coalesce($2,name), phone=coalesce($3,phone), role=coalesce($4,role), active=coalesce($5,active), categories=coalesce($6,categories), target=coalesce($7,target), email=coalesce(lower($8),email)
    WHERE id=$1 RETURNING id,name,email,role,active,categories,target`, [req.params.id, d.name, d.phone, d.role, d.active, d.categories, d.target, d.email]);
  await audit(req, 'update', 'user', req.params.id, { ...d, password: d.password ? '***' : undefined }); res.json(u);
}));
r.get('/team', OWNER, h(async (req, res) => {
  const rows = await q(`SELECT u.id,u.name,u.role,u.target,u.categories,u.active,
    (SELECT check_in FROM attendance a WHERE a.user_id=u.id AND a.day=CURRENT_DATE) check_in,
    (SELECT check_out FROM attendance a WHERE a.user_id=u.id AND a.day=CURRENT_DATE) check_out,
    (SELECT count(*)::int FROM leads l WHERE l.owner_id=u.id AND date_trunc('month',l.created_at)=date_trunc('month',now()))::int leads,
    (SELECT count(*)::int FROM leads l WHERE l.owner_id=u.id AND l.stage='won' AND date_trunc('month',l.updated_at)=date_trunc('month',now()))::int won,
    (SELECT coalesce(sum(total),0) FROM orders o WHERE o.user_id=u.id AND o.status<>'cancelled' AND date_trunc('month',o.created_at)=date_trunc('month',now())) sales,
    (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status IN ('completed','closed') AND date_trunc('month',j.completed_at)=date_trunc('month',now()))::int jobs_done,
    (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.status NOT IN ('completed','closed','cancelled'))::int jobs_open,
    (SELECT title FROM jobs j WHERE j.technician_id=u.id AND j.status IN ('on_the_way','in_progress') LIMIT 1) on_site,
    (SELECT count(*)::int FROM activities a WHERE a.user_id=u.id AND a.created_at > now()-interval '30 days')::int activities,
    (SELECT count(*)::int FROM followups f WHERE f.user_id=u.id AND NOT f.done AND f.due_at<now())::int overdue
    FROM users u WHERE u.role<>'owner' ORDER BY u.active DESC, u.role, u.name`);
  const tasks = await q('SELECT t.*, u.name uname FROM tasks t LEFT JOIN users u ON u.id=t.user_id WHERE NOT t.done OR t.due=CURRENT_DATE ORDER BY t.done, t.due, t.id');
  res.json({ rows, tasks });
}));
r.get('/tasks', h(async (req, res) => res.json(await q(`SELECT t.*, u.name uname FROM tasks t LEFT JOIN users u ON u.id=t.user_id WHERE ${req.user.role === 'owner' ? '1=1' : 't.user_id=' + req.user.id} AND (NOT t.done OR t.due>=CURRENT_DATE-1) ORDER BY t.done, t.due`))));
r.post('/tasks', OWNER, h(async (req, res) => {
  const t = await one('INSERT INTO tasks(title,user_id,due,created_by) VALUES($1,$2,coalesce($3,CURRENT_DATE),$4) RETURNING *', [req.body.title, req.body.user_id || null, req.body.due || null, req.user.id]);
  if (t.user_id) require('../notify').notifyUser(t.user_id, 'New task', t.title, '/app#/');
  res.json(t);
}));
r.patch('/tasks/:id', h(async (req, res) => {
  const t = await one('SELECT * FROM tasks WHERE id=$1', [req.params.id]);
  if (!t || (req.user.role !== 'owner' && t.user_id !== req.user.id)) return res.status(403).json({ error: 'Not permitted' });
  res.json(await one('UPDATE tasks SET done=$2 WHERE id=$1 RETURNING *', [t.id, !!req.body.done]));
}));
r.get('/activity-log', OWNER, h(async (req, res) => res.json(await q(`SELECT a.*, u.name uname FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${req.query.user ? 'WHERE a.user_id=' + +req.query.user : ''} ORDER BY a.id DESC LIMIT 300`))));

// ---------- Reports ----------
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { v = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
r.get('/reports/:type', OWNER, h(async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const P = [from, to];
  let out = {};
  switch (req.params.type) {
    case 'sales':
      out.monthly = await q(`SELECT to_char(date_trunc('month',o.created_at),'Mon YY') m, date_trunc('month',o.created_at) d, coalesce(c.name,'Other') category, round(sum(oi.amount))::float v
        FROM orders o JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
        WHERE o.status<>'cancelled' AND o.created_at::date BETWEEN $1 AND $2 GROUP BY 1,2,3 ORDER BY 2`, P);
      out.rows = await q(`SELECT o.number, o.created_at::date date, c.name customer, u.name salesperson, o.subtotal, o.discount, o.gst, o.total, o.status FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.user_id WHERE o.created_at::date BETWEEN $1 AND $2 ORDER BY o.id DESC`, P);
      break;
    case 'leads':
      out.by_source = await q(`SELECT source, count(*)::int leads, count(*) FILTER (WHERE stage='won')::int won, round(100.0*count(*) FILTER (WHERE stage='won')/GREATEST(count(*),1),1)::float conv,
        coalesce(sum(value) FILTER (WHERE stage='won'),0)::float value FROM leads WHERE created_at::date BETWEEN $1 AND $2 GROUP BY source ORDER BY leads DESC`, P);
      out.by_user = await q(`SELECT coalesce(u.name,'Unassigned') salesperson, count(*)::int leads, count(*) FILTER (WHERE stage='won')::int won, round(100.0*count(*) FILTER (WHERE stage='won')/GREATEST(count(*),1),1)::float conv FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.created_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, P);
      out.lost = await q(`SELECT coalesce(lost_reason,'—') reason, count(*)::int n FROM leads WHERE stage='lost' AND created_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`, P);
      out.rows = out.by_source;
      break;
    case 'products':
      out.rows = await q(`SELECT p.name product, c.name category, sum(oi.qty)::float qty, round(sum(oi.amount))::float revenue, round(sum(oi.amount - oi.qty*oi.buy_rate))::float margin,
        round(100*sum(oi.amount - oi.qty*oi.buy_rate)/NULLIF(sum(oi.amount),0),1)::float margin_pct FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN categories c ON c.id=p.category_id
        WHERE o.status<>'cancelled' AND o.created_at::date BETWEEN $1 AND $2 GROUP BY 1,2 ORDER BY revenue DESC`, P);
      break;
    case 'payments':
      out.rows = await q(`SELECT p.date, p.number, c.name customer, i.number invoice, p.amount, p.mode, p.reference, u.name collected_by FROM payments p LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN invoices i ON i.id=p.invoice_id LEFT JOIN users u ON u.id=p.user_id WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date DESC`, P);
      out.dues = await q(`SELECT i.number invoice, c.name customer, i.total, i.paid, i.total-i.paid due, i.due_date, GREATEST(CURRENT_DATE-i.due_date,0) overdue_days FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.total-i.paid>1 ORDER BY i.due_date`);
      out.supplier = await q(`SELECT s.name supplier, coalesce(sum(p.total),0)::float billed, (SELECT coalesce(sum(amount),0) FROM supplier_payments sp WHERE sp.supplier_id=s.id)::float paid FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id GROUP BY s.id`);
      out.purchases = await q(`SELECT p.number, p.bill_no, p.bill_date, s.name supplier, p.subtotal, p.gst, p.total FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.bill_date BETWEEN $1 AND $2 ORDER BY p.bill_date DESC`, P);
      break;
    case 'stock':
      out.rows = await q(`SELECT p.name product, p.sku, c.name category, p.stock, p.reserved, p.stock-p.reserved available, p.min_stock, p.buy_price, p.price, (p.stock*p.buy_price)::float stock_value FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY stock_value DESC`);
      break;
    case 'service':
      out.rows = await q(`SELECT j.number, j.kind, c.name customer, j.issue, j.coverage, u.name technician, j.status, j.created_at, j.completed_at, round((extract(epoch FROM j.completed_at-j.created_at)/3600)::numeric,1)::float hours FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id LEFT JOIN users u ON u.id=j.technician_id WHERE j.created_at::date BETWEEN $1 AND $2 ORDER BY j.id DESC`, P);
      out.amc = await q(`SELECT a.number, c.name customer, a.title, a.start_date, a.end_date, a.amount, a.status FROM amcs a LEFT JOIN customers c ON c.id=a.customer_id ORDER BY a.end_date`);
      break;
    case 'team':
      out.rows = await q(`SELECT u.name, u.role, (SELECT count(*)::int FROM leads l WHERE l.owner_id=u.id AND l.created_at::date BETWEEN $1 AND $2)::int leads,
        (SELECT count(*)::int FROM leads l WHERE l.owner_id=u.id AND l.stage='won' AND l.updated_at::date BETWEEN $1 AND $2)::int won,
        (SELECT coalesce(sum(total),0) FROM orders o WHERE o.user_id=u.id AND o.status<>'cancelled' AND o.created_at::date BETWEEN $1 AND $2)::float sales,
        (SELECT count(*)::int FROM activities a WHERE a.user_id=u.id AND a.type IN ('call','whatsapp','visit') AND a.created_at::date BETWEEN $1 AND $2)::int followup_activities,
        (SELECT count(*)::int FROM jobs j WHERE j.technician_id=u.id AND j.completed_at::date BETWEEN $1 AND $2)::int jobs_completed,
        (SELECT count(*)::int FROM attendance a WHERE a.user_id=u.id AND a.day BETWEEN $1 AND $2)::int days_present FROM users u WHERE u.role<>'owner' ORDER BY sales DESC`, P);
      break;
    case 'summary':
      out = await one(`SELECT (SELECT count(*)::int FROM leads WHERE created_at::date BETWEEN $1 AND $2)::int leads,
        (SELECT count(*)::int FROM leads WHERE stage='won' AND created_at::date BETWEEN $1 AND $2)::int won,
        (SELECT coalesce(sum(total),0) FROM orders WHERE status<>'cancelled' AND created_at::date BETWEEN $1 AND $2)::float sales,
        (SELECT coalesce(sum(margin),0) FROM orders WHERE status<>'cancelled' AND created_at::date BETWEEN $1 AND $2)::float margin,
        (SELECT coalesce(sum(subtotal-discount),0) FROM orders WHERE status<>'cancelled' AND created_at::date BETWEEN $1 AND $2)::float net,
        (SELECT coalesce(sum(amount),0) FROM payments WHERE date BETWEEN $1 AND $2)::float collected,
        (SELECT count(*)::int FROM jobs WHERE kind<>'installation' AND created_at::date BETWEEN $1 AND $2)::int tickets,
        (SELECT count(*)::int FROM jobs WHERE kind<>'installation' AND completed_at IS NOT NULL AND completed_at-created_at < interval '24 hours' AND created_at::date BETWEEN $1 AND $2)::int in_sla`, P);
      break;
    default: return res.status(404).json({ error: 'Unknown report' });
  }
  if (req.query.format === 'csv') {
    const key = req.query.part || 'rows';
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-${key}-${from}-to-${to}.csv"`);
    return res.send('﻿' + toCsv(Array.isArray(out[key]) ? out[key] : [out]));
  }
  res.json(out);
}));

// ---------- Automations ----------
r.get('/automations', OWNER, h(async (req, res) => res.json(await q('SELECT * FROM automations ORDER BY key'))));
r.patch('/automations/:key', OWNER, h(async (req, res) => { const a = await one('UPDATE automations SET enabled=$2 WHERE key=$1 RETURNING *', [req.params.key, !!req.body.enabled]); await audit(req, 'toggle', 'automation', req.params.key, req.body); res.json(a); }));
r.post('/automations/:key/run', OWNER, h(async (req, res) => {
  const map = { fu_escalation: 'escalations', sla_escalation: 'escalations', followup_reminders: 'followupReminders', pending_quote_alert: 'pendingQuotes', service_ticket_alert: 'pendingTickets', payment_reminders: 'paymentReminders', low_stock: 'lowStock', amc_reminders: 'amcReminders', daily_summary: 'dailySummary', indiamart_pull: 'indiamartPull', email_pull: 'emailPull' };
  if (!map[req.params.key]) return res.status(400).json({ error: 'This automation is event-triggered (runs automatically)' });
  await autoJobs[map[req.params.key]]();
  res.json({ ok: true });
}));
r.get('/outbox', OWNER, h(async (req, res) => res.json(await q('SELECT * FROM outbox ORDER BY id DESC LIMIT 100'))));

// ---------- Data export & backup (owner) ----------
const EXPORTABLE = ['customers', 'leads', 'activities', 'followups', 'quotations', 'quotation_items', 'orders', 'order_items', 'invoices', 'payments', 'products', 'categories', 'brands', 'suppliers', 'purchases', 'purchase_items', 'purchase_orders', 'stock_moves', 'serials', 'jobs', 'amcs', 'messages', 'tasks', 'attendance', 'audit_log'];
r.get('/export/:table', OWNER, h(async (req, res) => {
  if (!EXPORTABLE.includes(req.params.table)) return res.status(400).json({ error: 'Unknown table' });
  const rows = await q(`SELECT * FROM ${req.params.table} ORDER BY 1`);
  res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.table}.csv"`);
  res.send('﻿' + toCsv(rows));
}));
r.get('/backup', OWNER, h(async (req, res) => {
  const out = { exported_at: new Date().toISOString(), tables: {} };
  for (const t of [...EXPORTABLE, 'users', 'settings', 'sectors', 'banners', 'pages', 'automations', 'quote_templates', 'amcs', 'supplier_payments', 'purchase_order_items', 'gallery', 'counters']) {
    let rows = await q(`SELECT * FROM ${t}`);
    if (t === 'users') rows = rows.map(u => ({ ...u, password_hash: u.password_hash }));
    out.tables[t] = rows;
  }
  await audit(req, 'backup', 'database');
  res.setHeader('Content-Disposition', `attachment; filename="itparadise-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(out);
}));
r.post('/restore', OWNER, express.json({ limit: '200mb' }), h(async (req, res) => {
  const data = req.body && req.body.tables;
  if (!data) return res.status(400).json({ error: 'Invalid backup file' });
  const order = ['settings', 'users', 'categories', 'brands', 'products', 'sectors', 'banners', 'pages', 'gallery', 'customers', 'suppliers', 'leads', 'activities', 'followups', 'messages', 'quote_templates', 'quotations', 'quotation_items', 'orders', 'order_items', 'invoices', 'payments', 'purchase_orders', 'purchase_order_items', 'purchases', 'purchase_items', 'supplier_payments', 'stock_moves', 'amcs', 'jobs', 'serials', 'tasks', 'attendance', 'automations', 'counters', 'audit_log'];
  await tx(async (c) => {
    for (const t of [...order].reverse()) if (data[t]) await c.q(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
    for (const t of order) for (const row of data[t] || []) {
      const cols = Object.keys(row);
      await c.q(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT DO NOTHING`, cols.map(k => row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : row[k]));
    }
    for (const t of order) { const seq = await c.one(`SELECT pg_get_serial_sequence('${t}','id') s`).catch(() => null); if (seq && seq.s) await c.q(`SELECT setval('${seq.s}', GREATEST((SELECT coalesce(max(id),0) FROM ${t}),1))`); }
  });
  await audit(req, 'restore', 'database');
  res.json({ ok: true });
}));

module.exports = r;
