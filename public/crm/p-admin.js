import { html, useState, useEffect, useRef, api, put, del, useApi, Load, Ic, Badge, inr, dt, go, toast, run, Btn, Modal, F, useForm, Search, Tabs, Empty, openFile, auth, ProductPicker } from './ui.js';

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
  const [bg, setBg] = useState(null);
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
    <div class="card pad"><h3>Images</h3><div class="pgrid big">${(v.image_ids || []).map((i, ix) => html`<div class="pimgw"><img src=${'/media/' + i}/><button class="icbtn" title="Remove image" onClick=${() => setV(x => ({ ...x, image_ids: x.image_ids.filter(y => y !== i) }))}><${Ic} n="x" s=${12}/></button>
        <button class="bgbtn" title="Remove background" onClick=${() => setBg({ id: i, ix })}>✨ BG</button>${ix > 0 && html`<button class="mainbtn" title="Make main photo" onClick=${() => setV(x => ({ ...x, image_ids: [i, ...x.image_ids.filter(y => y !== i)] }))}>★</button>`}</div>`)}
      <label class="padd"><${Ic} n="plus"/><input type="file" accept="image/*" multiple onChange=${async (e) => { const ids = await run(() => upload(e.target.files)); setV(x => ({ ...x, image_ids: [...(x.image_ids || []), ...ids] })); }}/></label></div>
      <p class="muted small">✨ BG = automatic background remove · ★ = make main photo</p>
      <p class="muted small">First image is the main photo. Without photos, the built-in illustration is used:</p><select ...${bind('art')}>${ARTS.map(a => html`<option>${a}</option>`)}</select></div>
    <div class="card pad"><h3>SEO</h3><${F} l="Meta title"><input ...${bind('meta_title')}/></${F}><${F} l="Meta description"><textarea rows="3" ...${bind('meta_desc')}></textarea></${F}></div>
    <div class="card pad"><h3>Frequently bought together</h3><p class="muted small">Shown on the product page with “Add to quote”. Drag order with ↑ ↓.</p>
      ${(v.related || []).map((rid, ix) => { const rp = (all.data || []).find(p => p.id === rid); return html`<div class="fbt-item"><span class="fbt-n">${ix + 1}</span><div class="grow"><b>${rp ? rp.name : '#' + rid}</b><small class="muted">${rp ? (+rp.price ? inr(rp.price) : 'On request') : ''}</small></div>
        <button class="icbtn" disabled=${ix === 0} onClick=${() => setV(x => { const r = [...x.related]; [r[ix - 1], r[ix]] = [r[ix], r[ix - 1]]; return { ...x, related: r }; })}>↑</button>
        <button class="icbtn" disabled=${ix === v.related.length - 1} onClick=${() => setV(x => { const r = [...x.related]; [r[ix + 1], r[ix]] = [r[ix], r[ix + 1]]; return { ...x, related: r }; })}>↓</button>
        <button class="icbtn" onClick=${() => setV(x => ({ ...x, related: x.related.filter(y => y !== rid) }))}><${Ic} n="x" s=${14}/></button></div>`; })}
      ${!(v.related || []).length && html`<p class="muted small">None selected — similar best sellers are shown automatically.</p>`}
      <${ProductPicker} ph="Search & add product…" onPick=${(p) => !p.custom && p.id !== +id && setV(x => ({ ...x, related: [...new Set([...(x.related || []), p.id])] }))}/></div>
    <div class="row gap"><${Btn} onClick=${save}>Save product</${Btn}>${!isNew && html`<a class="btn b-ghost" target="_blank" href=${'/product/' + v.slug}>View</a><${Btn} kind="ghost" icon="trash" onClick=${async () => { if (confirm('Delete product? (If used in orders it will be hidden instead.)')) { await run(() => del('/api/cms/products/' + id), 'Done'); go('/products'); } }}>Delete</${Btn}>`}</div>
  </div>${bg && html`<${BgRemove} mediaId=${bg.id} onClose=${() => setBg(null)} onDone=${(nid) => { setV(x => ({ ...x, image_ids: x.image_ids.map(y => y === bg.id ? nid : y) })); setBg(null); }}/>`}</div>`;
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
    <${F} l="Inbox quick replies (JSON list)" full><input ...${bind('quick_replies')}/></${F}>
    <${F} l="Default quotation terms & conditions (one per line — editable per quotation)" full><textarea rows="8" ...${bind('quote_terms')}></textarea></${F}>
    <${F} l="Default delivery terms" full><input ...${bind('delivery_terms')}/></${F}>
    <${F} l="Walk-in repair job-sheet terms" full><textarea rows="3" ...${bind('carry_in_terms')}></textarea></${F}>
    <${F} l="Staff live location tracking"><select ...${bind('location_tracking')}><option value="1">On (while checked in & app open)</option><option value="0">Off</option></select></${F}>
    <${F} l="Location update every (minutes)"><input type="number" min="1" ...${bind('location_interval_min')}/></${F}></div>${SaveBtn}</div>`;
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

// ================= Automatic background removal =================
// Edge flood-fill on plain/studio backgrounds (no external service), optional remove.bg API for complex photos.
function removeBg(img, tol, feather, crop) {
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h), p = d.data;
  // background reference = median colour of the border
  const sam = []; const add = (i, j) => { const k = (j * w + i) * 4; sam.push([p[k], p[k + 1], p[k + 2]]); };
  for (let i = 0; i < w; i += Math.max(1, w >> 7)) { add(i, 0); add(i, h - 1); } for (let j = 0; j < h; j += Math.max(1, h >> 7)) { add(0, j); add(w - 1, j); }
  const med = [0, 1, 2].map(ch => sam.map(s => s[ch]).sort((a, b) => a - b)[sam.length >> 1]);
  const dist = (k) => Math.sqrt((p[k] - med[0]) ** 2 + (p[k + 1] - med[1]) ** 2 + (p[k + 2] - med[2]) ** 2);
  const seen = new Uint8Array(w * h), st = []; const T = tol, T2 = tol * (1 + feather);
  for (let i = 0; i < w; i++) { st.push(i, (h - 1) * w + i); } for (let j = 0; j < h; j++) { st.push(j * w, j * w + w - 1); }
  while (st.length) { const n = st.pop(); if (seen[n]) continue; const k = n * 4; const dd = dist(k); if (dd > T2) continue; seen[n] = 1;
    p[k + 3] = dd <= T ? 0 : Math.round(255 * (dd - T) / (T2 - T)); const i = n % w, j = (n / w) | 0;
    if (i > 0) st.push(n - 1); if (i < w - 1) st.push(n + 1); if (j > 0) st.push(n - w); if (j < h - 1) st.push(n + w); }
  x.putImageData(d, 0, 0);
  if (!crop) return c;
  let x0 = w, y0 = h, x1 = 0, y1 = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (p[(j * w + i) * 4 + 3] > 20) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  if (x1 <= x0) return c; const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
}
export function BgRemove({ mediaId, onClose, onDone }) {
  const [tol, setTol] = useState(38); const [fe, setFe] = useState(0.6); const [crop, setCrop] = useState(true); const [img, setImg] = useState(null); const [out, setOut] = useState(null); const [busy, setBusy] = useState(false);
  const s = useApi('/api/cms/settings');
  useEffect(() => { const i = new Image(); i.onload = () => setImg(i); i.src = '/media/' + mediaId; }, [mediaId]);
  useEffect(() => { if (!img) return; const t = setTimeout(() => setOut(removeBg(img, tol, fe, crop)), 60); return () => clearTimeout(t); }, [img, tol, fe, crop]);
  const save = async (blob) => { const fd = new FormData(); fd.append('files', blob, 'product-nobg.png'); const r = await api('/api/cms/media', { body: fd }); onDone(r.ids[0]); toast('Background removed ✓'); };
  return html`<${Modal} wide title="Remove background" onClose=${onClose} foot=${html`
    ${s.data && s.data.removebg_key && html`<${Btn} kind="ghost" onClick=${async () => { setBusy(true); try { const r = await run(() => api('/api/cms/removebg/' + mediaId, { body: {} })); onDone(r.id); toast('Background removed (AI) ✓'); } finally { setBusy(false); } }}>AI remove (remove.bg)</${Btn}>`}
    <${Btn} disabled=${!out || busy} onClick=${() => new Promise(ok => out.toBlob(async b => { await run(() => save(b)); ok(); }, 'image/png'))}>Save transparent PNG</${Btn}>`}>
    <div class="bgwrap"><div><small class="muted">Original</small><div class="bgprev">${img && html`<img src=${img.src}/>`}</div></div>
      <div><small class="muted">Result</small><div class="bgprev checker">${out ? html`<img src=${out.toDataURL('image/png')}/>` : html`<div class="spin"><span></span></div>`}</div></div></div>
    <div class="form2 mt"><${F} l=${'Strength: ' + tol}><input type="range" min="8" max="120" value=${tol} onInput=${(e) => setTol(+e.target.value)}/></${F}><${F} l=${'Edge softness: ' + fe}><input type="range" min="0" max="1.5" step="0.1" value=${fe} onInput=${(e) => setFe(+e.target.value)}/></${F}></div>
    <label class="chk"><input type="checkbox" checked=${crop} onChange=${(e) => setCrop(e.target.checked)}/> Auto-crop to product</label>
    <p class="muted small">Works best on studio / plain-background photos. For busy backgrounds add a remove.bg API key in Admin → Appearance to enable AI removal.</p><//>`;
}

// ================= Appearance (logo, theme, fonts, hero, home sections) =================
const FONTS = ['Poppins', 'Montserrat', 'Inter', 'Outfit', 'Plus Jakarta Sans', 'Manrope', 'Raleway', 'Nunito', 'Roboto', 'Open Sans', 'Lato', 'Playfair Display', 'DM Serif Display'];
const SECTION_LABELS = { banners: 'Home banners', categories: 'Shop by category', industries: 'Solutions by industry & project', best: 'Best sellers', how: 'How we work', quote: 'Quote form' };
export function Appearance() {
  const q = useApi('/api/cms/settings');
  return html`<div><div class="ph"><h1>Appearance</h1><a class="btn b-ghost" href="/" target="_blank"><${Ic} n="ext" s=${15}/> Preview website</a></div><${Load} q=${q}>${(s) => html`<${AppearanceForm} s=${s} reload=${q.reload}/>`}<//></div>`;
}
function AppearanceForm({ s, reload }) {
  const J = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const [v, bind, setV] = useForm(s);
  const [secs, setSecs] = useState(J(s.home_sections, Object.keys(SECTION_LABELS).map(k => ({ k, on: true }))));
  const [projs, setProjs] = useState(J(s.project_solutions, []));
  const up = async (k, files) => { const ids = await run(() => upload(files)); setV(x => ({ ...x, [k]: String(ids[0]) })); };
  const save = async () => { await run(() => put('/api/cms/settings', { ...v, home_sections: JSON.stringify(secs), project_solutions: JSON.stringify(projs) }), 'Appearance saved — live on website'); reload(); };
  const mv = (i, d) => setSecs(a => { const r = [...a]; const j = i + d; if (j < 0 || j >= r.length) return r; [r[i], r[j]] = [r[j], r[i]]; return r; });
  const color = (k, l) => html`<${F} l=${l}><div class="row gap"><input type="color" class="cpick" value=${v[k] || '#1E9BE0'} onInput=${(e) => setV(x => ({ ...x, [k]: e.target.value }))}/><input ...${bind(k)}/></div></${F}>`;
  return html`<div class="g2c wide-l"><div class="col-stack">
    <div class="card pad"><h3>Logo</h3><div class="row gap logo-row"><div class="logo-prev"><img src=${v.logo_id ? '/media/' + v.logo_id : '/static/img/logo.svg'}/></div>
      <div class="grow"><input type="file" accept="image/*" onChange=${(e) => up('logo_id', e.target.files)}/>${v.logo_id && html`<button class="btn b-ghost sm mt" onClick=${() => setV(x => ({ ...x, logo_id: '' }))}>Use default logo</button>`}</div></div>
      <div class="form2 mt"><${F} l="Company name"><input ...${bind('company_name')}/></${F}><${F} l="Tagline under name"><input ...${bind('logo_tagline')}/></${F}></div>
      <label class="chk"><input type="checkbox" checked=${v.logo_show_text !== '0'} onChange=${(e) => setV(x => ({ ...x, logo_show_text: e.target.checked ? '1' : '0' }))}/> Show company name next to logo (turn off if your logo already has the name)</label></div>
    <div class="card pad"><h3>Theme colours & fonts</h3><div class="form2">${color('theme_primary', 'Primary (buttons, links)')}${color('theme_secondary', 'Secondary (gradient end)')}${color('theme_navy', 'Dark (header, footer, hero)')}
      <${F} l="Heading font"><select ...${bind('heading_font')}>${FONTS.map(f => html`<option>${f}</option>`)}</select></${F}><${F} l="Body font"><select ...${bind('body_font')}>${FONTS.filter(f => !/Serif|Playfair/.test(f)).map(f => html`<option>${f}</option>`)}</select></${F}></div>
      <div class="theme-prev" style=${{ '--p': v.theme_primary, '--s': v.theme_secondary, '--n': v.theme_navy, fontFamily: v.heading_font }}><b>Heading preview — ${v.heading_font}</b><span class="tp-btn">Get a Quote</span><span class="tp-dark">Dark</span></div></div>
    <div class="card pad"><h3>Hero section (top of home page)</h3><div class="form2"><${F} l="Small line above heading"><input ...${bind('hero_eyebrow')}/></${F}><${F} l="Style"><select ...${bind('hero_style')}><option value="laptop">3D laptop animation</option><option value="image">Image / banner on right</option><option value="none">Text only</option></select></${F}>
      <${F} l="Heading line 1"><input ...${bind('hero_title_1')}/></${F}><${F} l="Heading line 2 (gradient)"><input ...${bind('hero_title_2')}/></${F}><${F} l="Sub text" full><textarea rows="2" ...${bind('hero_sub')}></textarea></${F}>
      ${v.hero_style === 'image' && html`<${F} l="Hero image" full><div class="row gap">${v.hero_image_id && html`<img class="thumbimg big" src=${'/media/' + v.hero_image_id}/>`}<input type="file" accept="image/*" onChange=${(e) => up('hero_image_id', e.target.files)}/></div></${F}>`}
      <${F} l="Stat: since"><input ...${bind('stat_years')}/></${F}><${F} l="Stat: products"><input ...${bind('stat_products')}/></${F}><${F} l="Stat: installations"><input ...${bind('stat_installs')}/></${F}><${F} l="Stat: sectors"><input ...${bind('stat_sectors')}/></${F}></div></div>
    <div class="card pad"><h3>Solutions by project</h3>${projs.map((p, i) => html`<div class="proj-ed"><input value=${p.t} placeholder="Title" onInput=${(e) => setProjs(a => a.map((x, j) => j === i ? { ...x, t: e.target.value } : x))}/><input class="grow" value=${p.d} placeholder="Description" onInput=${(e) => setProjs(a => a.map((x, j) => j === i ? { ...x, d: e.target.value } : x))}/>
      <select value=${p.art} onChange=${(e) => setProjs(a => a.map((x, j) => j === i ? { ...x, art: e.target.value } : x))}>${ARTS.map(a => html`<option>${a}</option>`)}</select><input value=${p.link || ''} placeholder="/products/…" onInput=${(e) => setProjs(a => a.map((x, j) => j === i ? { ...x, link: e.target.value } : x))}/>
      <button class="icbtn" onClick=${() => setProjs(a => a.filter((_, j) => j !== i))}><${Ic} n="x" s=${14}/></button></div>`)}
      <${Btn} sm kind="ghost" icon="plus" onClick=${() => setProjs(a => [...a, { t: '', d: '', art: 'dome', link: '' }])}>Add project solution</${Btn}></div>
  </div><div class="col-stack">
    <div class="card pad"><h3>Home page layout</h3><p class="muted small">Turn sections on/off and change their order.</p>
      ${secs.map((x, i) => html`<div class="sec-row"><label class="switch"><input type="checkbox" checked=${x.on} onChange=${(e) => setSecs(a => a.map((y, j) => j === i ? { ...y, on: e.target.checked } : y))}/><span></span></label><b class="grow">${SECTION_LABELS[x.k] || x.k}</b><button class="icbtn" onClick=${() => mv(i, -1)}>↑</button><button class="icbtn" onClick=${() => mv(i, 1)}>↓</button></div>`)}
      <p class="muted small">Edit section content: <a class="t-blue" href="#/categories">Categories</a> · <a class="t-blue" href="#/sectors">Industries</a> · <a class="t-blue" href="#/banners">Banners</a> · <a class="t-blue" href="#/products">Best sellers (★ in product)</a></p></div>
    <div class="card pad"><h3>Advanced</h3><${F} l="remove.bg API key (optional, AI background removal)"><input type="password" ...${bind('removebg_key')}/></${F}><${F} l="Custom CSS (optional)"><textarea rows="5" ...${bind('custom_css')} placeholder=".hero{...}"></textarea></${F}></div>
    <div class="savebar"><${Btn} onClick=${save}>Save appearance</${Btn}></div>
  </div></div>`;
}
