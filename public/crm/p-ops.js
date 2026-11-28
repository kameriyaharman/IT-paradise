import { html, useState, useEffect, useRef, api, patch, put, del, ago, useApi, Load, Ic, Badge, Kpi, inr, dt, tm, go, toast, run, Btn, Modal, F, useForm, Search, Tabs, ProductPicker, Empty, openFile, auth, initials, Scanner, SignPad, Bars, CATS, waLink, openExternal } from './ui.js';
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
  ${adj && html`<${Modal} title=${'Stock adjustment · ' + adj.name} onClose=${() => setAdj(null)}><${AdjForm} p=${adj} onDone=${() => { setAdj(null); q.reload(); }}/><//>`}
  ${scan && html`<${Scanner} onClose=${() => setScan(false)} onResult=${(v) => { setScan(false); setSerial(v); look(v); }}/>`}</div>`;
}
function AdjForm({ p, onDone }) {
  const [v, bind, setV] = useForm({ qty: '', reason: 'count', note: '' });
  const R = [['count', 'Physical count correction', 1], ['defective', 'Defective (move out of saleable stock)', -1], ['returned', 'Returned by customer (back in stock)', 1], ['replacement', 'Replacement given to customer', -1], ['damaged', 'Damaged / lost', -1], ['supplier_return', 'Returned to supplier', -1]];
  const r = R.find(x => x[0] === v.reason);
  return html`<div class="form2"><${F} l="Reason" full><select ...${bind('reason')}>${R.map(x => html`<option value=${x[0]}>${x[1]}</option>`)}</select></${F}>
    <${F} l=${r && r[2] < 0 ? 'Qty to remove' : r && r[0] === 'count' ? 'Qty (+ add / − remove)' : 'Qty to add'}><input type="number" ...${bind('qty')}/></${F}><${F} l="Serial no. (optional)"><input ...${bind('serial')}/></${F}><${F} l="Note" full><input ...${bind('note')}/></${F}></div>
    <${Btn} onClick=${async () => { const n = Math.abs(+v.qty || 0) * (r[0] === 'count' ? Math.sign(+v.qty) : r[2]); if (!n) return toast('Enter quantity', 'err'); await run(() => api('stock/adjust', { body: { product_id: p.id, qty: n, reason: v.reason, serial: v.serial, note: v.note || r[1] } }), 'Stock updated'); onDone(); }}>Save</${Btn}>`;
}
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
function Moves() { const [r, setR] = useState(''); const q = useApi('stock/moves?reason=' + r, [r]); return html`<div class="mt"><${Tabs} tabs=${[['', 'All movements'], ['defective', 'Defective'], ['returned', 'Returns'], ['replacement', 'Replacements'], ['damaged', 'Damaged'], ['service part', 'Service parts']]} cur=${r} onChange=${setR}/><div class="card mt"><${Load} q=${q}>${(rows) => html`<table class="tbl"><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Type</th><th>Reason</th><th>Ref</th><th>Note</th></tr></thead><tbody>${rows.map(m => html`<tr><td>${dt(m.created_at, 1)}</td><td>${m.name}</td><td class=${m.qty > 0 ? 't-green' : 't-red'}>${m.qty > 0 ? '+' : ''}${+m.qty}</td><td>${m.kind}</td><td>${m.reason || ''}</td><td>${m.ref || ''}</td><td>${m.note || ''}</td></tr>`)}</tbody></table>`}<//></div></div>`; }

// ================= Service & AMC =================
const PRI = { urgent: 'red', high: 'amber', normal: 'blue', low: 'grey' };
const DEVTYPES = ['Laptop', 'Desktop', 'Printer', 'Monitor', 'CCTV camera', 'DVR / NVR', 'UPS', 'Router / Switch', 'Attendance device', 'Projector', 'Other'];
const ACCS = ['Charger / adapter', 'Bag', 'Battery', 'Power cable', 'Mouse', 'Keyboard', 'HDD / SSD', 'Box', 'Remote'];
const CARRY_FLOW = [['received', 'Received'], ['diagnosing', 'Diagnosing'], ['awaiting_approval', 'Awaiting approval'], ['repairing', 'Repairing'], ['ready', 'Ready for pickup'], ['delivered', 'Delivered']];
const SLA = ({ j }) => { if (!j.sla_due || ['completed', 'closed', 'cancelled', 'delivered', 'ready'].includes(j.status)) return null; const h = (new Date(j.sla_due) - Date.now()) / 36e5; return html`<small class=${h < 0 ? 't-red' : h < 4 ? 't-amber' : 'muted'}>${h < 0 ? 'SLA breached ' + Math.abs(Math.round(h)) + 'h' : 'SLA ' + Math.round(h) + 'h left'}</small>`; };
export function Service({ user }) {
  const q = useApi('jobs'); const amc = useApi('amcs'); const users = useApi('users');
  const [tab, setTab] = useState('tickets'); const [nt, setNt] = useState(null); const [na, setNa] = useState(false); const [s, setS] = useState('');
  const techs = (users.data || []).filter(u => u.role === 'tech' && u.active);
  const DONE = ['completed', 'closed', 'cancelled', 'delivered'];
  const filt = (j) => (!s || (j.number + (j.cname || '') + (j.title || '') + (j.issue || '') + (j.cphone || '')).toLowerCase().includes(s.toLowerCase())) && (tab === 'closed' ? DONE.includes(j.status) : !DONE.includes(j.status) && (tab === 'installs' ? j.kind === 'installation' : tab === 'carry' ? j.kind === 'carry_in' : !['installation', 'carry_in'].includes(j.kind)));
  return html`<div><div class="ph"><h1>Service & AMC</h1><div class="row gap"><${Search} value=${s} onInput=${setS} ph="Ticket no., customer, mobile"/><${Btn} icon="plus" onClick=${() => setNt('carry_in')}>Walk-in repair</${Btn}><${Btn} kind="navy" icon="plus" onClick=${() => setNt('service')}>On-site ticket</${Btn}><${Btn} kind="ghost" icon="plus" onClick=${() => setNa(true)}>New AMC</${Btn}></div></div>
  <${Load} q=${q}>${(d) => { const cnt = (k) => d.rows.filter(j => !DONE.includes(j.status) && (k === 'installs' ? j.kind === 'installation' : k === 'carry' ? j.kind === 'carry_in' : !['installation', 'carry_in'].includes(j.kind))).length;
    return html`<div class="kpis"><${Kpi} l="Open on-site tickets" v=${cnt('tickets')}/><${Kpi} l="Walk-in repairs in shop" v=${cnt('carry')}/><${Kpi} l="Ready for pickup" v=${d.rows.filter(j => j.status === 'ready').length} tone="green"/><${Kpi} l="SLA breached" v=${d.rows.filter(j => j.sla_due && new Date(j.sla_due) < new Date() && !DONE.includes(j.status) && j.status !== 'ready').length} tone="red"/><${Kpi} l="Active AMCs" v=${d.k.active_amc} sub=${d.k.renewals + ' renewals due'}/><${Kpi} l="Avg. resolution" v=${d.k.avg_hr + ' hr'}/></div>
    <${Tabs} tabs=${[['tickets', `On-site service (${cnt('tickets')})`], ['carry', `Walk-in repairs (${cnt('carry')})`], ['installs', `Installations (${cnt('installs')})`], ['amc', 'AMC contracts'], ['closed', 'Closed']]} cur=${tab} onChange=${setTab}/>
    ${tab !== 'amc' ? html`<div class="card mt"><table class="tbl"><thead><tr><th>Customer</th><th>Ticket</th><th>${tab === 'carry' ? 'Device / problem' : 'Issue'}</th><th>Priority</th><th>Type</th><th>Technician</th><th>Status</th><th>Created</th></tr></thead><tbody>
      ${d.rows.filter(filt).map(j => html`<tr class="click" onClick=${(e) => { if (!e.target.closest('select')) go('/jobs/' + j.id); }}>
        <td><b>${j.cname || 'Customer'}</b><small>${j.cphone ? '+' + j.cphone : ''}</small></td><td><b class="t-blue">${j.number}</b><small>${{ carry_in: 'Walk-in', installation: 'Installation', preventive: 'Preventive', service: 'On-site' }[j.kind]}${j.order_no ? ' · ' + j.order_no : ''}</small></td>
        <td class="clip">${j.kind === 'carry_in' ? html`<b>${j.title}</b><small>${j.issue || ''}</small>` : (j.issue || j.title)}</td><td><${Badge} s=${PRI[j.priority] === 'red' ? 'hot' : j.priority === 'high' ? 'warm' : 'draft'}>${j.priority || 'normal'}<//><${SLA} j=${j}/></td><td><${Badge} s=${j.coverage}/></td>
        <td><select class="sel" value=${j.technician_id || ''} onChange=${async (e) => { await run(() => patch('jobs/' + j.id, { technician_id: e.target.value }), 'Assigned'); q.reload(); }}><option value="">— Unassigned</option>${techs.map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></td>
        <td><${Badge} s=${j.status}/></td><td>${dt(j.created_at, 1)}</td></tr>`)}</tbody></table></div>`
      : html`<${Load} q=${amc}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr><th>AMC</th><th>Customer</th><th>Coverage</th><th>Period</th><th>Amount</th><th>Days left</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(a => html`<tr><td><b>${a.number}</b></td><td>${a.cname}</td><td>${a.title}<small>${a.visits_per_year} visits / yr</small></td><td>${dt(a.start_date)} → ${dt(a.end_date)}</td><td>${inr(a.amount)}</td><td class=${a.left_days < 30 ? 't-red' : ''}>${a.left_days}</td><td><${Badge} s=${a.status}/></td>
        <td class="nowrap"><${Btn} sm kind="green" onClick=${async () => { const amt = prompt('Renewal amount ₹', a.amount); if (amt == null) return; await run(() => patch('amcs/' + a.id, { renew: true, amount: amt }), 'Renewed for 1 year'); amc.reload(); }}>Renew</${Btn}> <a class="btn b-wa sm" target="_blank" href=${waLink(a.phone, `Namaste ${a.cname} ji, aapka AMC (${a.title}) ${dt(a.end_date)} ko expire ho raha hai. Renew karein? — IT Paradise`)}><${Ic} n="wa" s=${14}/></a></td></tr>`)}</tbody></table></div>`}<//>`}
    <p class="muted small mt">⚡ Customers track any ticket at <a class="t-blue" href="/track" target="_blank">/track</a> with ticket number · SLA: urgent 4 h · high 8 h · normal 24 h · low 72 h · breach → owner alert</p>`; }}<//>
  ${nt && html`<${NewTicket} kind=${nt} techs=${techs} onClose=${() => setNt(null)} onDone=${(j) => { setNt(null); go('/jobs/' + j.id); }}/>`}
  ${na && html`<${NewAmc} onClose=${() => setNa(false)} onDone=${() => { setNa(false); amc.reload(); setTab('amc'); }}/>`}</div>`;
}
export function DeviceForm({ v, bind, setV }) {
  const acc = (v.accessories || []); const togg = (a) => setV(x => ({ ...x, accessories: acc.includes(a) ? acc.filter(y => y !== a) : [...acc, a] }));
  return html`<div class="form2"><${F} l="Device type"><select ...${bind('type')}>${DEVTYPES.map(t => html`<option>${t}</option>`)}</select></${F}><${F} l="Brand"><input ...${bind('brand')} placeholder="Dell / HP / Lenovo…"/></${F}>
    <${F} l="Model"><input ...${bind('model')}/></${F}><${F} l="Serial no."><input ...${bind('serial')}/></${F}>
    <${F} l="Physical condition" full><input ...${bind('condition')} placeholder="Scratches on lid, hinge loose…"/></${F}></div>
    <p class="small muted">Accessories received</p><div class="chips">${ACCS.map(a => html`<button type="button" class=${'chip' + (acc.includes(a) ? ' on' : '')} onClick=${() => togg(a)}>${a}</button>`)}</div>`;
}
function NewTicket({ kind, techs, onClose, onDone }) {
  const [v, bind, setV] = useForm({ priority: 'normal', coverage: '' }); const [dv, bindD, setD] = useForm({ type: 'Laptop', accessories: [] });
  const carry = kind === 'carry_in';
  const save = async () => { if (!v.phone || !(v.issue)) return toast('Mobile and problem are required', 'err'); const j = await run(() => api('jobs', { body: { ...v, kind, device: carry ? dv : undefined, category: carry ? dv.type : v.category } }), carry ? 'Walk-in ticket created — customer notified on WhatsApp' : 'Ticket created'); onDone(j); };
  return html`<${Modal} wide title=${carry ? 'Walk-in repair ticket (Laptop / IT product)' : 'New on-site service ticket'} onClose=${onClose} foot=${html`<${Btn} onClick=${save}>Create ticket</${Btn}>`}>
    <div class="form2"><${F} l="Customer mobile *"><input ...${bind('phone')} inputmode="tel"/></${F}><${F} l="Customer name"><input ...${bind('name')}/></${F}><${F} l="Company"><input ...${bind('company')}/></${F}><${F} l="City"><input ...${bind('city')}/></${F}></div>
    ${carry ? html`<h4>Device</h4><${DeviceForm} v=${dv} bind=${bindD} setV=${setD}/>` : html`<div class="form2"><${F} l="Category"><select ...${bind('category')}>${['CCTV', 'Computer', 'Network', 'Attendance', 'UPS', 'Printer', 'Other'].map(c => html`<option>${c}</option>`)}</select></${F}><${F} l="Serial (optional)"><input ...${bind('serial')}/></${F}><${F} l="Site address" full><input ...${bind('address')}/></${F}><${F} l="Schedule visit"><input type="datetime-local" ...${bind('scheduled_at')}/></${F}></div>`}
    <h4>Problem & handling</h4><div class="form2"><${F} l="Problem reported *" full><input ...${bind('issue')} placeholder=${carry ? 'Not booting, screen flicker…' : '3 cameras not showing'}/></${F}>
    <${F} l="Priority"><select ...${bind('priority')}><option value="urgent">Urgent (4 h)</option><option value="high">High (8 h)</option><option value="normal">Normal (24 h)</option><option value="low">Low (72 h)</option></select></${F}>
    <${F} l="Coverage"><select ...${bind('coverage')}><option value="">Auto (warranty / AMC)</option><option value="warranty">Warranty</option><option value="amc">AMC</option><option value="paid">Paid</option><option value="free">Free</option></select></${F}>
    ${carry && html`<${F} l="Estimate ₹ (optional)"><input type="number" ...${bind('estimate')}/></${F}><${F} l="Expected delivery"><input type="date" value=${dv.expected || ''} onInput=${(e) => setD(x => ({ ...x, expected: e.target.value }))}/></${F}>`}
    <${F} l="Technician"><select ...${bind('technician_id')}><option value="">Unassigned</option>${techs.map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></${F}></div><//>`;
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
  const q = useApi('jobs/' + id, [id]); const [scan, setScan] = useState(false); const [sn, setSn] = useState(''); const [done, setDone] = useState(false); const [pay, setPay] = useState(false); const [part, setPart] = useState(false); const [carryOut, setCarryOut] = useState(false); const [deliver, setDeliver] = useState(false);
  const addSerial = async (s) => { if (!s) return; await run(() => api(`jobs/${id}/serial`, { body: { serial: s } }), 'Serial linked to warranty'); setSn(''); q.reload(); };
  const upload = async (files, when) => { const fd = new FormData(); [...files].forEach(f => fd.append('photos', f)); await run(() => api(`jobs/${id}/photos?when=${when}`, { body: fd }), 'Photos uploaded'); q.reload(); };
  const setStatus = async (status, extra) => { await run(() => api(`jobs/${id}/status`, { body: { status, ...extra } }), 'Status updated' + (['received', 'awaiting_approval', 'ready', 'delivered'].includes(status) ? ' — customer notified' : '')); q.reload(); };
  return html`<${Load} q=${q}>${(d) => { const j = d.job; const c = d.customer || {}; const cl = j.checklist || []; const dev = j.device || {}; const carry = j.kind === 'carry_in';
    const tracked = d.items.filter(i => i.serial_tracked).reduce((a, i) => a + +i.qty, 0); const bal = d.order ? d.order.total - d.order.paid : 0;
    const partsTotal = (d.parts || []).filter(p => p.chargeable).reduce((a, p) => a + p.qty * p.rate, 0);
    const closed = ['completed', 'closed', 'cancelled', 'delivered'].includes(j.status); const phone = c.phone || j.phone;
    const ci = CARRY_FLOW.findIndex(x => x[0] === j.status);
    return html`<div>
    <div class="ph job-ph"><div><h1>${!mobile && html`<a href="#/service" class="back"><${Ic} n="back"/></a>`} ${c.name || 'Customer'}</h1><div class="job-sub"><b class="t-blue">${j.number}</b> · ${j.title || j.issue} <${Badge} s=${j.status}/> <${Badge} s=${PRI[j.priority] === 'red' ? 'hot' : j.priority === 'high' ? 'warm' : 'draft'}>${j.priority || 'normal'}<//> <${SLA} j=${j}/></div></div>
      <div class="row gap"><${Btn} kind="ghost" icon="doc" onClick=${() => openFile(`/api/jobs/${id}/pdf`)}>${carry && !closed ? 'Job sheet PDF' : 'Service report PDF'}</${Btn}>${user.role === 'owner' && j.status === 'completed' && html`<${Btn} kind="ghost" onClick=${async () => { await run(() => api(`jobs/${id}/close`, { body: {} })); q.reload(); }}>Close ticket</${Btn}>`}</div></div>
    ${carry && html`<div class="card pad stepper">${CARRY_FLOW.map(([k, l], i) => html`<button class=${'step' + (i < ci ? ' done' : '') + (i === ci ? ' now' : '')} disabled=${j.status === 'cancelled' || (i <= ci && k !== 'awaiting_approval')} onClick=${() => {
        if (k === 'awaiting_approval') { const e = prompt('Repair estimate ₹ (sent to customer on WhatsApp)', j.estimate || ''); if (e == null) return; return setStatus(k, { estimate: e }); }
        if (k === 'delivered') return setDeliver(true);
        setStatus(k); }}><i>${i + 1}</i><span>${l}</span></button>`)}</div>`}
    <div class=${mobile ? 'col-stack' : 'g2c'}>
      <div class="col-stack"><div class="card pad"><div class="cust-head"><span class="av">${initials(c.name || '?')}</span><div><h3>${c.name || 'Customer'}</h3><small class="muted">${[c.company, phone && '+' + phone].filter(Boolean).join(' · ')}</small></div></div>
        <div class="info2 mt"><div><small>Address</small><b>${j.address || c.address || c.city || '—'}</b></div><div><small>Coverage</small><${Badge} s=${j.coverage}/></div>${d.order && html`<div><small>Order</small><b>${d.order.number}</b></div>`}
          <div><small>Technician</small><b>${d.tech ? d.tech.name : 'Unassigned'}</b></div>${user.role === 'owner' && j.otp && !closed && html`<div><small>Customer OTP</small><b>${j.otp}</b></div>`}
          ${user.role !== 'tech' && html`<div><small>Priority</small><select class="sel" value=${j.priority || 'normal'} onChange=${async (e) => { await run(() => patch('jobs/' + id, { priority: e.target.value }), 'Priority updated'); q.reload(); }}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div>`}</div>
        <p class="muted mt">Problem: ${j.issue || '—'}</p>
        <div class="row gap mt"><a class="btn b-ghost sm" href=${'tel:+' + phone}><${Ic} n="phone" s=${14}/> Call</a><a class="btn b-wa sm" target="_blank" href=${waLink(phone)}><${Ic} n="wa" s=${14}/> WhatsApp</a>
          ${!carry && html`<a class="btn b-ghost sm" target="_blank" href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(j.address || c.address || c.city || '')}><${Ic} n="pin" s=${14}/> Location</a>`}</div>
        ${!closed && !carry && html`<div class="row gap mt">${['assigned', 'on_the_way', 'in_progress'].map(s => html`<button class=${'chip' + (j.status === s ? ' on' : '')} onClick=${async () => { await run(() => patch('jobs/' + id, { status: s })); q.reload(); if (s === 'on_the_way' && window.ITP_PING) window.ITP_PING('job', j.number); }}>${{ assigned: 'Assigned', on_the_way: 'On the way', in_progress: 'Started work' }[s]}</button>`)}</div>`}</div>
      ${carry && html`<div class="card pad"><h3>Device</h3><div class="info2"><div><small>Device</small><b>${[dev.type, dev.brand, dev.model].filter(Boolean).join(' · ') || '—'}</b></div><div><small>Serial</small><b>${dev.serial || '—'}</b></div><div><small>Accessories</small><b>${(dev.accessories || []).join(', ') || 'None'}</b></div><div><small>Condition</small><b>${dev.condition || '—'}</b></div><div><small>Estimate</small><b>${+j.estimate ? inr(j.estimate) : '—'}</b></div><div><small>Expected</small><b>${dev.expected ? dt(dev.expected) : '—'}</b></div></div></div>`}
      <div class="card pad"><h3>Checklist</h3>${cl.map((x, i) => html`<label class="chk big"><input type="checkbox" checked=${x.done} disabled=${closed} onChange=${async (e) => { const n = cl.map((y, k) => k === i ? { ...y, done: e.target.checked } : y); await patch('jobs/' + id, { checklist: n }); q.reload(); }}/> ${x.t}</label>`)}
        ${!closed && html`<div class="row gap mt"><input class="grow" placeholder="Add checklist item" onKeyDown=${async (e) => { if (e.key === 'Enter' && e.target.value) { await patch('jobs/' + id, { checklist: [...cl, { t: e.target.value, done: false }] }); e.target.value = ''; q.reload(); } }}/></div>`}
        <h4>Engineer notes</h4><textarea rows="2" placeholder="Diagnosis / work done…" value=${j.notes || ''} disabled=${closed} onChange=${async (e) => { await patch('jobs/' + id, { notes: e.target.value }); toast('Notes saved'); }}></textarea></div>
      <div class="card pad"><div class="row between"><h3>Parts used</h3>${!closed && html`<${Btn} sm kind="ghost" icon="plus" onClick=${() => setPart(true)}>Add part</${Btn}>`}</div>
        ${(d.parts || []).length ? html`<table class="tbl"><tbody>${d.parts.map(p => html`<tr><td><b>${p.description}</b><small>${p.serial ? 'SN ' + p.serial : ''}${p.product_id ? ' · from stock' : ''}</small></td><td>${+p.qty} × ${inr(p.rate)}</td><td>${p.chargeable ? inr(p.qty * p.rate) : html`<small class="t-green">free</small>`}</td><td>${!closed && html`<button class="icbtn" onClick=${async () => { await run(() => del(`jobs/${id}/parts/${p.id}`)); q.reload(); }}><${Ic} n="x" s=${14}/></button>`}</td></tr>`)}</tbody></table><p class="small">Chargeable parts: <b>${inr(partsTotal)}</b> + GST</p>` : html`<p class="muted small">No parts used yet.</p>`}</div>
      ${(j.history || []).length > 0 && html`<div class="card pad"><h3>Status history</h3><ul class="timeline">${[...j.history].reverse().map(h => html`<li><b>${(STATUS_TXT[h.s] || h.s)}${h.note ? ' — ' + h.note : ''}</b><small>${dt(h.at, 1)}${h.by ? ' · ' + h.by : ''}</small></li>`)}</ul></div>`}
      </div>
      <div class="col-stack">
        <div class="card pad"><h3>Serials scanned ${tracked ? html`<small class="muted">${d.serials.length} / ${tracked}</small>` : ''}</h3>
          ${d.serials.map(s => html`<div class="lrow"><b>${s.serial}</b><small>${s.name || ''}</small></div>`)}
          ${!closed && html`<div class="row gap"><input class="grow" placeholder="Serial / IMEI" value=${sn} onInput=${(e) => setSn(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addSerial(sn)}/><${Btn} kind="ghost" icon="scan" onClick=${() => setScan(true)}>Scan</${Btn}><${Btn} onClick=${() => addSerial(sn)}>Add</${Btn}></div><p class="muted small">Auto-linked to warranty</p>`}</div>
        <div class="card pad"><h3>Photos</h3>
          <div class="photos"><div><small>Before</small><div class="pgrid">${(j.photos_before || []).map(p => html`<a href=${'/media/' + p} target="_blank"><img src=${'/media/' + p}/></a>`)}${!closed && html`<label class="padd"><${Ic} n="camera"/><input type="file" accept="image/*" capture="environment" multiple onChange=${(e) => upload(e.target.files, 'before')}/></label>`}</div></div>
          <div><small>After</small><div class="pgrid">${(j.photos_after || []).map(p => html`<a href=${'/media/' + p} target="_blank"><img src=${'/media/' + p}/></a>`)}${!closed && html`<label class="padd"><${Ic} n="camera"/><input type="file" accept="image/*" capture="environment" multiple onChange=${(e) => upload(e.target.files, 'after')}/></label>`}</div></div></div></div>
        ${!carry && !closed && html`<div class="card pad"><h3>Device needs workshop repair?</h3><p class="muted small">Take the product back with you — creates a linked walk-in ticket and informs the customer.</p><${Btn} kind="ghost" icon="box" onClick=${() => setCarryOut(true)}>Take device to workshop</${Btn}></div>`}
        ${(d.linked || []).filter(x => x.id !== j.id).map(x => html`<a class="card pad lrow" href=${'#/jobs/' + x.id}><div><small class="muted">Linked ticket</small><b>${x.number} · ${x.title}</b></div><${Badge} s=${x.status}/></a>`)}
        ${carry ? (closed ? html`<div class="card pad"><h3>Delivered ✓</h3><p class="muted">${dt(j.completed_at, 1)}${+j.collected ? ' · collected ' + inr(j.collected) : ''}</p></div>` : '')
          : !closed ? html`<div class="card pad"><h3>Complete job</h3>${bal > 0 && html`<${Btn} kind="green" icon="rupee" onClick=${() => setPay(true)}>Collect balance ${inr(bal)}</${Btn}>`}
          <${Btn} kind="navy" icon="check" onClick=${() => setDone(true)}>Photos + OTP sign-off</${Btn}></div>`
          : html`<div class="card pad"><h3>Completed ✓</h3><p class="muted">${dt(j.completed_at, 1)} · ${j.otp_verified ? 'OTP verified' : j.signature_id ? 'Digitally signed' : ''} ${+j.collected ? ' · collected ' + inr(j.collected) : ''}</p>${j.signature_id && html`<img class="sigimg" src=${'/media/' + j.signature_id}/>`}</div>`}
        ${d.history.length > 0 && html`<div class="card pad"><h3>Customer's service history</h3>${d.history.map(h => html`<div class="lrow"><div><b>${h.number} · ${h.title || h.issue}</b><small>${dt(h.created_at)}</small></div><${Badge} s=${h.status}/></div>`)}</div>`}
      </div></div>
    ${scan && html`<${Scanner} onClose=${() => setScan(false)} onResult=${(v) => { setScan(false); addSerial(v); }}/>`}
    ${pay && html`<${PaymentModal} order=${{ id: j.order_id, customer_id: j.customer_id }} due=${bal} jobId=${j.id} onClose=${() => setPay(false)} onDone=${() => { setPay(false); q.reload(); }}/>`}
    ${done && html`<${CompleteJob} j=${j} bal=${bal} onClose=${() => setDone(false)} onDone=${() => { setDone(false); q.reload(); }}/>`}
    ${part && html`<${AddPart} jobId=${id} onClose=${() => setPart(false)} onDone=${() => { setPart(false); q.reload(); }}/>`}
    ${carryOut && html`<${CarryOut} j=${j} onClose=${() => setCarryOut(false)} onDone=${(n) => { setCarryOut(false); go('/jobs/' + n.id); }}/>`}
    ${deliver && html`<${Deliver} j=${j} parts=${partsTotal} onClose=${() => setDeliver(false)} onDone=${() => { setDeliver(false); q.reload(); }} setStatus=${setStatus}/>`}</div>`; }}<//>`;
}
const STATUS_TXT = { open: 'Ticket created', assigned: 'Technician assigned', on_the_way: 'On the way', in_progress: 'Work started', completed: 'Completed', closed: 'Closed', cancelled: 'Cancelled', received: 'Device received', diagnosing: 'Diagnosis', awaiting_approval: 'Estimate sent for approval', repairing: 'Repairing', ready: 'Ready for pickup', delivered: 'Delivered' };
function AddPart({ jobId, onClose, onDone }) {
  const [v, bind, setV] = useForm({ qty: 1, chargeable: true });
  return html`<${Modal} title="Add part / spare used" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { if (!v.description && !v.product_id) return toast('Pick a product or type a part', 'err'); await run(() => api(`jobs/${jobId}/parts`, { body: v }), 'Part added' + (v.product_id ? ' — stock reduced' : '')); onDone(); }}>Add part</${Btn}>`}>
    <${ProductPicker} ph="Pick from stock (or type custom part below)…" onPick=${(p) => setV(x => p.custom ? { ...x, product_id: null, description: p.name } : { ...x, product_id: p.id, description: p.name, rate: +p.price })}/>
    <div class="form2 mt"><${F} l="Part / description" full><input ...${bind('description')}/></${F}><${F} l="Qty"><input type="number" ...${bind('qty')}/></${F}><${F} l="Rate ₹"><input type="number" ...${bind('rate')}/></${F}><${F} l="Serial (optional)"><input ...${bind('serial')}/></${F}></div>
    <label class="chk"><input type="checkbox" ...${bind('chargeable', 'check')}/> Chargeable to customer (untick for warranty / AMC)</label><//>`;
}
function CarryOut({ j, onClose, onDone }) {
  const [dv, bindD, setD] = useForm({ type: 'Laptop', accessories: [] }); const [issue, setIssue] = useState(j.issue || '');
  return html`<${Modal} wide title="Take device to workshop" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { const n = await run(() => api(`jobs/${j.id}/carry-in`, { body: { device: dv, issue } }), 'Workshop ticket created — customer informed'); onDone(n); }}>Create workshop ticket</${Btn}>`}>
    <${DeviceForm} v=${dv} bind=${bindD} setV=${setD}/><div class="mt"><${F} l="Fault / reason"><input value=${issue} onInput=${(e) => setIssue(e.target.value)}/></${F}></div><//>`;
}
function Deliver({ j, parts, onClose, setStatus }) {
  const [amt, setAmt] = useState(Math.round(+j.estimate || parts * 1.18 || 0)); const [mode, setMode] = useState('Cash');
  return html`<${Modal} title=${'Deliver ' + j.number} onClose=${onClose} foot=${html`<${Btn} kind="green" icon="check" onClick=${async () => { await setStatus('delivered', { collect: amt, mode }); onClose(); }}>Mark delivered</${Btn}>`}>
    <div class="form2"><${F} l="Amount collected ₹"><input type="number" value=${amt} onInput=${(e) => setAmt(e.target.value)}/></${F}><${F} l="Mode"><select value=${mode} onChange=${(e) => setMode(e.target.value)}>${['Cash', 'UPI', 'Card', 'No charge'].map(m => html`<option>${m}</option>`)}</select></${F}></div><p class="muted small">Receipt goes to customer on WhatsApp.</p><//>`;
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
  const [tab, setTab] = useState('members');
  return html`<div><div class="ph"><h1>Team, attendance & location</h1><${Tabs} tabs=${[['members', 'Members & targets'], ['attendance', 'Attendance'], ['location', 'Live location']]} cur=${tab} onChange=${setTab}/></div>
    ${tab === 'members' ? html`<${Members}/>` : tab === 'attendance' ? html`<${Attendance}/>` : html`<${LiveLocation}/>`}</div>`;
}
function Members() {
  const q = useApi('team'); const [ed, setEd] = useState(null); const [task, setTask] = useState(false); const [log, setLog] = useState(false);
  return html`<div><div class="row gap between"><span></span><div class="row gap"><${Btn} kind="ghost" onClick=${() => setLog(true)}>Activity log</${Btn}><${Btn} kind="ghost" icon="plus" onClick=${() => setEd({ role: 'sales' })}>Add member</${Btn}><${Btn} icon="plus" onClick=${() => setTask(true)}>Assign task</${Btn}></div></div>
  <${Load} q=${q}>${(d) => html`<div class="g2c wide-l mt"><div class="card"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>Today</th><th>Leads</th><th>Won</th><th>Target</th><th>Achieved</th><th></th></tr></thead><tbody>
    ${d.rows.map(u => { const ach = u.role === 'sales' ? (u.target ? Math.round(u.sales / u.target * 100) : 0) : (u.target ? Math.round(u.jobs_done / u.target * 100) : 0);
      return html`<tr class=${u.active ? '' : 'dim'}><td><div class="trow"><span class="av">${initials(u.name)}</span><div><b>${u.name}</b>${u.overdue > 0 && html`<small class="t-red">${u.overdue} overdue follow-ups</small>`}</div></div></td><td>${u.role === 'sales' ? 'Sales' : 'Technician'}${u.categories && html`<small>${u.categories.split(',').map(c => CATS[c] || c).join(', ')}</small>`}</td>
      <td>${u.on_site ? html`<span class="t-blue">Site · ${u.on_site}</span>` : u.check_in ? html`<span class="t-green">In ${tm(u.check_in)}${u.check_out ? ' · Out ' + tm(u.check_out) : ''}</span>` : html`<span class="muted">Not checked in</span>`}</td>
      <td>${u.role === 'sales' ? u.leads : '—'}</td><td>${u.role === 'sales' ? u.won : '—'}</td><td>${u.role === 'sales' ? inr(u.target, 1) : u.target + ' jobs'}</td>
      <td><div class="prog"><i style=${{ width: Math.min(100, ach) + '%' }}></i></div><small>${ach}% ${u.role === 'sales' ? '· ' + inr(u.sales, 1) : '· ' + u.jobs_done + ' jobs'}</small></td><td><button class="icbtn" onClick=${() => setEd(u)}><${Ic} n="edit" s=${15}/></button></td></tr>`; })}</tbody></table></div>
    <div class="card pad"><h3>Tasks today</h3>${d.tasks.map(t => html`<label class=${'chk task' + (t.done ? ' done' : '')}><input type="checkbox" checked=${t.done} onChange=${async (e) => { await patch('tasks/' + t.id, { done: e.target.checked }); q.reload(); }}/><span>${t.title}</span><small>${t.uname || ''}</small></label>`)}</div></div>`}<//>
  ${ed && html`<${Member} u=${ed} onClose=${() => setEd(null)} onDone=${() => { setEd(null); q.reload(); }}/>`}
  ${task && html`<${TaskModal} onClose=${() => setTask(false)} onDone=${() => { setTask(false); q.reload(); }}/>`}
  ${log && html`<${ActivityLog} onClose=${() => setLog(false)}/>`}</div>`;
}
const gmap = (loc) => loc && /^-?[\d.]+,-?[\d.]+$/.test(loc) ? html`<a class="t-blue" target="_blank" href=${'https://www.google.com/maps?q=' + loc}><${Ic} n="pin" s=${13}/> map</a>` : '';
function Attendance() {
  const today = new Date().toISOString().slice(0, 10); const [from, setFrom] = useState(new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)); const [to, setTo] = useState(today); const [uid, setUid] = useState('');
  const users = useApi('users'); const q = useApi(`attendance?from=${from}&to=${to}&user=${uid}`);
  return html`<div><div class="filterbar mt"><input type="date" value=${from} onChange=${(e) => setFrom(e.target.value)}/><input type="date" value=${to} onChange=${(e) => setTo(e.target.value)}/>
    <select class="sel" value=${uid} onChange=${(e) => setUid(e.target.value)}><option value="">All staff</option>${(users.data || []).filter(u => u.role !== 'owner').map(u => html`<option value=${u.id}>${u.name}</option>`)}</select>
    <${Btn} kind="ghost" icon="download" onClick=${() => openFile(`/api/attendance?from=${from}&to=${to}&user=${uid}&format=csv`, 'attendance.csv')}>Excel (CSV)</${Btn}></div>
  <${Load} q=${q}>${(rows) => html`<div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>In location</th><th>Out location</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => html`<tr><td>${dt(r.day)}</td><td><b>${r.name}</b><small>${r.role}</small></td><td class="t-green">${tm(r.check_in)}</td><td>${r.check_out ? tm(r.check_out) : html`<span class="muted">—</span>`}</td><td>${r.hours != null ? r.hours + ' h' : ''}</td><td>${gmap(r.location)}</td><td>${gmap(r.out_location)}</td></tr>`) : html`<tr><td colspan="7"><${Empty}>No attendance in this period<//></td></tr>`}</tbody></table></div>`}<//>
  <p class="muted small mt">Staff check in / out from the app (Today / Me screen). Location is captured at check-in and check-out.</p></div>`;
}
function LiveLocation() {
  const q = useApi('team/locations'); const [sel, setSel] = useState(null); const [day, setDay] = useState(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)); const [pts, setPts] = useState([]);
  const mapEl = useRef(); const mapRef = useRef(); const layer = useRef();
  useEffect(() => { const t = setInterval(q.reload, 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (sel) api(`team/locations/${sel}?date=${day}`).then(setPts); }, [sel, day]);
  useEffect(() => { (async () => {
    if (!window.L) { await new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l); const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = ok; s.onerror = ok; document.head.appendChild(s); }); }
    if (!window.L || !mapEl.current) return;
    if (!mapRef.current) { mapRef.current = window.L.map(mapEl.current).setView([25.3463, 74.6364], 12); window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapRef.current); }
    const L = window.L, m = mapRef.current; if (layer.current) layer.current.remove(); layer.current = L.layerGroup().addTo(m); const b = [];
    if (sel && pts.length) { const ll = pts.map(p => [p.lat, p.lng]); L.polyline(ll, { color: '#1E9BE0', weight: 4 }).addTo(layer.current); pts.forEach((p, i) => { L.circleMarker([p.lat, p.lng], { radius: i === pts.length - 1 ? 8 : 4, color: p.kind === 'check_in' ? '#16A34A' : p.kind === 'check_out' ? '#DC2626' : '#1373C9' }).bindPopup(`${tm(p.at)} · ${p.kind}${p.note ? ' · ' + p.note : ''}`).addTo(layer.current); b.push([p.lat, p.lng]); }); }
    else (q.data || []).filter(u => u.lat).forEach(u => { L.marker([u.lat, u.lng]).bindPopup(`<b>${u.name}</b><br>${u.role} · ${new Date(u.at).toLocaleString('en-IN')}${u.on_job ? '<br>On job: ' + u.on_job : ''}`).addTo(layer.current); b.push([u.lat, u.lng]); });
    if (b.length) m.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
  })(); }, [q.data, pts, sel]);
  return html`<div class="g2c wide-r mt"><div class="card pad"><h3>Staff</h3>${(q.data || []).map(u => html`<button class=${'lrow staff-row' + (sel === u.id ? ' on' : '')} onClick=${() => setSel(sel === u.id ? null : u.id)}><div><b>${u.name}</b><small>${u.role === 'tech' ? 'Technician' : 'Sales'}${u.on_job ? ' · on job: ' + u.on_job : ''}</small></div>
      <div class="r">${u.at ? html`<small class=${Date.now() - new Date(u.at) < 15 * 60000 ? 't-green' : 'muted'}>● ${ago(u.at)} ago</small>` : html`<small class="muted">no location</small>`}${u.lat && html`<a class="t-blue small" target="_blank" href=${'https://www.google.com/maps?q=' + u.lat + ',' + u.lng} onClick=${(e) => e.stopPropagation()}>Google Maps</a>`}</div></button>`)}
      ${sel && html`<div class="mt"><${F} l="History for date"><input type="date" value=${day} onChange=${(e) => setDay(e.target.value)}/></${F}><p class="small muted">${pts.length} points · green = check-in · red = check-out</p>${pts.length > 0 && html`<a class="btn b-ghost sm" target="_blank" href=${'https://www.google.com/maps/dir/' + pts.filter((_, i) => i % Math.ceil(pts.length / 20 || 1) === 0).map(p => p.lat + ',' + p.lng).join('/')}>Open route in Google Maps</a>`}</div>`}</div>
    <div class="card"><div ref=${mapEl} class="livemap"></div></div></div>`;
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
