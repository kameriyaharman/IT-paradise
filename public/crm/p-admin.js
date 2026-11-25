import { html, useState, useEffect, api, put, del, useApi, Load, Ic, Badge, inr, dt, go, toast, run, Btn, Modal, F, useForm, Search, Tabs, Empty, openFile, auth } from './ui.js';

const ARTS = ['laptop', 'desktop', 'workstation', 'monitor', 'dome', 'bullet', 'ptz', 'nvr', 'solar', 'wificam', 'fisheye', 'hdd', 'switch', 'ap', 'rack', 'cable', 'attendance', 'rfid', 'doorphone', 'ups', 'upssmall', 'printer', 'mfp', 'projector', 'panel'];
async function upload(files) { const fd = new FormData(); [...files].forEach(f => fd.append('files', f)); return (await api('/api/cms/media', { body: fd })).ids; }

// ================= Website admin =================
export function Website({ tab = 'products', id }) {
  const T = [['products', 'Products'], ['categories', 'Categories'], ['brands', 'Brands'], ['sectors', 'Solutions by sector'], ['banners', 'Home banners'], ['pages', 'Pages'], ['gallery', 'Photo gallery']];
  return html`<div><div class="ph"><h1>Website admin</h1><a class="btn b-ghost" href="/" target="_blank"><${Ic} n="ext" s=${15}/> View website</a></div>
    <${Tabs} tabs=${T} cur=${tab} onChange=${(t) => go('/website/' + t)}/>
    <div class="mt">${tab === 'products' ? (id ? html`<${ProductEdit} id=${id}/>` : html`<${ProductList}/>`) : tab === 'pages' ? html`<${Pages}/>` : html`<${Simple} t=${tab}/>`}</div></div>`;
}
export function ProductList() {
  const q = useApi('/api/cms/products'); const [s, setS] = useState(''); const [imp, setImp] = useState(false);
  return html`<div><div class="row between"><${Search} value=${s} onInput=${setS} ph="Search products"/><div class="row gap"><${Btn} kind="ghost" onClick=${() => setImp(true)}>Bulk import (CSV)</${Btn}><a class="btn b-pri" href="#/products/new"><${Ic} n="plus" s=${16}/> Add product</a></div></div>
  <${Load} q=${q}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th><th>Best seller</th><th>Status</th></tr></thead><tbody>
    ${rows.filter(p => !s || p.name.toLowerCase().includes(s.toLowerCase()) || (p.sku || '').toLowerCase().includes(s.toLowerCase())).map(p => html`<tr class="click" onClick=${() => go('/products/' + p.id)}>
      <td class="thumb">${p.image_ids && p.image_ids.length ? html`<img src=${'/media/' + p.image_ids[0]}/>` : html`<span class="muted small">${p.art}</span>`}</td><td><b>${p.name}</b><small>${p.sku || ''}</small></td><td>${p.category}</td><td>${+p.price ? inr(p.price) : 'On request'}</td><td>${inr(p.mrp)}</td><td>${p.stock}</td><td>${p.best_seller ? '★' : ''}</td><td><${Badge} s=${p.published ? 'active' : 'cancelled'}>${p.published ? 'Published' : 'Hidden'}<//></td></tr>`)}</tbody></table></div>`}<//>
  ${imp && html`<${Modal} title="Bulk import products" onClose=${() => setImp(false)}><p class="muted small">CSV columns: <code>name,category_slug,price,mrp,buy_price,sku,stock,min_stock,highlights,description</code> (highlights separated by |). Existing products (same name/SKU) are updated.</p>
    <input type="file" accept=".csv,text/csv" onChange=${async (e) => { const txt = await e.target.files[0].text(); const r = await run(() => fetch('/api/cms/products/import', { method: 'POST', headers: { Authorization: 'Bearer ' + auth.token, 'Content-Type': 'text/plain' }, body: txt }).then(r => r.json())); toast(`Imported ${r.imported} products`); setImp(false); q.reload(); }}/><//>`}</div>`;
}
export function ProductEdit({ id }) {
  const isNew = id === 'new'; const cats = useApi('/api/cms/categories'); const brands = useApi('/api/cms/brands'); const all = useApi('/api/cms/products');
  const [v, bind, setV] = useForm({ published: true, serial_tracked: true, gst_rate: 18, warranty_months: 12, art: 'dome', specs: [], faq: [], highlights: [], image_ids: [], related: [] });
  useEffect(() => { if (!isNew) api('/api/cms/products/' + id).then(p => setV({ ...p, highlights: (p.highlights || []).join('\n') })); }, [id]);
  const save = async () => { const body = { ...v, highlights: String(v.highlights || '').split('\n') }; const p = await run(() => isNew ? api('/api/cms/products', { body }) : put('/api/cms/products/' + id, body), 'Product saved'); if (isNew) go('/products/' + p.id); };
  const setSpec = (i, k, val) => setV(s => ({ ...s, specs: s.specs.map((x, j) => j === i ? { ...x, [k]: val } : x) }));
  const setFaq = (i, k, val) => setV(s => ({ ...s, faq: s.faq.map((x, j) => j === i ? { ...x, [k]: val } : x) }));
  return html`<div class="g2c wide-l"><div class="col-stack">
    <div class="card pad"><h3>Basic details</h3><div class="form2">
      <${F} l="Product name" full><input ...${bind('name')}/></${F}><${F} l="URL slug"><input ...${bind('slug')} placeholder="auto from name"/></${F}><${F} l="SKU"><input ...${bind('sku')}/></${F}>
      <${F} l="Model no."><input ...${bind('model')}/></${F}><${F} l="Category"><select ...${bind('category_id')}><option value="">—</option>${(cats.data || []).map(c => html`<option value=${c.id}>${c.name}</option>`)}</select></${F}>
      <${F} l="Type / sub-category"><select ...${bind('subtype')}><option value="">—</option>${((cats.data || []).find(c => c.id === +v.category_id) || { subtypes: '' }).subtypes.split(',').filter(Boolean).map(t => html`<option>${t}</option>`)}</select></${F}>
      <${F} l="Brand"><select ...${bind('brand_id')}><option value="">—</option>${(brands.data || []).map(c => html`<option value=${c.id}>${c.name}</option>`)}</select></${F}></div></div>
    <div class="card pad"><h3>Pricing & stock</h3><div class="form2 f4">
      <${F} l="Sell price ₹ (excl. GST, 0 = on request)"><input type="number" ...${bind('price')}/></${F}><${F} l="MRP ₹"><input type="number" ...${bind('mrp')}/></${F}><${F} l="Buy price ₹"><input type="number" ...${bind('buy_price')}/></${F}><${F} l="GST %"><input type="number" ...${bind('gst_rate')}/></${F}>
      <${F} l="HSN"><input ...${bind('hsn')}/></${F}><${F} l="Warranty (months)"><input type="number" ...${bind('warranty_months')}/></${F}><${F} l="Minimum stock"><input type="number" ...${bind('min_stock')}/></${F}>${isNew && html`<${F} l="Opening stock"><input type="number" ...${bind('stock')}/></${F}>`}</div>
      <div class="row gap"><label class="chk"><input type="checkbox" ...${bind('published', 'check')}/> Published on website</label><label class="chk"><input type="checkbox" ...${bind('best_seller', 'check')}/> Best seller</label><label class="chk"><input type="checkbox" ...${bind('serial_tracked', 'check')}/> Track serial numbers</label></div></div>
    <div class="card pad"><h3>Highlights, description & specifications</h3><div class="form2"><${F} l="Highlights (one per line)" full><textarea rows="4" ...${bind('highlights')}></textarea></${F}><${F} l="Description" full><textarea rows="4" ...${bind('description')}></textarea></${F}></div>
      <h4>Specifications</h4>${(v.specs || []).map((s, i) => html`<div class="row gap"><input value=${s.k} placeholder="Label" onInput=${(e) => setSpec(i, 'k', e.target.value)}/><input class="grow" value=${s.v} placeholder="Value" onInput=${(e) => setSpec(i, 'v', e.target.value)}/><button class="icbtn" onClick=${() => setV(x => ({ ...x, specs: x.specs.filter((_, j) => j !== i) }))}><${Ic} n="x" s=${14}/></button></div>`)}
      <${Btn} sm kind="ghost" icon="plus" onClick=${() => setV(x => ({ ...x, specs: [...(x.specs || []), { k: '', v: '' }] }))}>Add spec</${Btn}>
      <h4>FAQ</h4>${(v.faq || []).map((s, i) => html`<div class="row gap"><input value=${s.q} placeholder="Question" onInput=${(e) => setFaq(i, 'q', e.target.value)}/><input class="grow" value=${s.a} placeholder="Answer" onInput=${(e) => setFaq(i, 'a', e.target.value)}/><button class="icbtn" onClick=${() => setV(x => ({ ...x, faq: x.faq.filter((_, j) => j !== i) }))}><${Ic} n="x" s=${14}/></button></div>`)}
      <${Btn} sm kind="ghost" icon="plus" onClick=${() => setV(x => ({ ...x, faq: [...(x.faq || []), { q: '', a: '' }] }))}>Add FAQ</${Btn}></div></div>
  <div class="col-stack">
    <div class="card pad"><h3>Images</h3><div class="pgrid big">${(v.image_ids || []).map(i => html`<div class="pimgw"><img src=${'/media/' + i}/><button class="icbtn" onClick=${() => setV(x => ({ ...x, image_ids: x.image_ids.filter(y => y !== i) }))}><${Ic} n="x" s=${12}/></button></div>`)}
      <label class="padd"><${Ic} n="plus"/><input type="file" accept="image/*" multiple onChange=${async (e) => { const ids = await run(() => upload(e.target.files)); setV(x => ({ ...x, image_ids: [...(x.image_ids || []), ...ids] })); }}/></label></div>
      <p class="muted small">First image is the main photo. Without photos, the built-in illustration is used:</p><select ...${bind('art')}>${ARTS.map(a => html`<option>${a}</option>`)}</select></div>
    <div class="card pad"><h3>SEO</h3><${F} l="Meta title"><input ...${bind('meta_title')}/></${F}><${F} l="Meta description"><textarea rows="3" ...${bind('meta_desc')}></textarea></${F}></div>
    <div class="card pad"><h3>Frequently bought together</h3><select multiple size="6" onChange=${(e) => setV(x => ({ ...x, related: [...e.target.selectedOptions].map(o => +o.value) }))}>${(all.data || []).filter(p => p.id !== +id).map(p => html`<option value=${p.id} selected=${(v.related || []).includes(p.id)}>${p.name}</option>`)}</select><small class="muted">Ctrl/Cmd-click to select multiple</small></div>
    <div class="row gap"><${Btn} onClick=${save}>Save product</${Btn}>${!isNew && html`<a class="btn b-ghost" target="_blank" href=${'/product/' + v.slug}>View</a><${Btn} kind="ghost" icon="trash" onClick=${async () => { if (confirm('Delete product? (If used in orders it will be hidden instead.)')) { await run(() => del('/api/cms/products/' + id), 'Done'); go('/products'); } }}>Delete</${Btn}>`}</div>
  </div></div>`;
}
const SIMPLE = {
  categories: [['name', 'Name'], ['slug', 'URL slug'], ['blurb', 'Short description'], ['subtypes', 'Types (comma separated)'], ['sort', 'Order']],
  brands: [['name', 'Brand name'], ['logo_id', 'Logo', 'img'], ['sort', 'Order']],
  sectors: [['name', 'Sector'], ['slug', 'URL slug'], ['icon', 'Icon (home/building/cap/factory/plus/store)'], ['headline', 'Headline'], ['intro', 'Intro', 'area'], ['packages', 'Packages', 'pkgs'], ['sort', 'Order']],
  banners: [['title', 'Title'], ['subtitle', 'Subtitle'], ['image_id', 'Image', 'img'], ['link', 'Link URL'], ['active', 'Active', 'check'], ['sort', 'Order']],
  gallery: [['image_id', 'Photo', 'img'], ['caption', 'Caption'], ['sort', 'Order']],
};
export function Simple({ t }) {
  const q = useApi('/api/cms/' + t, [t]); const [ed, setEd] = useState(null); const cols = SIMPLE[t];
  return html`<div><div class="row between"><span class="muted">Changes appear on the website instantly.</span><${Btn} icon="plus" onClick=${() => setEd({ active: true, packages: [] })}>Add</${Btn}></div>
  <${Load} q=${q}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr>${cols.filter(c => c[2] !== 'pkgs' && c[2] !== 'area').map(c => html`<th>${c[1]}</th>`)}<th></th></tr></thead><tbody>
    ${rows.map(r => html`<tr>${cols.filter(c => c[2] !== 'pkgs' && c[2] !== 'area').map(([k, , ty]) => html`<td>${ty === 'img' ? (r[k] ? html`<img class="thumbimg" src=${'/media/' + r[k]}/>` : '—') : ty === 'check' ? (r[k] ? '✓' : '') : String(r[k] == null ? '' : r[k])}</td>`)}
      <td class="nowrap"><button class="icbtn" onClick=${() => setEd(r)}><${Ic} n="edit" s=${15}/></button><button class="icbtn" onClick=${async () => { if (confirm('Delete?')) { await run(() => del(`/api/cms/${t}/${r.id}`)); q.reload(); } }}><${Ic} n="trash" s=${15}/></button></td></tr>`)}</tbody></table></div>`}<//>
  ${ed && html`<${SimpleEdit} t=${t} cols=${cols} r=${ed} onClose=${() => setEd(null)} onDone=${() => { setEd(null); q.reload(); }}/>`}</div>`;
}
function SimpleEdit({ t, cols, r, onClose, onDone }) {
  const [v, bind, setV] = useForm({ ...r, packages: r.packages || [] });
  return html`<${Modal} wide=${t === 'sectors'} title=${(r.id ? 'Edit ' : 'Add ') + t.replace(/s$/, '')} onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => r.id ? put(`/api/cms/${t}/${r.id}`, v) : api(`/api/cms/${t}`, { body: v }), 'Saved'); onDone(); }}>Save</${Btn}>`}>
    <div class="form2">${cols.map(([k, l, ty]) => ty === 'img' ? html`<${F} l=${l}><div class="row gap">${v[k] && html`<img class="thumbimg" src=${'/media/' + v[k]}/>`}<input type="file" accept="image/*" onChange=${async (e) => { const [id] = await run(() => upload(e.target.files)); setV(s => ({ ...s, [k]: id })); }}/></div></${F}>`
      : ty === 'check' ? html`<label class="chk"><input type="checkbox" ...${bind(k, 'check')}/> ${l}</label>`
      : ty === 'area' ? html`<${F} l=${l} full><textarea rows="3" ...${bind(k)}></textarea></${F}>`
      : ty === 'pkgs' ? html`<div class="full"><b>${l}</b>${v.packages.map((p, i) => html`<div class="row gap"><input value=${p.t} placeholder="Title" onInput=${(e) => setV(s => ({ ...s, packages: s.packages.map((x, j) => j === i ? { ...x, t: e.target.value } : x) }))}/><input class="grow" value=${p.d} placeholder="Description" onInput=${(e) => setV(s => ({ ...s, packages: s.packages.map((x, j) => j === i ? { ...x, d: e.target.value } : x) }))}/><select value=${p.art} onChange=${(e) => setV(s => ({ ...s, packages: s.packages.map((x, j) => j === i ? { ...x, art: e.target.value } : x) }))}>${ARTS.map(a => html`<option>${a}</option>`)}</select><button class="icbtn" onClick=${() => setV(s => ({ ...s, packages: s.packages.filter((_, j) => j !== i) }))}><${Ic} n="x" s=${14}/></button></div>`)}<${Btn} sm kind="ghost" icon="plus" onClick=${() => setV(s => ({ ...s, packages: [...s.packages, { t: '', d: '', art: 'dome' }] }))}>Add package</${Btn}></div>`
      : html`<${F} l=${l}><input ...${bind(k)}/></${F}>`)}</div><//>`;
}
export function Pages() {
  const q = useApi('/api/cms/pages'); const [ed, setEd] = useState(null);
  return html`<div><div class="row between"><span class="muted">About-us text, stats and contact details are in Settings → Company.</span><${Btn} icon="plus" onClick=${() => setEd({ slug: '' })}>New page</${Btn}></div>
  <${Load} q=${q}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr><th>Page</th><th>URL</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map(p => html`<tr><td><b>${p.title}</b></td><td><a href=${'/page/' + p.slug} target="_blank">/page/${p.slug}</a></td><td>${dt(p.updated_at)}</td><td><button class="icbtn" onClick=${() => setEd(p)}><${Ic} n="edit" s=${15}/></button></td></tr>`)}</tbody></table></div>`}<//>
  ${ed && html`<${PageEdit} p=${ed} onClose=${() => setEd(null)} onDone=${() => { setEd(null); q.reload(); }}/>`}</div>`;
}
function PageEdit({ p, onClose, onDone }) {
  const [v, bind] = useForm(p);
  return html`<${Modal} wide title="Edit page" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { if (!v.slug) return toast('Slug required', 'err'); await run(() => put('/api/cms/pages/' + v.slug, v), 'Saved'); onDone(); }}>Save</${Btn}>`}>
  <div class="form2"><${F} l="URL slug"><input ...${bind('slug')} disabled=${!!p.slug}/></${F}><${F} l="Title"><input ...${bind('title')}/></${F}><${F} l="Content (blank line = new paragraph)" full><textarea rows="12" ...${bind('body')}></textarea></${F}>
  <${F} l="Meta title"><input ...${bind('meta_title')}/></${F}><${F} l="Meta description"><input ...${bind('meta_desc')}/></${F}></div><//>`;
}

// ================= Settings & integrations =================
export function Settings({ user }) {
  const q = useApi('/api/cms/settings'); const [tab, setTab] = useState('sales');
  return html`<div><div class="ph"><h1>Settings & integrations</h1><a class="btn b-ghost" href="/admin#/settings"><${Ic} n="globe" s=${15}/> Website & company details → Admin</a></div>
  <${Tabs} tabs=${[['sales', 'Sales rules'], ['whatsapp', 'WhatsApp API'], ['channels', 'Lead channels'], ['email', 'Email'], ['payments', 'Payments'], ['data', 'Backup & data'], ['account', 'My account']]} cur=${tab} onChange=${setTab}/>
  <${Load} q=${q}>${(s) => html`<div class="mt"><${SettingsForm} key=${tab} tab=${tab} s=${s} reload=${q.reload}/></div>`}<//></div>`;
}
function SettingsForm({ tab, s, reload }) {
  const [v, bind] = useForm(s); const base = s.public_url || location.origin; const key = s.webhook_key;
  const save = async () => { await run(() => put('/api/cms/settings', v), 'Settings saved'); reload(); };
  const fld = (k, l, ph, type) => html`<${F} l=${l}><input type=${type || 'text'} ...${bind(k)} placeholder=${ph || ''}/></${F}>`;
  const url = (u) => html`<div class="codeline"><code>${u}</code><button class="icbtn" onClick=${() => { navigator.clipboard && navigator.clipboard.writeText(u); toast('Copied'); }}><${Ic} n="copy" s=${14}/></button></div>`;
  const SaveBtn = html`<div class="mt"><${Btn} onClick=${save}>Save</${Btn}></div>`;
  if (tab === 'company') return html`<div class="card pad"><div class="form2">${fld('company_name', 'Company name')}${fld('tagline', 'Tagline')}${fld('phone_sales', 'Sales phone', '+91 98XXX XXXXX')}${fld('phone_whatsapp', 'WhatsApp number', '+91 98XXX XXXXX')}${fld('phone_service', 'Service desk phone')}${fld('email', 'Email')}
    ${fld('address', 'Showroom address')}${fld('city', 'City line', 'Bhilwara, Rajasthan')}${fld('timings', 'Timings')}${fld('map_query', 'Google Maps search text')}${fld('gstin', 'GSTIN (on invoices)')}${fld('google_review_url', 'Google review link')}
    ${fld('stat_years', 'Stat: since')}${fld('stat_products', 'Stat: products')}${fld('stat_installs', 'Stat: installations')}${fld('stat_sectors', 'Stat: sectors')}
    <${F} l="About us text" full><textarea rows="6" ...${bind('about_text')}></textarea></${F}>${fld('ga_id', 'Google Analytics ID', 'G-XXXXXXX')}${fld('gsc_verification', 'Search Console verification code')}</div>
    <p class="muted small">Sitemap for Search Console: ${base}/sitemap.xml</p>${SaveBtn}</div>`;
  if (tab === 'sales') return html`<div class="card pad"><div class="form2">${fld('max_discount_pct', 'Max discount % without approval', '', 'number')}${fld('min_margin_pct', 'Min margin % without approval', '', 'number')}
    <${F} l="WhatsApp chatbot for new chats"><select ...${bind('wa_bot_enabled')}><option value="1">On</option><option value="0">Off (create lead directly)</option></select></${F}>
    <${F} l="Customer OTP required to close jobs"><select ...${bind('require_otp')}><option value="1">Yes (OTP or signature)</option><option value="0">No</option></select></${F}>
    <${F} l="Staff alerts on WhatsApp"><select ...${bind('staff_wa_alerts')}><option value="0">In-app only</option><option value="1">In-app + WhatsApp</option></select></${F}>
    <${F} l="Inbox quick replies (JSON list)" full><input ...${bind('quick_replies')}/></${F}></div>${SaveBtn}</div>`;
  if (tab === 'whatsapp') return html`<div class="card pad"><div class="note"><b>Official WhatsApp Business Cloud API (Meta)</b> — real two-way integration, not redirect. Needs: Meta Business account (verified), a phone number registered on WhatsApp Cloud API, a permanent System User token. Meta charges per conversation (marketing / utility / authentication) as per Meta’s India rate card; service conversations (customer-initiated) are free within 24 h. Messages outside 24 h need approved templates (set names below).</div>
    <div class="form2">${fld('wa_phone_id', 'Phone number ID')}${fld('wa_token', 'Permanent access token', '', 'password')}${fld('meta_app_secret', 'App secret (webhook signature)', '', 'password')}${fld('meta_verify_token', 'Webhook verify token')}
    ${fld('wa_tpl_quote', 'Template: quotation (4 params)')}${fld('wa_tpl_payment', 'Template: payment reminder (4 params)')}${fld('wa_tpl_amc', 'Template: AMC reminder (3 params)')}${fld('wa_tpl_nudge', 'Template: follow-up nudge (1 param)')}${fld('wa_tpl_otp', 'Template: OTP (1 param)')}</div>
    <h4>Webhook URL (Meta App → WhatsApp → Configuration)</h4>${url(base + '/webhooks/whatsapp')}<p class="small muted">Subscribe to: messages</p>${SaveBtn}
    <h4 class="mt">Test</h4><${TestWa}/></div>`;
  if (tab === 'channels') return html`<div class="card pad"><p class="muted">Every channel posts into the same CRM lead inbox with source tracking, duplicate detection and auto-assignment. Webhook key: <code>${key}</code></p>
    <h4>Facebook & Instagram — Lead Ads + Messenger/IG DMs (Meta Graph API)</h4><div class="form2">${fld('meta_page_token', 'Page access token (leads_retrieval, pages_messaging, instagram_manage_messages)', '', 'password')}</div>${url(base + '/webhooks/meta')}<p class="small muted">Subscribe the Page to <b>leadgen</b> and <b>messages</b>; Instagram to <b>messages</b>. Requires Meta app review for these permissions.</p>
    <h4>IndiaMART — CRM Integration API (pull every 10 min) + Push API</h4><div class="form2">${fld('indiamart_key', 'IndiaMART CRM key (Lead Manager → Import/Export → CRM integration)', '', 'password')}</div>${url(base + '/webhooks/indiamart?key=' + key)}<p class="small muted">Push URL above can be given to IndiaMART for real-time; pull API works with key only. Available on IndiaMART paid seller plans.</p>
    <h4>Google Ads lead forms</h4>${url(base + '/webhooks/google-ads')}<p class="small muted">In Google Ads → Lead form → Webhook: use URL above and key <code>${key}</code>.</p>
    <h4>Google Business Profile / LinkedIn Lead Gen / Justdial / any form</h4>${url(base + '/webhooks/lead?key=' + key)}<p class="small muted">LinkedIn Lead Gen Forms API needs LinkedIn Marketing Developer Platform approval; until then connect via Zapier / Make (LinkedIn Lead Gen trigger → POST JSON {name, phone, email, company, need, source:"linkedin"}). Google Business Profile messages/calls are not exposed by Google’s API — route GBP calls via an IVR number (below).</p>
    <h4>Phone calls / missed calls (Exotel, Knowlarity, MyOperator, Tata Tele IVR)</h4>${url(base + '/webhooks/call?key=' + key)}<p class="small muted">Set as “passthru / call-end webhook” in your IVR provider. Paid IVR number required (~₹500–₹1,500/month).</p>
    <h4>Website</h4><p class="small muted">All website forms (enquiry, quote, quick enquiry, sector assessment, contact, service request) are captured automatically.</p>${SaveBtn}</div>`;
  if (tab === 'email') return html`<div class="card pad"><h4>Outgoing (quotations by email) — SMTP</h4><div class="form2">${fld('smtp_host', 'SMTP host', 'smtp.gmail.com')}${fld('smtp_port', 'Port', '587')}${fld('smtp_user', 'Username')}${fld('smtp_pass', 'Password / app password', '', 'password')}${fld('smtp_from', 'From', 'IT Paradise <info@itparadise.in>')}</div>
    <h4>Incoming enquiries → leads (IMAP, every 5 min)</h4><div class="form2">${fld('imap_host', 'IMAP host', 'imap.gmail.com')}${fld('imap_port', 'Port', '993')}${fld('imap_user', 'Mailbox (e.g. info@itparadise.in)')}${fld('imap_pass', 'Password / app password', '', 'password')}</div><p class="small muted">Unread emails become leads (sender, subject, phone number detected from body) and are marked read.</p>${SaveBtn}</div>`;
  if (tab === 'payments') return html`<div class="card pad"><h4>Business & billing details</h4><div class="form2">${fld('company_name', 'Company name (on PDFs)')}${fld('gstin', 'GSTIN (on invoices)')}${fld('address', 'Billing address (on PDFs)')}${fld('google_review_url', 'Google review link (after installation)')}${fld('upi_id', 'UPI ID (for pay links & invoices)', 'itparadise@okaxis')}${fld('bank_details', 'Bank details (on invoices)')}${fld('payment_link_base', 'Payment gateway link template (optional)', 'https://rzp.io/l/{invoice}')}</div><p class="small muted">By default the payment link opens a page with UPI deep-link for the exact due amount. For card / netbanking, connect Razorpay / Cashfree payment links (gateway charges ~2%).</p>${SaveBtn}</div>`;
  if (tab === 'data') return html`<div class="card pad"><h4>Full backup</h4><p class="muted small">Download the complete database (all tables) as JSON. Railway Postgres also keeps automated backups.</p><${Btn} icon="download" onClick=${() => openFile('/api/backup', 'itparadise-backup.json')}>Download backup</${Btn}>
    <h4 class="mt">Restore</h4><p class="muted small t-red">Replaces ALL current data with the backup file.</p><input type="file" accept=".json" onChange=${async (e) => { if (!confirm('Restore will replace all current data. Continue?')) return; const j = JSON.parse(await e.target.files[0].text()); await run(() => api('restore', { body: j }), 'Restored'); }}/>
    <h4 class="mt">Export (CSV / Excel)</h4><div class="chips">${['customers', 'leads', 'quotations', 'orders', 'invoices', 'payments', 'products', 'suppliers', 'purchases', 'serials', 'jobs', 'amcs', 'activities', 'audit_log'].map(t => html`<button class="chip" onClick=${() => openFile('/api/export/' + t, t + '.csv')}>${t}</button>`)}</div>
    ${s.demo_data === '1' && html`<h4 class="mt">Demo data</h4><p class="muted small">Sample leads, quotes, orders and tickets were added for training. Remove them before going live (products, website content and users are kept).</p><${Btn} kind="ghost" icon="trash" onClick=${async () => { if (confirm('Delete ALL leads, customers, quotes, orders, payments, jobs, AMCs and messages?')) { await run(() => api('/api/cms/clear-demo', { body: {} }), 'Demo data cleared'); reload(); } }}>Clear demo data</${Btn}>`}
    <h4 class="mt">API documentation</h4><p class="small"><a href="/static/API.md" target="_blank">REST API & webhook reference</a></p></div>`;
  if (tab === 'account') return html`<${Account}/>`;
}
function TestWa() { const [v, bind] = useForm({ phone: '', text: 'Test message from IT Paradise CRM ✅' }); return html`<div class="row gap"><input ...${bind('phone')} placeholder="91XXXXXXXXXX"/><input class="grow" ...${bind('text')}/><${Btn} kind="wa" onClick=${async () => { const r = await run(() => api('/api/cms/settings/test-whatsapp', { body: v })); toast(r.ok ? 'Sent ✓' : 'Failed: ' + (r.error || r.status), r.ok ? 'ok' : 'err'); }}>Send test</${Btn}></div>`; }
export function Account() { const [p, setP] = useState(''); return html`<div class="card pad narrow"><h3>Change my password</h3><input type="password" value=${p} onInput=${(e) => setP(e.target.value)} placeholder="New password (min 6)"/><div class="mt"><${Btn} onClick=${async () => { await run(() => api('me/password', { body: { password: p } }), 'Password changed'); setP(''); }}>Update password</${Btn}></div></div>`; }

// ================= Separate website admin (/admin) =================
export function AdminHome() {
  const p = useApi('/api/cms/products'); const c = useApi('/api/cms/categories'); const e = useApi('/api/cms/enquiries');
  return html`<div><div class="ph"><h1>Website admin</h1><a class="btn b-ghost" href="/" target="_blank"><${Ic} n="ext" s=${15}/> View website</a></div>
    <div class="kpis">${[['Products', p.data && p.data.length, '#/products'], ['Published', p.data && p.data.filter(x => x.published).length, '#/products'], ['Best sellers', p.data && p.data.filter(x => x.best_seller).length, '#/products'], ['Categories', c.data && c.data.length, '#/categories'], ['Enquiries (7 d)', e.data && e.data.week, '#/enquiries'], ['Quote requests (7 d)', e.data && e.data.quotes, '#/enquiries']].map(([l, v, h]) => html`<a class="kpi click" href=${h}><small>${l}</small><b>${v == null ? '…' : v}</b></a>`)}</div>
    <div class="g2c"><div class="card pad"><h3>Quick actions</h3><div class="qa"><a class="btn b-ghost" href="#/products/new">+ New product</a><a class="btn b-ghost" href="#/categories">Manage categories</a><a class="btn b-ghost" href="#/banners">Home banners</a><a class="btn b-ghost" href="#/settings">Contact details, about us & SEO</a></div></div>
    <div class="card pad"><h3>Latest website enquiries</h3><${Load} q=${e}>${(d) => d.rows.length ? d.rows.slice(0, 8).map(r => html`<div class="lrow"><div><b>${r.name}</b><small>${r.source_detail || ''} · ${r.need || ''}</small></div><small>${dt(r.created_at, 1)}</small></div>`) : html`<${Empty}/>`}<//><p class="muted small">Enquiries are handled by the sales team in the <a class="t-blue" href="/crm">CRM</a>.</p></div></div></div>`;
}
export function Enquiries() {
  const e = useApi('/api/cms/enquiries');
  return html`<div><div class="ph"><h1>Website enquiries</h1><a class="btn b-ghost" href="/crm#/leads">Open in CRM →</a></div><${Load} q=${e}>${(d) => html`<div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Name</th><th>Mobile</th><th>Form</th><th>Requirement</th><th>Assigned</th><th>Stage</th></tr></thead><tbody>
    ${d.rows.map(r => html`<tr><td>${dt(r.created_at, 1)}</td><td><b>${r.name}</b></td><td>${r.phone ? '+' + r.phone : ''}</td><td>${r.source_detail}</td><td class="clip">${r.need}</td><td>${r.owner || '—'}</td><td><${Badge} s=${r.stage}/></td></tr>`)}</tbody></table></div>`}<//></div>`;
}
export function WebsiteSettings() {
  const q = useApi('/api/cms/settings');
  return html`<div><div class="ph"><h1>Website settings</h1><a class="btn b-ghost" href="/" target="_blank"><${Ic} n="ext" s=${15}/> View website</a></div><${Load} q=${q}>${(s) => html`<${SettingsForm} tab="company" s=${s} reload=${q.reload}/>`}<//></div>`;
}
