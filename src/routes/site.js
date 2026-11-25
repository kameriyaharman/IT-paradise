// Public website (server-rendered, SEO-friendly URLs)
const express = require('express');
const { q, one, getSettings } = require('../db');
const { art } = require('../art');
const { icon } = require('../icons');
const pdf = require('../pdf');

const r = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const inr = (n) => Number(n || 0).toLocaleString('en-IN');

async function base(req) {
  const s = await getSettings();
  const categories = await q(`SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id=c.id AND p.published)::int count FROM categories c ORDER BY sort`);
  const sectors = await q('SELECT slug,name,icon FROM sectors ORDER BY sort');
  const wa = (s.phone_whatsapp || s.phone_sales || '').replace(/\D/g, '');
  return {
    s, categories, sectors, art, icon, inr, path: req.path,
    waNum: wa.length === 10 ? '91' + wa : wa,
    canonical: (s.public_url || '') + req.path,
    img: (p, cls) => p.image_ids && p.image_ids.length ? `<img class="art ${cls || ''}" src="/media/${p.image_ids[0]}" alt="${String(p.name).replace(/"/g, '&quot;')}" loading="lazy">` : art(p.art, cls),
  };
}
const card = `p.id,p.slug,p.name,p.price,p.mrp,p.art,p.image_ids,p.best_seller,p.stock,c.name cat,c.slug cslug`;

r.get('/', h(async (req, res) => {
  const b = await base(req);
  const best = await q(`SELECT ${card} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.published AND p.best_seller ORDER BY c.sort, p.id LIMIT 10`);
  const banners = await q('SELECT * FROM banners WHERE active ORDER BY sort');
  res.render('home', { ...b, best, banners, title: `${b.s.company_name || 'IT PARADISE'} — Computers, CCTV, Networking & Security in Bhilwara`, desc: 'One partner for computing, security, networking, attendance, power and display — supplied, integrated and supported in Bhilwara, Rajasthan since 2006.' });
}));

async function listing(req, res, cat) {
  const b = await base(req);
  const w = ['p.published'], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.split('?').join('$' + p.length)); };
  if (cat) add('p.category_id=?', cat.id);
  if (req.query.type) add('p.subtype=?', req.query.type);
  if (req.query.brand) add('p.brand_id=?', +req.query.brand);
  if (req.query.q) add(`(p.name ILIKE ? OR p.description ILIKE ? OR c.name ILIKE ? OR p.subtype ILIKE ? OR array_to_string(p.highlights,' ') ILIKE ?)`, `%${req.query.q}%`);
  if (req.query.min) add('p.price>=?', +req.query.min);
  if (req.query.max) add('p.price<=?', +req.query.max);
  if (req.query.spec) add(`(array_to_string(p.highlights,' ') ILIKE ? OR p.name ILIKE ?)`, `%${req.query.spec}%`);
  const sort = { new: 'p.id DESC', price: 'p.price=0, p.price ASC', 'price-desc': 'p.price DESC' }[req.query.sort] || 'p.best_seller DESC, p.id';
  const per = 12, page = Math.max(1, +req.query.page || 1);
  const total = (await one(`SELECT count(*)::int n FROM products p JOIN categories c ON c.id=p.category_id WHERE ${w.join(' AND ')}`, p)).n;
  const items = await q(`SELECT ${card} FROM products p JOIN categories c ON c.id=p.category_id WHERE ${w.join(' AND ')} ORDER BY ${sort} LIMIT ${per} OFFSET ${(page - 1) * per}`, p);
  const brands = await q(`SELECT DISTINCT b.id, b.name FROM brands b JOIN products p ON p.brand_id=b.id ${cat ? 'WHERE p.category_id=' + cat.id : ''} ORDER BY b.name`);
  const title = cat ? `${cat.name} — ${cat.blurb} in Bhilwara | IT Paradise` : req.query.q ? `Search: ${req.query.q} | IT Paradise` : 'All products | IT Paradise Bhilwara';
  res.render('listing', { ...b, cat, items, total, page, pages: Math.ceil(total / per), brands, query: req.query, title, desc: cat ? `${cat.name}: ${cat.blurb}. Supply + installation available from IT Paradise, Bhilwara.` : 'Computers, CCTV, networking, attendance, UPS, printers and displays — supply + installation in Bhilwara.' });
}
r.get('/products', h((req, res) => listing(req, res, null)));
r.get('/search', h((req, res) => listing(req, res, null)));
r.get('/products/:slug', h(async (req, res, next) => {
  const cat = await one('SELECT * FROM categories WHERE slug=$1', [req.params.slug]);
  if (!cat) return next();
  return listing(req, res, cat);
}));

r.get('/product/:slug', h(async (req, res, next) => {
  const b = await base(req);
  const p = await one(`SELECT p.*, c.name cat, c.slug cslug, br.name brand FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands br ON br.id=p.brand_id WHERE p.slug=$1 AND p.published`, [req.params.slug]);
  if (!p) return next();
  let together = p.related && p.related.length ? await q(`SELECT ${card} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id = ANY($1) AND p.published`, [p.related]) : [];
  if (!together.length) together = await q(`SELECT ${card} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.published AND p.category_id<>$1 AND p.best_seller LIMIT 3`, [p.category_id]);
  const similar = await q(`SELECT ${card} FROM products p JOIN categories c ON c.id=p.category_id WHERE p.published AND p.category_id=$1 AND p.id<>$2 ORDER BY p.best_seller DESC, random() LIMIT 5`, [p.category_id, p.id]);
  const off = p.mrp > p.price && p.price > 0 ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  res.render('product', { ...b, p, together, similar, off, title: p.meta_title || `${p.name} | IT Paradise`, desc: p.meta_desc || (p.description || '').slice(0, 155) });
}));

r.get('/solutions', h(async (req, res) => res.redirect('/solutions/' + ((await one('SELECT slug FROM sectors ORDER BY sort LIMIT 1')) || {}).slug)));
r.get('/solutions/:slug', h(async (req, res, next) => {
  const b = await base(req);
  const sector = await one('SELECT * FROM sectors WHERE slug=$1', [req.params.slug]);
  if (!sector) return next();
  res.render('solution', { ...b, sector, title: `${sector.name} — ${sector.headline} | IT Paradise`, desc: sector.intro });
}));

r.get('/brands', h(async (req, res) => {
  const b = await base(req);
  const brands = await q(`SELECT b.*, (SELECT count(*) FROM products p WHERE p.brand_id=b.id AND p.published)::int count FROM brands b ORDER BY sort, name`);
  res.render('brands', { ...b, brands, title: 'Brands we work with | IT Paradise', desc: 'Authorised and trusted technology brands supplied and supported by IT Paradise, Bhilwara.' });
}));
r.get(['/about', '/contact'], h(async (req, res) => {
  const b = await base(req);
  const brands = await q('SELECT * FROM brands ORDER BY sort, name LIMIT 12');
  res.render('about', { ...b, brands, title: req.path === '/contact' ? 'Contact IT Paradise — Bhilwara' : 'About IT Paradise — Trusted since 2006', desc: 'IT Paradise is a technology, security and system-integration partner for homes and businesses in Bhilwara, Rajasthan.' });
}));
r.get('/support', h(async (req, res) => {
  const b = await base(req);
  res.render('support', { ...b, title: 'Support — request a service | IT Paradise', desc: 'Raise a service request for CCTV, computers, networking, attendance, UPS or printers. AMC plans available.' });
}));
r.get('/gallery', h(async (req, res) => {
  const b = await base(req);
  const items = await q('SELECT * FROM gallery ORDER BY sort, id DESC');
  res.render('page', { ...b, page: { title: 'Photo gallery', body: '' }, gallery: items, title: 'Photo gallery | IT Paradise', desc: 'Installations and projects by IT Paradise.' });
}));
r.get('/page/:slug', h(async (req, res, next) => {
  const b = await base(req);
  const page = await one('SELECT * FROM pages WHERE slug=$1', [req.params.slug]);
  if (!page) return next();
  res.render('page', { ...b, page, gallery: null, title: page.meta_title || `${page.title} | IT Paradise`, desc: page.meta_desc || (page.body || '').slice(0, 155) });
}));
r.get('/enquiry-sent', h(async (req, res) => res.render('sent', { ...(await base(req)), title: 'Enquiry received | IT Paradise', desc: '' })));

// Customer-facing documents
r.get('/q/:token', h(async (req, res, next) => {
  const qt = await one('SELECT * FROM quotations WHERE token=$1', [req.params.token]);
  if (!qt) return next();
  await q('UPDATE quotations SET opened_count=opened_count+1, last_opened_at=now() WHERE id=$1', [qt.id]);
  if (qt.lead_id) {
    const { addActivity } = require('../leads');
    await addActivity(qt.lead_id, 'quote', `Customer opened quotation ${qt.number} (${qt.opened_count + 1}×)`);
  }
  await pdf.quotationPdf(res, qt.id);
}));
r.get('/r/:ref', h(async (req, res, next) => {
  const [id, tail] = String(req.params.ref).split('-');
  const p = await one('SELECT * FROM payments WHERE id=$1', [+id || 0]);
  if (!p || (p.number || '').slice(-4) !== tail) return next();
  await pdf.receiptPdf(res, p.id);
}));
r.get('/track/:token', h(async (req, res, next) => {
  const b = await base(req);
  const job = await one(`SELECT j.number,j.kind,j.title,j.issue,j.status,j.scheduled_at,j.completed_at,j.created_at,u.name tech, u.phone tech_phone FROM jobs j LEFT JOIN users u ON u.id=j.technician_id WHERE track_token=$1`, [req.params.token]);
  if (!job) return next();
  res.render('track', { ...b, job, title: `Track ${job.number} | IT Paradise`, desc: '' });
}));
r.get('/pay/:ref', h(async (req, res, next) => {
  const b = await base(req);
  const inv = await one(`SELECT i.*, c.name cname FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.number=$1 OR i.order_id::text=$1`, [req.params.ref]);
  if (!inv) return next();
  const due = inv.total - inv.paid;
  const upi = b.s.upi_id ? `upi://pay?pa=${encodeURIComponent(b.s.upi_id)}&pn=${encodeURIComponent(b.s.company_name || 'IT Paradise')}&am=${Math.round(due)}&cu=INR&tn=${encodeURIComponent(inv.number)}` : null;
  res.render('pay', { ...b, inv, due, upi, title: `Pay ${inv.number} | IT Paradise`, desc: '' });
}));

r.get('/robots.txt', h(async (req, res) => { const s = await getSettings(); res.type('text').send(`User-agent: *\nDisallow: /crm\nDisallow: /app\nDisallow: /api\nDisallow: /q/\nDisallow: /pay/\nDisallow: /track/\nSitemap: ${s.public_url || ''}/sitemap.xml\n`); }));
r.get('/sitemap.xml', h(async (req, res) => {
  const s = await getSettings(); const u = s.public_url || '';
  const urls = ['/', '/products', '/about', '/contact', '/support', '/brands', '/gallery',
    ...(await q('SELECT slug FROM categories')).map(c => '/products/' + c.slug), ...(await q('SELECT slug FROM sectors')).map(c => '/solutions/' + c.slug),
    ...(await q('SELECT slug FROM products WHERE published')).map(p => '/product/' + p.slug), ...(await q('SELECT slug FROM pages')).map(p => '/page/' + p.slug)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(x => `<url><loc>${u}${x}</loc></url>`).join('')}</urlset>`);
}));

r.use(h(async (req, res) => { res.status(404).render('page', { ...(await base(req)), page: { title: 'Page not found', body: 'The page you are looking for does not exist. Try the search above or browse our products.' }, gallery: null, title: 'Not found | IT Paradise', desc: '' }); }));

module.exports = r;
