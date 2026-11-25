// Website admin panel API (owner only): products, categories, brands, sectors, banners, pages, gallery, settings, media
const express = require('express');
const multer = require('multer');
const { q, one, getSettings, setSetting } = require('../db');
const { authenticate, allow, audit } = require('../auth');

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
r.use(authenticate, allow('owner'));

const slugify = (s) => String(s || '').toLowerCase().replace(/[″"']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const arr = (v) => Array.isArray(v) ? v : String(v || '').split('\n').map(x => x.trim()).filter(Boolean);

r.post('/media', upload.array('files', 20), h(async (req, res) => {
  const ids = [];
  for (const f of req.files || []) ids.push((await one('INSERT INTO media(filename,mime,data) VALUES($1,$2,$3) RETURNING id', [f.originalname, f.mimetype, f.buffer])).id);
  res.json({ ids });
}));

// Products
r.get('/products', h(async (req, res) => res.json(await q(`SELECT p.*, c.name category, b.name brand FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id ORDER BY p.id DESC`))));
r.get('/products/:id', h(async (req, res) => res.json(await one('SELECT * FROM products WHERE id=$1', [req.params.id]))));
async function saveProduct(d, id) {
  const slug = slugify(d.slug || d.name);
  const vals = [slug, d.name, d.sku || null, d.model || null, d.category_id || null, d.subtype || null, d.brand_id || null, d.art || null,
    (d.image_ids || []).map(Number), +d.price || 0, +d.mrp || 0, +d.buy_price || 0, d.gst_rate === '' || d.gst_rate == null ? 18 : +d.gst_rate, d.hsn || null,
    arr(d.highlights), JSON.stringify(d.specs || []), d.description || null, JSON.stringify(d.faq || []), +d.warranty_months || 12,
    +d.min_stock || 0, !!d.best_seller, d.published !== false, d.serial_tracked !== false, d.meta_title || null, d.meta_desc || null, (d.related || []).map(Number)];
  if (id) return one(`UPDATE products SET slug=$1,name=$2,sku=$3,model=$4,category_id=$5,subtype=$6,brand_id=$7,art=$8,image_ids=$9,price=$10,mrp=$11,buy_price=$12,gst_rate=$13,hsn=$14,
    highlights=$15,specs=$16,description=$17,faq=$18,warranty_months=$19,min_stock=$20,best_seller=$21,published=$22,serial_tracked=$23,meta_title=$24,meta_desc=$25,related=$26,updated_at=now() WHERE id=$27 RETURNING *`, [...vals, id]);
  return one(`INSERT INTO products(slug,name,sku,model,category_id,subtype,brand_id,art,image_ids,price,mrp,buy_price,gst_rate,hsn,highlights,specs,description,faq,warranty_months,min_stock,best_seller,published,serial_tracked,meta_title,meta_desc,related,stock)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`, [...vals, +d.stock || 0]);
}
r.post('/products', h(async (req, res) => { const p = await saveProduct(req.body); await audit(req, 'create', 'product', p.id); res.json(p); }));
r.put('/products/:id', h(async (req, res) => { const p = await saveProduct(req.body, req.params.id); await audit(req, 'update', 'product', p.id); res.json(p); }));
r.delete('/products/:id', h(async (req, res) => {
  const used = await one('SELECT 1 FROM order_items WHERE product_id=$1 UNION SELECT 1 FROM quotation_items WHERE product_id=$1 LIMIT 1', [req.params.id]);
  if (used) { await q('UPDATE products SET published=false WHERE id=$1', [req.params.id]); return res.json({ ok: true, unpublished: true }); }
  await q('DELETE FROM products WHERE id=$1', [req.params.id]); await audit(req, 'delete', 'product', req.params.id); res.json({ ok: true });
}));
// Bulk CSV import: name,category_slug,price,mrp,buy_price,sku,stock,min_stock,highlights(|),description
r.post('/products/import', express.text({ type: '*/*', limit: '5mb' }), h(async (req, res) => {
  const lines = String(req.body || '').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(',').map(s => s.trim().toLowerCase());
  let n = 0;
  for (const line of lines) {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const o = Object.fromEntries(head.map((k, i) => [k, (cells[i] || '').trim()]));
    if (!o.name) continue;
    const cat = o.category_slug ? await one('SELECT id FROM categories WHERE slug=$1', [o.category_slug]) : null;
    const ex = await one('SELECT id FROM products WHERE slug=$1 OR (sku IS NOT NULL AND sku=$2)', [slugify(o.name), o.sku || '__']);
    await saveProduct({ ...o, category_id: cat && cat.id, highlights: (o.highlights || '').split('|') }, ex && ex.id);
    n++;
  }
  res.json({ imported: n });
}));

// Categories / brands / sectors / banners / gallery — simple CRUD
const simple = {
  categories: ['slug', 'name', 'blurb', 'icon', 'subtypes', 'sort'],
  brands: ['name', 'logo_id', 'sort'],
  sectors: ['slug', 'name', 'icon', 'headline', 'intro', 'packages', 'sort'],
  banners: ['title', 'subtitle', 'image_id', 'link', 'active', 'sort'],
  gallery: ['image_id', 'caption', 'sort'],
};
for (const [t, cols] of Object.entries(simple)) {
  r.get(`/${t}`, h(async (req, res) => res.json(await q(`SELECT * FROM ${t} ORDER BY ${cols.includes('sort') ? 'sort,' : ''}id`))));
  r.post(`/${t}`, h(async (req, res) => {
    const d = { ...req.body }; if ('slug' in d || cols.includes('slug')) d.slug = slugify(d.slug || d.name);
    const v = cols.map(c => c === 'packages' ? JSON.stringify(d[c] || []) : (d[c] === '' ? null : d[c]));
    res.json(await one(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, v));
  }));
  r.put(`/${t}/:id`, h(async (req, res) => {
    const d = req.body; const set = [], p = [req.params.id];
    for (const c of cols) if (c in d) { p.push(c === 'packages' ? JSON.stringify(d[c] || []) : (d[c] === '' ? null : d[c])); set.push(`${c}=$${p.length}`); }
    res.json(await one(`UPDATE ${t} SET ${set.join(',')} WHERE id=$1 RETURNING *`, p));
  }));
  r.delete(`/${t}/:id`, h(async (req, res) => { await q(`DELETE FROM ${t} WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }));
}

// Pages (about, privacy, terms, warranty, amc-plans)
r.get('/pages', h(async (req, res) => res.json(await q('SELECT * FROM pages ORDER BY slug'))));
r.put('/pages/:slug', h(async (req, res) => res.json(await one(`INSERT INTO pages(slug,title,body,meta_title,meta_desc) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(slug) DO UPDATE SET title=$2, body=$3, meta_title=$4, meta_desc=$5, updated_at=now() RETURNING *`, [req.params.slug, req.body.title, req.body.body, req.body.meta_title, req.body.meta_desc]))));

// Settings — secrets are write-only (masked on read)
const SECRET_KEYS = ['wa_token', 'meta_app_secret', 'meta_page_token', 'indiamart_key', 'smtp_pass', 'imap_pass', 'webhook_key'];
r.get('/settings', h(async (req, res) => {
  const s = await getSettings(true);
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = SECRET_KEYS.includes(k) && v ? (k === 'webhook_key' ? v : '••••' + v.slice(-4)) : v;
  res.json(out);
}));
r.put('/settings', h(async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) {
    if (SECRET_KEYS.includes(k) && String(v).startsWith('••••')) continue;
    await setSetting(k, v);
  }
  await audit(req, 'update', 'settings', null, Object.keys(req.body || {}));
  res.json({ ok: true });
}));
r.post('/settings/test-whatsapp', h(async (req, res) => {
  const { sendWhatsApp } = require('../notify');
  res.json(await sendWhatsApp(req.body.phone, req.body.template ? { template: req.body.template } : { text: req.body.text || 'Test message from IT Paradise CRM ✅' }, { userId: req.user.id }));
}));

r.post('/clear-demo', h(async (req, res) => { await require('../seed').clearDemo(); await audit(req, 'clear', 'demo_data'); res.json({ ok: true }); }));

module.exports = r;
