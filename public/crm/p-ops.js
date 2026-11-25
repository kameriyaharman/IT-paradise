import { html, useState, useEffect, api, patch, put, useApi, Load, Ic, Badge, Kpi, inr, dt, tm, go, toast, run, Btn, Modal, F, useForm, Search, Tabs, ProductPicker, Empty, openFile, auth, initials, Scanner, SignPad, Bars, CATS, waLink, openExternal } from './ui.js';
import { PaymentModal } from './p-quote.js';

// ================= Stock & purchase =================
export function Stock({ user }) {
  const q = useApi('stock'); const [tab, setTab] = useState('stock'); const [s, setS] = useState('');
  const own = user.role === 'owner';
  const [stockIn, setStockIn] = useState(false); const [poOpen, setPo] = useState(null); const [adj, setAdj] = useState(null);
  const [serial, setSerial] = useState(''); const [sres, setSres] = useState(null); const [scan, setScan] = useState(false);
  const look = async (x) => { const v = x || serial; if (!v) return; try { setSres(await api('serials/' + encodeURIComponent(v))); } catch (e) { setSres({ error: e.message }); } };
  return html`<div><div class="ph"><h1>Stock & purchase</h1><div class="row gap">${own && html`<${Btn} icon="plus" onClick=${() => setStockIn(true)}>Add stock (purchase entry)</${Btn}>`}</div></div>
  ${own && html`<${Tabs} tabs=${[['stock', 'Live stock'], ['purchases', 'Purchases'], ['po', 'Purchase orders'], ['suppliers', 'Suppliers'], ['moves', 'Stock movements']]} cur=${tab} onChange=${setTab}/>`}
  ${tab === 'stock' && html`<${Load} q=${q}>${(d) => html`<div class=${own ? 'g2c wide-l mt' : 'mt'}>
    <div class="card"><div class="pad-s"><${Search} value=${s} onInput=${setS} ph="Search product"/></div><table class="tbl"><thead><tr><th>Product</th><th>In stock</th><th>Reserved</th><th>Available</th><th>Min</th>${own && html`<th>Buy</th>`}<th>Sell</th><th>Status</th>${own && html`<th></th>`}</tr></thead><tbody>
      ${d.rows.filter(r => !s || r.name.toLowerCase().includes(s.toLowerCase()) || (r.sku || '').toLowerCase().includes(s.toLowerCase())).map(r => html`<tr><td><b>${r.name}</b><small>${r.sku || ''} · ${r.category || ''}</small></td><td>${r.stock}</td><td>${r.reserved}</td><td><b>${r.stock - r.reserved}</b></td><td>${r.min_stock}</td>${own && html`<td>${inr(r.buy_price)}</td>`}<td>${inr(r.price)}</td><td><${Badge} s=${r.status}>${r.status === 'ok' ? 'OK' : 'Reorder'}<//></td>${own && html`<td><button class="icbtn" title="Adjust stock" onClick=${() => setAdj(r)}><${Ic} n="edit" s=${15}/></button></td>`}</tr>`)}</tbody></table></div>
    ${own && html`<div class="col-stack"><div class="card pad"><h3>Purchase order · auto-suggested</h3>${d.suggestions.length ? html`${d.suggestions.map(x => html`<div class="lrow"><b>${x.name}</b><span>${x.qty} pcs</span></div>`)}<${Btn} onClick=${() => setPo(d.suggestions.map(x => ({ product_id: x.id, name: x.name, qty: x.qty, rate: +x.buy_price })))}>Create PO</${Btn}>` : html`<${Empty}>All items above minimum ✓<//>`}</div>
      <div class="card pad"><h3>Serial number</h3><div class="row gap"><input class="grow" placeholder="Scan / type serial" value=${serial} onInput=${(e) => setSerial(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && look()}/><${Btn} kind="ghost" icon="scan" onClick=${() => setScan(true)}/><${Btn} onClick=${() => look()}>Find</${Btn}></div>
        ${sres && (sres.error ? html`<p class="t-red">${sres.error}</p>` : html`<${SerialCard} s=${sres}/>`)}</div></div>`}
  </div>`}<//>`}
  ${tab === 'purchases' && html`<${Purchases}/>`}${tab === 'po' && html`<${POs} onNew=${() => setPo([])}/>`}${tab === 'suppliers' && html`<${Suppliers}/>`}${tab === 'moves' && html`<${Moves}/>`}
  ${stockIn && html`<${StockIn} onClose=${() => setStockIn(false)} onDone=${() => { setStockIn(false); q.reload(); }}/>`}
  ${poOpen && html`<${NewPO} items=${poOpen} onClose=${() => setPo(null)} onDone=${() => { setPo(null); setTab('po'); }}/>`}
  ${adj && html`<${Modal} title=${'Adjust stock · ' + adj.name} onClose=${() => setAdj(null)}><${AdjForm} p=${adj} onDone=${() => { setAdj(null); q.reload(); }}/><//>`}
  ${scan && html`<${Scanner} onClose=${() => setScan(false)} onResult=${(v) => { setScan(false); setSerial(v); look(v); }}/>`}</div>`;
}
function AdjForm({ p, onDone }) { const [v, bind] = useForm({ qty: '', note: 'Physical count' }); return html`<div class="form2"><${F} l="Qty (+ add / − remove)"><input type="number" ...${bind('qty')}/></${F}><${F} l="Reason"><input ...${bind('note')}/></${F}></div><${Btn} onClick=${async () => { await run(() => api('stock/adjust', { body: { product_id: p.id, ...v } }), 'Stock adjusted'); onDone(); }}>Save</${Btn}>`; }
export function SerialCard({ s }) {
  return html`<div class="serial"><b>${s.serial}</b><small>${s.product || ''}</small>
    ${s.purchase_no && html`<div class="tl-mini">Purchased · ${s.purchase_no} ${dt(s.bill_date)}</div>`}${s.order_no && html`<div class="tl-mini">Sold · ${s.order_no} · ${s.customer || ''} ${dt(s.sold_at)}</div>`}
    ${s.warranty_until && html`<div class=${'tl-mini ' + (new Date(s.warranty_until) >= new Date() ? 't-green' : 't-red')}>Warranty till ${dt(s.warranty_until)}</div>`}
    ${(s.jobs || []).map(j => html`<div class="tl-mini">${j.number} · ${j.kind} · ${j.status}</div>`)}</div>`;
}
export function SerialView({ serial }) { const q = useApi('serials/' + encodeURIComponent(serial), [serial]); return html`<div><div class="ph"><h1>Serial lookup</h1></div><div class="card pad narrow"><${Load} q=${q}>${(s) => html`<${SerialCard} s=${s}/>`}<//></div></div>`; }

function StockIn({ onClose, onDone }) {
  const sup = useApi('suppliers'); const [v, bind] = useForm({ supplier_id: '', bill_no: '', bill_date: new Date().toISOString().slice(0, 10), paid: 0 });
  const [items, setItems] = useState([]); const [scanFor, setScanFor] = useState(null);
  const upd = (i, k, val) => setItems(items.map((x, j) => j === i ? { ...x, [k]: val } : x));
  return html`<${Modal} wide title="Purchase entry / stock in" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { if (!items.length) return toast('Add items', 'err'); await run(() => api('purchases', { body: { ...v, items } }), 'Stock added'); onDone(); }}>Save purchase</${Btn}>`}>
    <div class="form2"><${F} l="Supplier"><select ...${bind('supplier_id')}><option value="">—</option>${(sup.data || []).map(s => html`<option value=${s.id}>${s.name}</option>`)}</select></${F}><${F} l="Bill no."><input ...${bind('bill_no')}/></${F}><${F} l="Bill date"><input type="date" ...${bind('bill_date')}/></${F}><${F} l="Paid now ₹"><input type="number" ...${bind('paid')}/></${F}></div>
    <table class="tbl qitems mt"><thead><tr><th>Product</th><th>Qty</th><th>Buy rate</th><th>GST %</th><th>Serial numbers (comma / scan)</th><th></th></tr></thead><tbody>
      ${items.map((i, ix) => html`<tr><td>${i.name}</td><td><input type="number" class="num" value=${i.qty} onInput=${(e) => upd(ix, 'qty', e.target.value)}/></td><td><input type="number" class="num w" value=${i.rate} onInput=${(e) => upd(ix, 'rate', e.target.value)}/></td><td><input type="number" class="num" value=${i.gst_rate} onInput=${(e) => upd(ix, 'gst_rate', e.target.value)}/></td>
        <td><div class="row gap"><input value=${i.serials} onInput=${(e) => upd(ix, 'serials', e.target.value)} placeholder="SN1, SN2…"/><button class="icbtn" onClick=${() => setScanFor(ix)}><${Ic} n="scan" s=${16}/></button></div></td><td><button class="icbtn" onClick=${() => setItems(items.filter((_, j) => j !== ix))}><${Ic} n="x" s=${14}/></button></td></tr>`)}</tbody></table>
    <${ProductPicker} ph="Add product to purchase…" onPick=${(p) => !p.custom && setItems([...items, { product_id: p.id, name: p.name, qty: 1, rate: +p.buy_price || 0, gst_rate: 18, serials: '' }])}/>
    ${scanFor != null && html`<${Scanner} onClose=${() => setScanFor(null)} onResult=${(val) => { const i = scanFor; setScanFor(null); upd(i, 'serials', (items[i].serials ? items[i].serials + ', ' : '') + val); }}/>`}<//>`;
}
function NewPO({ items: init, onClose, onDone }) {
  const sup = useApi('suppliers'); const [items, setItems] = useState(init); const [sid, setSid] = useState('');
  return html`<${Modal} wide title="New purchase order" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => api('purchase-orders', { body: { supplier_id: sid, items } }), 'PO created'); onDone(); }}>Create PO</${Btn}>`}>
    <${F} l="Supplier"><select value=${sid} onChange=${(e) => setSid(e.target.value)}><option value="">—</option>${(sup.data || []).map(s => html`<option value=${s.id}>${s.name}</option>`)}</select></${F}>
    <table class="tbl qitems mt"><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th></th></tr></thead><tbody>${items.map((i, ix) => html`<tr><td>${i.name}</td><td><input type="number" class="num" value=${i.qty} onInput=${(e) => setItems(items.map((x, j) => j === ix ? { ...x, qty: +e.target.value } : x))}/></td><td><input type="number" class="num w" value=${i.rate} onInput=${(e) => setItems(items.map((x, j) => j === ix ? { ...x, rate: +e.target.value } : x))}/></td><td><button class="icbtn" onClick=${() => setItems(items.filter((_, j) => j !== ix))}><${Ic} n="x" s=${14}/></button></td></tr>`)}</tbody></table>
    <${ProductPicker} onPick=${(p) => !p.custom && setItems([...items, { product_id: p.id, name: p.name, qty: 1, rate: 0 }])}/><//>`;
}
function POs({ onNew }) {
  const q = useApi('purchase-orders');
  return html`<div class="card mt"><div class="pad-s row between"><b>Purchase orders</b><${Btn} sm icon="plus" onClick=${onNew}>New PO</${Btn}></div><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(p => html`<tr><td><b>${p.number}</b><small>${dt(p.created_at)}</small></td><td>${p.supplier || '—'}</td><td class="clip">${(p.items || []).map(i => i.name + ' × ' + i.qty).join(', ')}</td><td>${inr(p.total)}</td><td><${Badge} s=${p.status === 'received' ? 'completed' : p.status}>${p.status}<//></td>
    <td class="nowrap"><${Btn} sm kind="ghost" icon="doc" onClick=${() => openFile('/api/purchase-orders/' + p.id + '/pdf')}/> <${Btn} sm kind="wa" icon="wa" onClick=${async () => { const r = await run(() => api(`purchase-orders/${p.id}/send`, { body: {} })); r.ok ? toast('PO sent on WhatsApp') : openExternal(r.waLink); q.reload(); }}>Send PO on WhatsApp</${Btn}></td></tr>`)}</tbody></table>`}<//></div>`;
}
function Purchases() {
  const q = useApi('purchases');
  return html`<div class="card mt"><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>Entry</th><th>Supplier</th><th>Bill</th><th>Taxable</th><th>GST</th><th>Total</th><th>Paid</th></tr></thead><tbody>${rows.map(p => html`<tr><td><b>${p.number}</b></td><td>${p.supplier || '—'}</td><td>${p.bill_no || ''}<small>${dt(p.bill_date)}</small></td><td>${inr(p.subtotal)}</td><td>${inr(p.gst)}</td><td><b>${inr(p.total)}</b></td><td>${inr(p.paid)}</td></tr>`)}</tbody></table>`}<//></div>`;
}
function Suppliers() {
  const q = useApi('suppliers'); const [ed, setEd] = useState(null); const [v, bind, setV] = useForm({});
  return html`<div class="card mt"><div class="pad-s row between"><b>Suppliers & outstanding</b><${Btn} sm icon="plus" onClick=${() => { setV({}); setEd('new'); }}>Add supplier</${Btn}></div><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>Supplier</th><th>Phone</th><th>GSTIN</th><th>Billed</th><th>Paid</th><th>Outstanding</th><th></th></tr></thead><tbody>
    ${rows.map(s => html`<tr><td><b>${s.name}</b></td><td>${s.phone}</td><td>${s.gstin}</td><td>${inr(s.billed)}</td><td>${inr(s.paid)}</td><td class=${s.billed - s.paid > 0 ? 't-red' : ''}><b>${inr(s.billed - s.paid)}</b></td>
    <td class="nowrap"><${Btn} sm kind="ghost" onClick=${() => { setV(s); setEd(s.id); }}>Edit</${Btn}> <${Btn} sm kind="green" onClick=${async () => { const a = prompt('Payment amount to ' + s.name); if (!a) return; await run(() => api(`suppliers/${s.id}/payment`, { body: { amount: a, mode: 'Bank' } }), 'Saved'); q.reload(); }}>Pay</${Btn}></td></tr>`)}</tbody></table>`}<//>
    ${ed && html`<${Modal} title="Supplier" onClose=${() => setEd(null)} foot=${html`<${Btn} onClick=${async () => { await run(() => ed === 'new' ? api('suppliers', { body: v }) : patch('suppliers/' + ed, v), 'Saved'); setEd(null); q.reload(); }}>Save</${Btn}>`}><div class="form2">${['name', 'phone', 'email', 'gstin', 'address'].map(k => html`<${F} l=${k}><input ...${bind(k)}/></${F}>`)}</div><//>`}</div>`;
}
function Moves() { const q = useApi('stock/moves'); return html`<div class="card mt"><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Type</th><th>Ref</th><th>Note</th></tr></thead><tbody>${rows.map(m => html`<tr><td>${dt(m.created_at, 1)}</td><td>${m.name}</td><td class=${m.qty > 0 ? 't-green' : 't-red'}>${m.qty > 0 ? '+' : ''}${+m.qty}</td><td>${m.kind}</td><td>${m.ref || ''}</td><td>${m.note || ''}</td></tr>`)}</tbody></table>`}<//></div>`; }

// ================= Service & AMC =================
export function Service({ user }) {
  const q = useApi('jobs'); const amc = useApi('amcs'); const users = useApi('users');
  const [tab, setTab] = useState('tickets'); const [nt, setNt] = useState(false); const [na, setNa] = useState(false);
  const techs = (users.data || []).filter(u => u.role === 'tech' && u.active);
  return html`<div><div class="ph"><h1>Service & AMC</h1><div class="row gap"><${Btn} icon="plus" onClick=${() => setNt(true)}>New ticket</${Btn}><${Btn} kind="ghost" icon="plus" onClick=${() => setNa(true)}>New AMC</${Btn}></div></div>
  <${Load} q=${q}>${(d) => html`<div class="kpis"><${Kpi} l="Active AMCs" v=${d.k.active_amc}/><${Kpi} l="Renewals (30 d)" v=${d.k.renewals} sub=${inr(d.k.renewals_v)}/><${Kpi} l="Preventive visits due" v=${d.k.preventive}/><${Kpi} l="Avg. resolution" v=${d.k.avg_hr + ' hr'}/></div>
    <${Tabs} tabs=${[['tickets', 'Service tickets'], ['installs', 'Installations'], ['amc', 'AMC contracts'], ['closed', 'Closed']]} cur=${tab} onChange=${setTab}/>
    ${tab !== 'amc' ? html`<div class="card mt"><table class="tbl"><thead><tr><th>Ticket</th><th>Customer</th><th>Issue</th><th>Type</th><th>Technician</th><th>Status</th><th>Created</th></tr></thead><tbody>
      ${d.rows.filter(j => tab === 'closed' ? ['completed', 'closed', 'cancelled'].includes(j.status) : !['completed', 'closed', 'cancelled'].includes(j.status) && (tab === 'installs' ? j.kind === 'installation' : j.kind !== 'installation')).map(j => html`<tr>
        <td><a href=${'#/jobs/' + j.id}><b>${j.number}</b></a><small>${j.kind}${j.order_no ? ' · ' + j.order_no : ''}</small></td><td>${j.cname}</td><td class="clip">${j.issue || j.title}</td><td><${Badge} s=${j.coverage}/></td>
        <td><select class="sel" value=${j.technician_id || ''} onChange=${async (e) => { await run(() => patch('jobs/' + j.id, { technician_id: e.target.value }), 'Assigned'); q.reload(); }}><option value="">— Unassigned</option>${techs.map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></td>
        <td><${Badge} s=${j.status}/></td><td>${dt(j.created_at, 1)}</td></tr>`)}</tbody></table></div>`
      : html`<${Load} q=${amc}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr><th>AMC</th><th>Customer</th><th>Coverage</th><th>Period</th><th>Amount</th><th>Days left</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(a => html`<tr><td><b>${a.number}</b></td><td>${a.cname}</td><td>${a.title}<small>${a.visits_per_year} visits / yr</small></td><td>${dt(a.start_date)} → ${dt(a.end_date)}</td><td>${inr(a.amount)}</td><td class=${a.left_days < 30 ? 't-red' : ''}>${a.left_days}</td><td><${Badge} s=${a.status}/></td>
        <td class="nowrap"><${Btn} sm kind="green" onClick=${async () => { const amt = prompt('Renewal amount ₹', a.amount); if (amt == null) return; await run(() => patch('amcs/' + a.id, { renew: true, amount: amt }), 'Renewed for 1 year'); amc.reload(); }}>Renew</${Btn}> <a class="btn b-wa sm" target="_blank" href=${waLink(a.phone, `Namaste ${a.cname} ji, aapka AMC (${a.title}) ${dt(a.end_date)} ko expire ho raha hai. Renew karein? — IT Paradise`)}><${Ic} n="wa" s=${14}/></a></td></tr>`)}</tbody></table></div>`}<//>`}
    <p class="muted small mt">⚡ Auto renewal reminder 30 / 15 / 3 days before · Warranty ending → AMC offer on WhatsApp · Preventive visits auto-scheduled</p>`}<//>
  ${nt && html`<${NewTicket} techs=${techs} onClose=${() => setNt(false)} onDone=${() => { setNt(false); q.reload(); }}/>`}
  ${na && html`<${NewAmc} onClose=${() => setNa(false)} onDone=${() => { setNa(false); amc.reload(); setTab('amc'); }}/>`}</div>`;
}
function NewTicket({ techs, onClose, onDone }) {
  const [v, bind] = useForm({ kind: 'service', coverage: '' });
  return html`<${Modal} title="New service ticket" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => api('jobs', { body: v }), 'Ticket created'); onDone(); }}>Create ticket</${Btn}>`}>
    <div class="form2"><${F} l="Customer name"><input ...${bind('name')}/></${F}><${F} l="Mobile"><input ...${bind('phone')}/></${F}><${F} l="Issue" full><input ...${bind('issue')} placeholder="3 cameras not showing"/></${F}>
    <${F} l="Category"><select ...${bind('category')}>${['CCTV', 'Computer', 'Network', 'Attendance', 'UPS', 'Printer', 'Other'].map(c => html`<option>${c}</option>`)}</select></${F}>
    <${F} l="Coverage"><select ...${bind('coverage')}><option value="">Auto-detect (warranty / AMC)</option><option value="warranty">Warranty</option><option value="amc">AMC</option><option value="paid">Paid</option><option value="free">Free</option></select></${F}>
    <${F} l="Serial (optional)"><input ...${bind('serial')}/></${F}><${F} l="Technician"><select ...${bind('technician_id')}><option value="">Unassigned</option>${techs.map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></${F}>
    <${F} l="Address" full><input ...${bind('address')}/></${F}><${F} l="Schedule"><input type="datetime-local" ...${bind('scheduled_at')}/></${F}></div><//>`;
}
function NewAmc({ onClose, onDone }) {
  const cust = useApi('customers'); const today = new Date().toISOString().slice(0, 10); const yr = new Date(Date.now() + 364 * 864e5).toISOString().slice(0, 10);
  const [v, bind] = useForm({ start_date: today, end_date: yr, visits_per_year: 4 });
  return html`<${Modal} title="New AMC contract" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => api('amcs', { body: v }), 'AMC created'); onDone(); }}>Save</${Btn}>`}>
    <div class="form2"><${F} l="Customer" full><select ...${bind('customer_id')}><option value="">Select…</option>${(cust.data || []).map(c => html`<option value=${c.id}>${c.name}${c.company ? ' · ' + c.company : ''}</option>`)}</select></${F}>
    <${F} l="Coverage" full><input ...${bind('title')} placeholder="CCTV AMC — 16 cameras"/></${F}><${F} l="Start"><input type="date" ...${bind('start_date')}/></${F}><${F} l="End"><input type="date" ...${bind('end_date')}/></${F}>
    <${F} l="Amount ₹"><input type="number" ...${bind('amount')}/></${F}><${F} l="Preventive visits / year"><input type="number" ...${bind('visits_per_year')}/></${F}></div><//>`;
}

// ================= Job detail (CRM + technician app) =================
export function JobDetail({ id, user, mobile }) {
  const q = useApi('jobs/' + id, [id]); const [scan, setScan] = useState(false); const [sn, setSn] = useState(''); const [done, setDone] = useState(false); const [pay, setPay] = useState(false);
  const addSerial = async (s) => { if (!s) return; await run(() => api(`jobs/${id}/serial`, { body: { serial: s } }), 'Serial linked to warranty'); setSn(''); q.reload(); };
  const upload = async (files, when) => { const fd = new FormData(); [...files].forEach(f => fd.append('photos', f)); await run(() => api(`jobs/${id}/photos?when=${when}`, { body: fd }), 'Photos uploaded'); q.reload(); };
  return html`<${Load} q=${q}>${(d) => { const j = d.job; const c = d.customer || {}; const cl = j.checklist || [];
    const tracked = d.items.filter(i => i.serial_tracked).reduce((a, i) => a + +i.qty, 0); const bal = d.order ? d.order.total - d.order.paid : 0;
    const closed = ['completed', 'closed', 'cancelled'].includes(j.status);
    return html`<div>
    <div class="ph"><h1>${!mobile && html`<a href="#/service" class="back"><${Ic} n="back"/></a>`} Job · ${j.number} <${Badge} s=${j.status}/></h1>${user.role === 'owner' && j.status === 'completed' && html`<${Btn} kind="ghost" onClick=${async () => { await run(() => api(`jobs/${id}/close`, { body: {} })); q.reload(); }}>Close ticket</${Btn}>`}</div>
    <div class=${mobile ? 'col-stack' : 'g2c'}>
      <div class="col-stack"><div class="card pad"><h3>${j.title || j.issue}</h3>${j.issue && j.title !== j.issue && html`<p class="muted">${j.issue}</p>`}
        <div class="info2"><div><small>Customer</small><b>${c.name || '—'}</b></div><div><small>Mobile</small><b><a href=${'tel:+' + (c.phone || j.phone)}>${c.phone || j.phone ? '+' + (c.phone || j.phone) : '—'}</a></b></div>
        <div><small>Address</small><b>${j.address || c.address || c.city || '—'}</b></div><div><small>Coverage</small><${Badge} s=${j.coverage}/></div>${d.order && html`<div><small>Order</small><b>${d.order.number}</b></div>`}<div><small>Technician</small><b>${d.tech ? d.tech.name : 'Unassigned'}</b></div>${user.role === 'owner' && j.otp && !closed && html`<div><small>Customer OTP</small><b>${j.otp}</b></div>`}</div>
        <div class="row gap mt"><a class="btn b-ghost sm" href=${'tel:+' + (c.phone || j.phone)}><${Ic} n="phone" s=${14}/> Call</a><a class="btn b-wa sm" target="_blank" href=${waLink(c.phone || j.phone)}><${Ic} n="wa" s=${14}/> WhatsApp</a>
          <a class="btn b-ghost sm" target="_blank" href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.address || c.address || c.city || '')}><${Ic} n="pin" s=${14}/> Location</a></div>
        ${!closed && html`<div class="row gap mt">${['assigned', 'on_the_way', 'in_progress'].map(s => html`<button class=${'chip' + (j.status === s ? ' on' : '')} onClick=${async () => { await run(() => patch('jobs/' + id, { status: s })); q.reload(); }}>${{ assigned: 'Assigned', on_the_way: 'On the way', in_progress: 'Started work' }[s]}</button>`)}</div>`}</div>
      <div class="card pad"><h3>Checklist</h3>${cl.map((x, i) => html`<label class="chk big"><input type="checkbox" checked=${x.done} disabled=${closed} onChange=${async (e) => { const n = cl.map((y, k) => k === i ? { ...y, done: e.target.checked } : y); await patch('jobs/' + id, { checklist: n }); q.reload(); }}/> ${x.t}</label>`)}
        ${!closed && html`<div class="row gap mt"><input class="grow" placeholder="Add checklist item" onKeyDown=${async (e) => { if (e.key === 'Enter' && e.target.value) { await patch('jobs/' + id, { checklist: [...cl, { t: e.target.value, done: false }] }); e.target.value = ''; q.reload(); } }}/></div>`}</div></div>
      <div class="col-stack">
        <div class="card pad"><h3>Serials scanned ${tracked ? html`<small class="muted">${d.serials.length} / ${tracked}</small>` : ''}</h3>
          ${d.serials.map(s => html`<div class="lrow"><b>${s.serial}</b><small>${s.name || ''}</small></div>`)}
          ${!closed && html`<div class="row gap"><input class="grow" placeholder="Serial / IMEI" value=${sn} onInput=${(e) => setSn(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addSerial(sn)}/><${Btn} kind="ghost" icon="scan" onClick=${() => setScan(true)}>Scan</${Btn}><${Btn} onClick=${() => addSerial(sn)}>Add</${Btn}></div><p class="muted small">Auto-linked to warranty</p>`}</div>
        <div class="card pad"><h3>Photos</h3>
          <div class="photos"><div><small>Before</small><div class="pgrid">${(j.photos_before || []).map(p => html`<a href=${'/media/' + p} target="_blank"><img src=${'/media/' + p}/></a>`)}${!closed && html`<label class="padd"><${Ic} n="camera"/><input type="file" accept="image/*" capture="environment" multiple onChange=${(e) => upload(e.target.files, 'before')}/></label>`}</div></div>
          <div><small>After</small><div class="pgrid">${(j.photos_after || []).map(p => html`<a href=${'/media/' + p} target="_blank"><img src=${'/media/' + p}/></a>`)}${!closed && html`<label class="padd"><${Ic} n="camera"/><input type="file" accept="image/*" capture="environment" multiple onChange=${(e) => upload(e.target.files, 'after')}/></label>`}</div></div></div></div>
        ${!closed ? html`<div class="card pad"><h3>Complete job</h3>${bal > 0 && html`<${Btn} kind="green" icon="rupee" onClick=${() => setPay(true)}>Collect balance ${inr(bal)}</${Btn}>`}
          <${Btn} kind="navy" icon="check" onClick=${() => setDone(true)}>Photos + OTP sign-off</${Btn}></div>`
          : html`<div class="card pad"><h3>Completed ✓</h3><p class="muted">${dt(j.completed_at, 1)} · ${j.otp_verified ? 'OTP verified' : j.signature_id ? 'Digitally signed' : ''} ${+j.collected ? ' · collected ' + inr(j.collected) : ''}</p>${j.signature_id && html`<img class="sigimg" src=${'/media/' + j.signature_id}/>`}</div>`}
        ${d.history.length > 0 && html`<div class="card pad"><h3>Service history</h3>${d.history.map(h => html`<div class="lrow"><div><b>${h.number} · ${h.title || h.issue}</b><small>${dt(h.created_at)}</small></div><${Badge} s=${h.status}/></div>`)}</div>`}
      </div></div>
    ${scan && html`<${Scanner} onClose=${() => setScan(false)} onResult=${(v) => { setScan(false); addSerial(v); }}/>`}
    ${pay && html`<${PaymentModal} order=${{ id: j.order_id, customer_id: j.customer_id }} due=${bal} jobId=${j.id} onClose=${() => setPay(false)} onDone=${() => { setPay(false); q.reload(); }}/>`}
    ${done && html`<${CompleteJob} j=${j} bal=${bal} onClose=${() => setDone(false)} onDone=${() => { setDone(false); q.reload(); }}/>`}</div>`; }}<//>`;
}
function CompleteJob({ j, onClose, onDone }) {
  const [otp, setOtp] = useState(''); const [mode, setMode] = useState('otp'); const [sig, setSig] = useState(null); const [sent, setSent] = useState(false);
  const finish = async () => { await run(() => api(`jobs/${j.id}/complete`, { body: { otp, signature_id: sig } }), 'Job completed ✓ Customer notified'); onDone(); };
  return html`<${Modal} title="Customer sign-off" onClose=${onClose} foot=${html`<${Btn} kind="green" icon="check" disabled=${mode === 'otp' ? otp.length < 4 : !sig} onClick=${finish}>Complete job</${Btn}>`}>
    <${Tabs} tabs=${[['otp', 'Customer OTP'], ['sign', 'Digital signature']]} cur=${mode} onChange=${setMode}/>
    ${mode === 'otp' ? html`<div class="mt"><p class="muted">Customer ko OTP WhatsApp par jayega. OTP enter karein.</p><${Btn} kind="ghost" icon="send" onClick=${async () => { const r = await run(() => api(`jobs/${j.id}/otp`, { body: {} })); setSent(true); toast(r.sent ? 'OTP sent to customer' : 'WhatsApp not connected — owner can see OTP in CRM', r.sent ? 'ok' : 'warn'); }}>${sent ? 'Resend OTP' : 'Send OTP'}</${Btn}>
      <input class="otp" inputmode="numeric" maxlength="4" placeholder="• • • •" value=${otp} onInput=${(e) => setOtp(e.target.value)}/></div>`
      : html`<div class="mt">${sig ? html`<p class="t-green">Signature saved ✓</p>` : html`<${SignPad} onSave=${async (blob) => { const fd = new FormData(); fd.append('photos', blob, 'signature.png'); const r = await run(() => api(`jobs/${j.id}/photos?when=signature`, { body: fd })); setSig(r.signature_id); }}/>`}</div>`}<//>`;
}

// ================= Team, targets & tasks =================
export function Team() {
  const q = useApi('team'); const [ed, setEd] = useState(null); const [task, setTask] = useState(false); const [log, setLog] = useState(false);
  return html`<div><div class="ph"><h1>Team, targets & tasks</h1><div class="row gap"><${Btn} kind="ghost" onClick=${() => setLog(true)}>Activity log</${Btn}><${Btn} kind="ghost" icon="plus" onClick=${() => setEd({ role: 'sales' })}>Add member</${Btn}><${Btn} icon="plus" onClick=${() => setTask(true)}>Assign task</${Btn}></div></div>
  <${Load} q=${q}>${(d) => html`<div class="g2c wide-l"><div class="card"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>Attendance</th><th>Leads</th><th>Won</th><th>Target</th><th>Achieved</th><th></th></tr></thead><tbody>
    ${d.rows.map(u => { const ach = u.role === 'sales' ? (u.target ? Math.round(u.sales / u.target * 100) : 0) : (u.target ? Math.round(u.jobs_done / u.target * 100) : 0);
      return html`<tr class=${u.active ? '' : 'dim'}><td><div class="trow"><span class="av">${initials(u.name)}</span><div><b>${u.name}</b>${u.overdue > 0 && html`<small class="t-red">${u.overdue} overdue follow-ups</small>`}</div></div></td><td>${u.role === 'sales' ? 'Sales' : 'Technician'}${u.categories && html`<small>${u.categories.split(',').map(c => CATS[c] || c).join(', ')}</small>`}</td>
      <td>${u.on_site ? html`<span class="t-blue">Site · ${u.on_site}</span>` : u.check_in ? html`<span class="t-green">In ${tm(u.check_in)} ✓</span>` : html`<span class="muted">—</span>`}</td>
      <td>${u.role === 'sales' ? u.leads : '—'}</td><td>${u.role === 'sales' ? u.won : '—'}</td><td>${u.role === 'sales' ? inr(u.target, 1) : u.target + ' jobs'}</td>
      <td><div class="prog"><i style=${{ width: Math.min(100, ach) + '%' }}></i></div><small>${ach}% ${u.role === 'sales' ? '· ' + inr(u.sales, 1) : '· ' + u.jobs_done + ' jobs'}</small></td><td><button class="icbtn" onClick=${() => setEd(u)}><${Ic} n="edit" s=${15}/></button></td></tr>`; })}</tbody></table></div>
    <div class="card pad"><h3>Tasks today</h3>${d.tasks.map(t => html`<label class=${'chk task' + (t.done ? ' done' : '')}><input type="checkbox" checked=${t.done} onChange=${async (e) => { await patch('tasks/' + t.id, { done: e.target.checked }); q.reload(); }}/><span>${t.title}</span><small>${t.uname || ''}</small></label>`)}</div></div>`}<//>
  ${ed && html`<${Member} u=${ed} onClose=${() => setEd(null)} onDone=${() => { setEd(null); q.reload(); }}/>`}
  ${task && html`<${TaskModal} onClose=${() => setTask(false)} onDone=${() => { setTask(false); q.reload(); }}/>`}
  ${log && html`<${ActivityLog} onClose=${() => setLog(false)}/>`}</div>`;
}
function Member({ u, onClose, onDone }) {
  const [v, bind, setV] = useForm({ ...u, password: '' }); const cats = (v.categories || '').split(',').filter(Boolean);
  const togg = (c) => setV(s => ({ ...s, categories: (cats.includes(c) ? cats.filter(x => x !== c) : [...cats, c]).join(',') }));
  const save = async () => { await run(() => u.id ? patch('users/' + u.id, { ...v, password: v.password || undefined }) : api('users', { body: v }), 'Saved'); onDone(); };
  return html`<${Modal} title=${u.id ? 'Edit ' + u.name : 'Add team member'} onClose=${onClose} foot=${html`${u.id && html`<${Btn} kind="ghost" onClick=${async () => { await run(() => patch('users/' + u.id, { active: !u.active }), u.active ? 'Deactivated' : 'Activated'); onDone(); }}>${u.active ? 'Deactivate' : 'Activate'}</${Btn}>`}<${Btn} onClick=${save}>Save</${Btn}>`}>
    <div class="form2"><${F} l="Name"><input ...${bind('name')}/></${F}><${F} l="Role"><select ...${bind('role')}><option value="sales">Sales executive</option><option value="tech">Technician</option><option value="owner">Owner / admin</option></select></${F}>
    <${F} l="Login email"><input ...${bind('email')}/></${F}><${F} l="Mobile (WhatsApp alerts)"><input ...${bind('phone')}/></${F}>
    <${F} l=${u.id ? 'New password (leave blank to keep)' : 'Password'}><input type="text" ...${bind('password')}/></${F}><${F} l=${v.role === 'tech' ? 'Monthly target (jobs)' : 'Monthly target (₹)'}><input type="number" ...${bind('target')}/></${F}></div>
    ${v.role === 'sales' && html`<p class="small muted mt">Auto-assign categories (round-robin):</p><div class="chips">${Object.entries(CATS).map(([k, l]) => html`<button class=${'chip' + (cats.includes(k) ? ' on' : '')} onClick=${() => togg(k)}>${l}</button>`)}</div>`}<//>`;
}
function TaskModal({ onClose, onDone }) { const users = useApi('users'); const [v, bind] = useForm({ due: new Date().toISOString().slice(0, 10) });
  return html`<${Modal} title="Assign task" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => api('tasks', { body: v }), 'Task assigned'); onDone(); }}>Assign</${Btn}>`}><div class="form2"><${F} l="Task" full><input ...${bind('title')}/></${F}><${F} l="Assign to"><select ...${bind('user_id')}><option value="">—</option>${(users.data || []).filter(u => u.active).map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></${F}><${F} l="Due"><input type="date" ...${bind('due')}/></${F}></div><//>`; }
function ActivityLog({ onClose }) { const q = useApi('activity-log'); return html`<${Modal} wide title="User activity log (audit trail)" onClose=${onClose}><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead><tbody>${rows.map(a => html`<tr><td>${dt(a.created_at, 1)}</td><td>${a.uname || '—'}</td><td>${a.action}</td><td>${a.entity} ${a.entity_id || ''}</td><td>${a.ip || ''}</td></tr>`)}</tbody></table>`}<//><//>`; }

// ================= Reports =================
const CAT_COL = { 'Business computing': '#1E9BE0', 'Video surveillance': '#0B1F44', 'Enterprise networking': '#22C55E', 'Access & attendance': '#8B5CF6', 'Power backup': '#F59E0B', 'Print & display': '#EC4899', Other: '#94A3B8' };
export function Reports() {
  const [tab, setTab] = useState('sales'); const d0 = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10); const [from, setFrom] = useState(d0); const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const q = useApi(`reports/${tab}?from=${from}&to=${to}`, []); const sum = useApi(`reports/summary?from=${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)}&to=${to}`);
  const csv = (part) => openFile(`/api/reports/${tab}?from=${from}&to=${to}&format=csv&part=${part || 'rows'}`, `${tab}.csv`);
  const T = (rows) => !rows || !rows.length ? html`<${Empty}/>` : html`<table class="tbl"><thead><tr>${Object.keys(rows[0]).map(k => html`<th>${k.replace(/_/g, ' ')}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${Object.entries(r).map(([k, v]) => html`<td>${v == null ? '' : /date|_at$/.test(k) && v ? dt(v) : v !== '' && !isNaN(v) && typeof v !== 'boolean' && /sales|revenue|margin$|amount|total|value|billed|paid|^due$|price|subtotal|gst|discount/.test(k) ? inr(v) : k === 'status' ? String(v).replace(/_/g, ' ') : String(v)}</td>`)}</tr>`)}</tbody></table>`;
  return html`<div><div class="ph"><h1>Reports</h1><div class="row gap"><input type="date" value=${from} onChange=${(e) => setFrom(e.target.value)}/><input type="date" value=${to} onChange=${(e) => setTo(e.target.value)}/><${Btn} kind="ghost" icon="download" onClick=${() => csv()}>Excel (CSV)</${Btn}><${Btn} kind="ghost" icon="doc" onClick=${() => print()}>PDF</${Btn}></div></div>
  <${Tabs} tabs=${[['sales', 'Sales'], ['leads', 'Leads & conversion'], ['products', 'Products'], ['payments', 'Payments'], ['stock', 'Stock'], ['service', 'Service'], ['team', 'Team']]} cur=${tab} onChange=${setTab}/>
  <${Load} q=${q}>${(d) => html`<div class="mt">${tab === 'sales' ? html`<div class="g2c wide-l"><div class="card pad"><h3>Sales by category</h3>${(() => { const months = [...new Set(d.monthly.map(m => m.m))]; return html`<${Bars} data=${months.map(m => ({ label: m, parts: d.monthly.filter(x => x.m === m).map(x => ({ v: x.v, c: CAT_COL[x.category] || '#94A3B8', n: x.category })) }))}/><div class="legend">${Object.entries(CAT_COL).map(([k, c]) => html`<span><i style=${{ background: c }}></i>${k}</span>`)}</div>`; })()}</div>
        <${Load} q=${sum}>${(s) => html`<div class="card pad"><h3>${new Date().toLocaleString('en-IN', { month: 'long' })} summary</h3><div class="kpis k2"><${Kpi} l="Leads" v=${s.leads}/><${Kpi} l="Conversion" v=${(s.leads ? Math.round(s.won / s.leads * 100) : 0) + '%'}/><${Kpi} l="Sales" v=${inr(s.sales, 1)}/><${Kpi} l="Gross margin" v=${inr(s.margin, 1)} sub=${s.net ? Math.round(s.margin / s.net * 100) + '%' : ''}/><${Kpi} l="Collected" v=${inr(s.collected, 1)}/><${Kpi} l="Service tickets" v=${s.tickets} sub=${s.tickets ? Math.round(s.in_sla / s.tickets * 100) + '% in SLA' : ''}/></div></div>`}<//></div><div class="card mt">${T(d.rows)}</div>`
      : tab === 'leads' ? html`<div class="g2c"><div class="card"><div class="pad-s row between"><b>Channel-wise leads & conversion</b></div>${T(d.by_source)}</div><div class="col-stack"><div class="card"><div class="pad-s row between"><b>Salesperson conversion</b><${Btn} sm kind="ghost" onClick=${() => csv('by_user')}>CSV</${Btn}></div>${T(d.by_user)}</div><div class="card"><div class="pad-s"><b>Lost reasons</b></div>${T(d.lost)}</div></div></div>`
      : tab === 'payments' ? html`<div class="col-stack"><div class="card"><div class="pad-s row between"><b>Collections</b></div>${T(d.rows)}</div><div class="card"><div class="pad-s row between"><b>Outstanding dues</b><${Btn} sm kind="ghost" onClick=${() => csv('dues')}>CSV</${Btn}></div>${T(d.dues)}</div><div class="g2c"><div class="card"><div class="pad-s"><b>Supplier outstanding</b></div>${T(d.supplier)}</div><div class="card"><div class="pad-s row between"><b>Purchase register</b><${Btn} sm kind="ghost" onClick=${() => csv('purchases')}>CSV</${Btn}></div>${T(d.purchases)}</div></div></div>`
      : tab === 'service' ? html`<div class="col-stack"><div class="card">${T(d.rows)}</div><div class="card"><div class="pad-s row between"><b>AMC register</b><${Btn} sm kind="ghost" onClick=${() => csv('amc')}>CSV</${Btn}></div>${T(d.amc)}</div></div>`
      : html`<div class="card">${T(d.rows)}</div>`}</div>`}<//></div>`;
}

// ================= Automations =================
export function Automations() {
  const q = useApi('automations'); const ob = useApi('outbox');
  return html`<div><div class="ph"><h1>Automations — A to Z</h1></div><p class="muted">Every step automated: WhatsApp lead capture → assignment → follow-ups → quotation → order → payment → stock → installation → AMC → reports</p>
  <${Load} q=${q}>${(rows) => html`<div class="autos">${rows.map(a => html`<div class=${'card auto' + (a.enabled ? '' : ' off')}><div class="row between"><b>${a.name}</b><label class="switch"><input type="checkbox" checked=${a.enabled} onChange=${async (e) => { await run(() => patch('automations/' + a.key, { enabled: e.target.checked }), e.target.checked ? 'Enabled' : 'Disabled'); q.reload(); }}/><span></span></label></div>
    <p>${a.description}</p><div class="tca"><span><small>TRIGGER</small>${a.trigger}</span><span><small>ACTION</small>${a.action}</span></div>
    <div class="row between"><small class="muted">Runs: ${a.runs}${a.last_run ? ' · last ' + dt(a.last_run, 1) : ''}</small>${['followup_reminders', 'pending_quote_alert', 'service_ticket_alert', 'payment_reminders', 'low_stock', 'amc_reminders', 'daily_summary', 'indiamart_pull', 'email_pull'].includes(a.key) && html`<${Btn} sm kind="ghost" onClick=${async () => { await run(() => api('automations/' + a.key + '/run', { body: {} }), 'Ran now'); q.reload(); }}>Run now</${Btn}>`}</div></div>`)}</div>`}<//>
  <div class="card mt"><div class="pad-s"><b>Outgoing message log</b> <small class="muted">(queued = WhatsApp/SMTP not connected yet)</small></div><${Load} q=${ob}>${(rows) => html`<table class="tbl"><thead><tr><th>Time</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th></tr></thead><tbody>${rows.map(o => html`<tr><td>${dt(o.created_at, 1)}</td><td>${o.channel}</td><td>${o.to_addr}</td><td class="clip">${o.body}</td><td><${Badge} s=${o.status === 'failed' ? 'open' : 'draft'}>${o.status === 'not_configured' ? 'queued' : o.status}<//>${o.error && html`<small class="t-red">${o.error}</small>`}</td></tr>`)}</tbody></table>`}<//></div></div>`;
}
