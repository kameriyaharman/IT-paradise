// Public website endpoints (no login): enquiries, quote requests, service requests → CRM
const express = require('express');
const { q, one, nextNumber } = require('../db');
const { captureLead } = require('../leads');
const { normPhone, last10, notifyRole, sendWhatsApp } = require('../notify');

const r = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// naive rate limit per IP
const hits = new Map();
r.use((req, res, next) => {
  const k = req.ip; const now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < 60000); arr.push(now); hits.set(k, arr);
  if (arr.length > 20) return res.status(429).json({ error: 'Too many requests, please try again in a minute' });
  next();
});
const validPhone = (p) => last10(p).length === 10;

r.post('/enquiry', h(async (req, res) => {
  const d = req.body || {};
  if (d.website) return res.json({ ok: true }); // honeypot
  if (!d.name || !validPhone(d.mobile || d.phone)) return res.status(400).json({ error: 'Please enter your name and a valid 10-digit mobile number' });
  let product = null;
  if (d.product_id) product = await one('SELECT id,name FROM products WHERE id=$1', [+d.product_id]);
  const parts = [];
  if (product) parts.push(product.name);
  if (d.need) parts.push(d.need);
  if (d.items) parts.push('Items: ' + d.items);
  if (d.mode) parts.push({ install: 'With installation', product: 'Product only', bulk: 'Bulk / project' }[d.mode] || d.mode);
  if (d.students) parts.push(`${d.students} students`);
  if (d.message) parts.push(d.message);
  const { lead, duplicate } = await captureLead({
    name: d.name, phone: d.mobile || d.phone, email: d.email, company: d.company, city: d.city,
    need: parts.join(' · ').slice(0, 1000), quantity: d.quantity, product_id: product && product.id,
    source: 'website', source_detail: d.form || 'Website enquiry', category: d.category,
  });
  res.json({ ok: true, ref: `ENQ-${lead.id}`, duplicate });
}));

r.post('/service', h(async (req, res) => {
  const d = req.body || {};
  if (d.website) return res.json({ ok: true });
  if (!validPhone(d.mobile) || !d.problem) return res.status(400).json({ error: 'Please describe the problem and enter your registered mobile number' });
  const phone = normPhone(d.mobile);
  let cust = await one(`SELECT * FROM customers WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1`, [last10(phone)]);
  if (!cust) cust = await one('INSERT INTO customers(name,phone,city) VALUES($1,$2,$3) RETURNING *', [d.name || 'Website customer', phone, d.city || null]);
  const amc = await one(`SELECT id FROM amcs WHERE customer_id=$1 AND status='active' AND end_date>=CURRENT_DATE`, [cust.id]);
  const number = await nextNumber('ITP-T');
  const job = await one(`INSERT INTO jobs(number,kind,customer_id,title,issue,category,coverage,phone,source,status,otp,track_token,checklist)
    VALUES($1,'service',$2,$3,$4,$5,$6,$7,'website','open',$8,md5(random()::text),$9) RETURNING *`,
    [number, cust.id, cust.name, d.problem, d.category || null, amc ? 'amc' : 'paid', phone, String(Math.floor(1000 + Math.random() * 9000)),
      JSON.stringify([{ t: 'Diagnose issue', done: false }, { t: 'Fix / replace', done: false }, { t: 'Test with customer', done: false }])]);
  await notifyRole('owner', `New service ticket ${number}`, `${d.category || ''} · ${d.problem}`.slice(0, 120), '/crm#/service');
  sendWhatsApp(phone, { text: `Ticket ${number} create ho gaya ✓ (${d.category || 'Service'}: ${d.problem}). Hamara technician jaldi contact karega. Track: ${await require('../workflows').baseUrl()}/track/${job.track_token}` }).catch(() => {});
  res.json({ ok: true, ticket: number, track: `/track/${job.track_token}` });
}));

module.exports = r;
