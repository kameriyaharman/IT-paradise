import { html, useState, useEffect, api, put, patch, useApi, Load, Ic, Badge, Kpi, inr, dt, go, qparam, toast, run, Btn, Modal, F, useForm, Search, Tabs, ProductPicker, Empty, openFile, auth, waLink, openExternal } from './ui.js';

export function calc(items, discount) {
  const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.rate || 0), 0);
  const disc = Math.min(+discount || 0, sub); const f = sub ? (sub - disc) / sub : 1;
  const gst = items.reduce((a, i) => a + (+i.qty || 0) * (+i.rate || 0) * f * ((i.gst_rate == null ? 18 : +i.gst_rate) / 100), 0);
  return { sub, disc, gst, total: Math.round(sub - disc + gst) };
}

// ================= Quotations list =================
export function Quotations({ user }) {
  const q = useApi('quotations'); const [s, setS] = useState(''); const [st, setSt] = useState('');
  return html`<div><div class="ph"><h1>Quotations</h1><div class="row gap"><${Search} value=${s} onInput=${setS} ph="Number / customer"/><a class="btn b-pri" href="#/quotations/new"><${Ic} n="plus" s=${16}/> New quotation</a></div></div>
  <${Tabs} tabs=${[['', 'All'], ['pending_approval', 'Needs approval'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['converted', 'Converted']]} cur=${st} onChange=${setSt}/>
  <${Load} q=${q}>${(rows) => html`<div class="card mt"><table class="tbl"><thead><tr><th>Quotation</th><th>Customer</th><th>Date</th>${user.role === 'owner' && html`<th>By</th><th>Margin</th>`}<th>Total</th><th>Opened</th><th>Status</th></tr></thead><tbody>
    ${rows.filter(r => (!st || r.status === st) && (!s || (r.number + r.cname + (r.company || '')).toLowerCase().includes(s.toLowerCase()))).map(r => html`<tr class="click" onClick=${() => go('/quotations/' + r.id)}>
      <td><b>${r.number}</b>${r.version > 1 && html`<small>v${r.version}</small>`}</td><td>${r.cname}<small>${r.company || ''}</small></td><td>${dt(r.created_at)}</td>${user.role === 'owner' && html`<td>${r.uname}</td><td>${r.total ? Math.round(r.margin / (r.subtotal - r.discount || 1) * 100) + '%' : ''}</td>`}
      <td><b>${inr(r.total)}</b></td><td>${r.opened_count ? r.opened_count + '×' : '—'}</td><td><${Badge} s=${r.status}/></td></tr>`)}</tbody></table></div>`}<//></div>`;
}

// ================= Quotation editor / viewer =================
export function QuoteEditor({ id, user, mobile }) {
  const isNew = id === 'new';
  const [qt, setQt] = useState(null); const [items, setItems] = useState([]); const [cust, setCust] = useState(null);
  const [meta, bindMeta, setMeta] = useForm({ template: '', validity_days: 7, payment_terms: '50% advance', warranty: '1 year', discount: 0, notes: '', terms: '', delivery_terms: '' });
  const [lead, setLead] = useState(null); const [pubUrl, setPub] = useState('');
  const tpl = useApi('quote-templates');
  const [newCust, bindNC] = useForm({});
  const load = async () => {
    if (isNew) {
      api('quote-defaults').then(dd => setMeta(m => ({ ...m, terms: m.terms || dd.terms, delivery_terms: m.delivery_terms || dd.delivery_terms }))).catch(() => { });
      const lid = qparam('lead'), cid = qparam('customer');
      if (lid) { const d = await api('leads/' + lid); setLead(d.lead); setCust({ name: d.lead.name, company: d.lead.company, phone: d.lead.phone });
        if (d.product) setItems([{ product_id: d.product.id, description: d.product.name, qty: parseInt(d.lead.quantity) || 1, rate: +d.product.price, gst_rate: 18 }]); }
      if (cid) { const d = await api('customers/' + cid); setCust({ ...d.customer }); }
      return;
    }
    const d = await api('quotations/' + id);
    setQt(d.quotation); setCust(d.customer); setPub(d.public_url);
    setItems(d.items.map(i => ({ ...i, qty: +i.qty, rate: +i.rate, gst_rate: +i.gst_rate })));
    setMeta({ template: d.quotation.template || '', validity_days: d.quotation.validity_days, payment_terms: d.quotation.payment_terms, warranty: d.quotation.warranty, discount: +d.quotation.discount, notes: d.quotation.notes || '', terms: d.quotation.terms || '', delivery_terms: d.quotation.delivery_terms || '' });
  };
  useEffect(() => { load().catch(e => toast(e.message, 'err')); }, [id]);
  const locked = qt && ['converted'].includes(qt.status);
  const t = calc(items, meta.discount);
  const upd = (i, k, v) => setItems(items.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const applyTpl = async (tid) => {
    const tp = (tpl.data || []).find(x => x.id === +tid); if (!tp) return;
    const prods = await api('products');
    setItems(tp.items.map(i => { const p = i.sku && prods.find(x => x.sku === i.sku); return p ? { product_id: p.id, description: p.name, qty: i.qty, rate: +p.price, gst_rate: +p.gst_rate, stock: p.stock, reserved: p.reserved } : { description: i.description, qty: i.qty, rate: i.rate, gst_rate: i.gst_rate == null ? 18 : i.gst_rate }; }));
    setMeta(m => ({ ...m, template: tp.name }));
  };
  const body = () => ({ ...meta, items: items.map(i => ({ product_id: i.product_id, description: i.description, qty: i.qty, rate: i.rate, gst_rate: i.gst_rate })), lead_id: lead ? lead.id : (qt && qt.lead_id), customer_id: cust && cust.id, customer: !lead && !(cust && cust.id) ? newCust : undefined });
  const save = async () => {
    if (!items.length) return toast('Add at least one item', 'err');
    const r = isNew ? await run(() => api('quotations', { body: body() })) : await run(() => put('quotations/' + id, body()));
    toast(r.status === 'pending_approval' ? 'Saved — sent to owner for approval (discount/margin limit)' : 'Quotation saved', r.status === 'pending_approval' ? 'warn' : 'ok');
    if (isNew) go((mobile ? '/quote/' : '/quotations/') + r.id); else load();
    return r;
  };
  const send = async (channel) => { const r = await run(() => api(`quotations/${id}/send`, { body: { channel } }));
    if (r.ok) toast('Sent on ' + channel + ' ✓'); else if (channel === 'whatsapp' && r.waLink) { toast('WhatsApp API not connected — opening WhatsApp', 'warn'); openExternal(r.waLink); } else toast('Not sent: ' + (r.error || r.status), 'err'); load(); };
  const convert = async () => { if (!confirm('Convert to sales order? Stock will be reserved and GST invoice created.')) return; const o = await run(() => api(`quotations/${id}/convert`, { body: {} }), 'Order created'); go('/orders/' + o.id); };
  if (!isNew && !qt) return html`<div class="spin"><span></span></div>`;
  return html`<div>
    <div class="ph"><h1>${!mobile && html`<a href="#/quotations" class="back"><${Ic} n="back"/></a>`} ${isNew ? 'New quotation' : 'Quotation ' + qt.number}${qt && html` <${Badge} s=${qt.status}/>`}</h1>
      ${qt && qt.status === 'pending_approval' && user.role === 'owner' && html`<${Btn} kind="green" icon="check" onClick=${async () => { await run(() => api(`quotations/${id}/approve`, { body: {} }), 'Approved'); load(); }}>Approve quotation</${Btn}>`}</div>
    <div class=${mobile ? '' : 'qgrid'}>
      <div class="card pad">
        <div class="cust-line">${cust ? html`<div><small class="muted">Customer</small><b>${cust.name}${cust.company ? ' · ' + cust.company : ''}</b><small>${cust.phone ? '+' + cust.phone : ''}</small></div>`
          : html`<div class="form2 grow"><${F} l="Customer name *"><input ...${bindNC('name')}/></${F}><${F} l="Mobile"><input ...${bindNC('phone')}/></${F}><${F} l="Company"><input ...${bindNC('company')}/></${F}><${F} l="GSTIN"><input ...${bindNC('gstin')}/></${F}></div>`}</div>
        <table class="tbl qitems"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th>${!mobile && html`<th>GST</th><th>Stock</th>`}<th>Amount</th><th></th></tr></thead><tbody>
          ${items.map((i, ix) => html`<tr><td><input value=${i.description} disabled=${locked} onInput=${(e) => upd(ix, 'description', e.target.value)}/></td>
            <td><input type="number" class="num" value=${i.qty} disabled=${locked} onInput=${(e) => upd(ix, 'qty', e.target.value)}/></td>
            <td><input type="number" class="num w" value=${i.rate} disabled=${locked} onInput=${(e) => upd(ix, 'rate', e.target.value)}/></td>
            ${!mobile && html`<td><select value=${i.gst_rate} disabled=${locked} onChange=${(e) => upd(ix, 'gst_rate', +e.target.value)}>${[0, 5, 12, 18, 28].map(g => html`<option value=${g}>${g}%</option>`)}</select></td>
            <td>${i.product_id ? html`<span class=${(i.stock - i.reserved) >= i.qty ? 't-green' : 't-red'}>${i.stock != null ? 'In stock ' + (i.stock - (i.reserved || 0)) : ''}</span>` : '—'}</td>`}
            <td><b>${inr(i.qty * i.rate)}</b></td><td>${!locked && html`<button class="icbtn" onClick=${() => setItems(items.filter((_, j) => j !== ix))}><${Ic} n="x" s=${14}/></button>`}</td></tr>`)}
        </tbody></table>
        ${!locked && html`<${ProductPicker} onPick=${(p) => setItems([...items, p.custom ? { description: p.name || 'Service', qty: 1, rate: 0, gst_rate: 18 } : { product_id: p.id, description: p.name, qty: 1, rate: +p.price, gst_rate: +p.gst_rate, stock: p.stock, reserved: p.reserved }])}/>`}
      </div>
      <div class="card pad qsum">
        <h3>Summary</h3>
        <div class="sline"><span>Sub total</span><b>${inr(t.sub)}</b></div>
        <div class="sline"><span>Discount ₹</span><input type="number" class="num w" disabled=${locked} ...${bindMeta('discount')}/></div>
        <div class="sline"><span>GST</span><b>${inr(t.gst)}</b></div>
        <div class="sline total"><span>Grand total</span><b>${inr(t.total)}</b></div>
        ${qt && user.role === 'owner' && qt.margin != null && html`<div class="sline"><span>Margin</span><b class="t-green">${inr(qt.margin)} (${Math.round(qt.margin / ((qt.subtotal - qt.discount) || 1) * 100)}%)</b></div>`}
        <div class="form2">
          <${F} l="Template"><select disabled=${locked} value="" onChange=${(e) => applyTpl(e.target.value)}><option value="">${meta.template || 'Choose package…'}</option>${(tpl.data || []).map(x => html`<option value=${x.id}>${x.name}</option>`)}</select></${F}>
          <${F} l="Validity (days)"><input type="number" disabled=${locked} ...${bindMeta('validity_days')}/></${F}>
          <${F} l="Payment"><select disabled=${locked} ...${bindMeta('payment_terms')}>${['50% advance', '100% advance', '30% advance', 'On delivery', '15 days credit', '30 days credit'].map(x => html`<option>${x}</option>`)}</select></${F}>
          <${F} l="Warranty"><input disabled=${locked} ...${bindMeta('warranty')}/></${F}><${F} l="Delivery terms"><input disabled=${locked} ...${bindMeta('delivery_terms')}/></${F}><${F} l="Notes" full><input disabled=${locked} ...${bindMeta('notes')}/></${F}>
          <${F} l="Terms & conditions (printed on PDF — edit for this quotation)" full><textarea rows="7" class="tc" disabled=${locked} ...${bindMeta('terms')}></textarea></${F}>
        </div>
        ${!locked && html`<${Btn} kind="navy" onClick=${save}>${isNew ? 'Save quotation' : 'Save changes'}</${Btn}>`}
        ${qt && html`<div class="qbtns"><${Btn} kind="ghost" icon="doc" onClick=${() => openFile(`/api/quotations/${id}/pdf`)}>PDF</${Btn}>
          <${Btn} kind="wa" icon="wa" disabled=${qt.status === 'pending_approval'} onClick=${() => send('whatsapp')}>WhatsApp</${Btn}>
          <${Btn} kind="ghost" icon="send" disabled=${qt.status === 'pending_approval'} onClick=${() => send('email')}>Email</${Btn}>
          ${!locked && html`<${Btn} icon="cart" disabled=${qt.status === 'pending_approval'} onClick=${convert}>Convert to order</${Btn}>`}</div>
          <p class="muted small">Tracks when the customer opens the PDF · opened ${qt.opened_count}× ${qt.last_opened_at ? '· last ' + dt(qt.last_opened_at, 1) : ''}</p>
          ${pubUrl && html`<p class="small"><a href=${pubUrl} target="_blank">Customer link</a> · <a href="#" onClick=${(e) => { e.preventDefault(); navigator.clipboard && navigator.clipboard.writeText(pubUrl); toast('Link copied'); }}>copy</a></p>`}
          ${['sent', 'approved', 'draft'].includes(qt.status) && html`<div class="row gap"><${Btn} sm kind="green" onClick=${async () => { const r = await run(() => api(`quotations/${id}/status`, { body: { status: 'accepted' } }), 'Marked accepted'); if (r.order) go('/orders/' + r.order.id); else load(); }}>Customer accepted</${Btn}><${Btn} sm kind="ghost" onClick=${async () => { await run(() => api(`quotations/${id}/status`, { body: { status: 'rejected' } })); load(); }}>Rejected</${Btn}></div>`}
          ${qt.status === 'converted' && html`<${Btn} kind="ghost" onClick=${async () => { const o = await api('orders'); const x = o.rows.find(r => r.quotation_id === qt.id); if (x) go('/orders/' + x.id); }}>Open order →</${Btn}>`}`}
      </div>
    </div></div>`;
}

// ================= Orders =================
export function Orders({ user }) {
  const q = useApi('orders'); const [st, setSt] = useState('');
  return html`<div><div class="ph"><h1>Orders & invoices</h1><a class="btn b-pri" href="#/quotations/new"><${Ic} n="plus" s=${16}/> New order</a></div>
  <${Load} q=${q}>${(d) => html`<div class="kpis"><${Kpi} l=${'Orders (' + new Date().toLocaleString('en-IN', { month: 'short' }) + ')'} v=${d.k.n} sub=${inr(d.k.v, 1)}/><${Kpi} l="To deliver / install" v=${d.k.to_deliver}/><${Kpi} l="Invoices due" v=${d.k.inv_due} sub=${inr(d.k.inv_due_v, 1)} tone="red"/><${Kpi} l="Avg. order value" v=${inr(d.k.avg)}/></div>
    <${Tabs} tabs=${[['', 'All'], ['waiting_payment', 'Waiting payment'], ['scheduled', 'Scheduled'], ['partially_delivered', 'Partial'], ['completed', 'Completed']]} cur=${st} onChange=${setSt}/>
    <div class="card mt"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Advance / paid</th><th>Delivery / install</th><th>Invoice</th><th>Status</th></tr></thead><tbody>
    ${d.rows.filter(r => !st || r.status === st).map(r => html`<tr class="click" onClick=${() => go('/orders/' + r.id)}><td><b>${r.number}</b><small>${dt(r.created_at)}</small></td><td>${r.cname}</td><td class="clip">${r.items_text}</td><td><b>${inr(r.total)}</b></td>
      <td>${+r.paid > 0 ? html`<span class="t-green">${inr(r.paid)} ✓</span>` : r.advance_required > 0 ? html`<span class="t-red">Pending ${inr(r.advance_required)}</span>` : '—'}</td>
      <td>${r.status === 'delivered' || r.status === 'completed' ? 'Delivered' : r.delivery_date ? dt(r.delivery_date) + (r.tech ? ' · ' + r.tech : '') : 'Pending'}</td><td>${r.inv || '—'}</td><td><${Badge} s=${r.status}/></td></tr>`)}</tbody></table></div>`}<//></div>`;
}
export function OrderDetail({ id, user }) {
  const q = useApi('orders/' + id, [id]); const techs = useApi('users'); const [pay, setPay] = useState(false);
  return html`<${Load} q=${q}>${(d) => { const o = d.order; const paid = d.payments.reduce((a, p) => a + +p.amount, 0); const inv = d.invoices[0];
    return html`<div><div class="ph"><h1><a href="#/orders" class="back"><${Ic} n="back"/></a> Order ${o.number} <${Badge} s=${o.status}/></h1>
      <div class="row gap">${inv && html`<${Btn} kind="ghost" icon="doc" onClick=${() => openFile('/api/invoices/' + inv.id + '/pdf')}>GST invoice ${inv.number}</${Btn}>`}<${Btn} kind="green" icon="rupee" onClick=${() => setPay(true)}>Record payment</${Btn}>
      ${user.role === 'owner' && o.status !== 'cancelled' && o.status !== 'completed' && html`<${Btn} kind="ghost" onClick=${async () => { if (confirm('Cancel order and release reserved stock?')) { await run(() => patch('orders/' + id, { status: 'cancelled' })); q.reload(); } }}>Cancel</${Btn}>`}</div></div>
    <div class="kpis sm"><${Kpi} l="Customer" v=${o.cname}/><${Kpi} l="Total" v=${inr(o.total)}/><${Kpi} l="Paid" v=${inr(paid)} tone="green"/><${Kpi} l="Balance" v=${inr(o.total - paid)} tone="red"/><${Kpi} l="Advance required" v=${inr(o.advance_required)}/>${user.role === 'owner' && html`<${Kpi} l="Margin" v=${inr(o.margin)}/>`}</div>
    <div class="g2c wide-l"><div class="card pad"><h3>Items</h3><table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Delivered</th><th>Rate</th><th>Amount</th></tr></thead><tbody>
      ${d.items.map(i => html`<tr><td>${i.description}</td><td>${+i.qty}</td><td>${+i.delivered_qty}</td><td>${inr(i.rate)}</td><td>${inr(i.amount)}</td></tr>`)}</tbody></table>
      ${!['delivered', 'completed', 'cancelled'].includes(o.status) && html`<${Btn} kind="ghost" icon="box" onClick=${async () => { if (confirm('Mark all items delivered (stock out)?')) { await run(() => api(`orders/${id}/deliver`, { body: {} }), 'Stock updated'); q.reload(); } }}>Mark delivered (stock out)</${Btn}>`}
      ${d.serials.length > 0 && html`<h4>Serial numbers</h4><div class="chips">${d.serials.map(s => html`<a class="chip" href=${'#/serial/' + encodeURIComponent(s.serial)}>${s.serial}</a>`)}</div>`}</div>
    <div class="col-stack"><div class="card pad"><h3>Delivery / installation</h3>
      <div class="form2"><${F} l="Date"><input type="date" value=${o.delivery_date ? o.delivery_date.slice(0, 10) : ''} onChange=${async (e) => { await run(() => patch('orders/' + id, { delivery_date: e.target.value }), 'Saved'); q.reload(); }}/></${F}>
      <${F} l="Technician"><select value=${o.technician_id || ''} onChange=${async (e) => { await run(() => patch('orders/' + id, { technician_id: e.target.value }), 'Technician assigned'); q.reload(); }}><option value="">—</option>${(techs.data || []).filter(u => u.role === 'tech').map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></${F}></div>
      ${d.jobs.map(j => html`<a class="lrow" href=${'#/jobs/' + j.id}><div><b>${j.number}</b><small>${j.title} · ${j.tech || 'unassigned'}</small></div><${Badge} s=${j.status}/></a>`)}
      ${!d.jobs.length && o.status !== 'waiting_payment' && html`<${Btn} sm kind="ghost" onClick=${async () => { await run(() => api(`orders/${id}/install-job`, { body: {} }), 'Job created'); q.reload(); }}>Create installation job</${Btn}>`}
      ${o.status === 'waiting_payment' && html`<p class="muted small">Installation job is created automatically once advance is received.</p>`}</div>
    <div class="card pad"><h3>Payments</h3>${d.payments.map(p => html`<div class="lrow"><div><b>${inr(p.amount)}</b><small>${dt(p.date)} · ${p.mode}${p.reference ? ' · ' + p.reference : ''}</small></div><${Btn} sm kind="ghost" icon="doc" onClick=${() => openFile('/api/payments/' + p.id + '/receipt')}>Receipt</${Btn}></div>`)}
      ${o.total - paid > 1 && html`<p class="small">Payment link: <a href=${d.pay_link} target="_blank">${d.pay_link}</a></p><a class="btn b-wa sm" target="_blank" href=${waLink(o.cphone, `Namaste ${o.cname} ji, order ${o.number} ka balance ${inr(o.total - paid)} pay karein: ${d.pay_link}`)}><${Ic} n="wa" s=${14}/> Send payment link</a>`}</div></div></div>
    ${pay && html`<${PaymentModal} order=${o} due=${o.total - paid} invoice=${inv} onClose=${() => setPay(false)} onDone=${() => { setPay(false); q.reload(); }}/>`}</div>`; }}<//>`;
}
export function PaymentModal({ order, invoice, due, onClose, onDone, jobId }) {
  const [v, bind] = useForm({ amount: Math.round(due || 0), mode: 'UPI', reference: '' });
  return html`<${Modal} title=${'Record payment' + (invoice ? ' · ' + invoice.number : '')} onClose=${onClose} foot=${html`<${Btn} kind="green" onClick=${async () => { await run(() => api('payments', { body: { ...v, order_id: order && order.id, invoice_id: invoice && invoice.id, customer_id: invoice ? invoice.customer_id : order && order.customer_id, job_id: jobId } }), 'Payment saved — receipt sent'); onDone(); }}>Save & send receipt</${Btn}>`}>
    <div class="form2"><${F} l="Amount ₹"><input type="number" ...${bind('amount')}/></${F}><${F} l="Mode"><select ...${bind('mode')}>${['UPI', 'Cash', 'Card', 'NEFT / RTGS', 'Cheque'].map(m => html`<option>${m}</option>`)}</select></${F}><${F} l="Reference / UTR" full><input ...${bind('reference')}/></${F}></div>
    <p class="muted small">Balance due: ${inr(due)}</p><//>`;
}

// ================= Payments & dues =================
export function Payments({ user }) {
  const q = useApi('payments/dues'); const hist = useApi('payments'); const [sel, setSel] = useState(null); const [tab, setTab] = useState('dues');
  return html`<div><div class="ph"><h1>Payments & dues</h1><${Tabs} tabs=${[['dues', 'Outstanding'], ['history', 'Received']]} cur=${tab} onChange=${setTab}/></div>
  ${tab === 'dues' ? html`<${Load} q=${q}>${(d) => html`<div class="kpis sm"><${Kpi} l="Total outstanding" v=${inr(d.k.total, 1)}/><${Kpi} l="Overdue" v=${inr(d.k.overdue, 1)} tone="red"/></div>
    <div class="card mt"><table class="tbl"><thead><tr><th>Customer</th><th>Invoice</th><th>Amount</th><th>Paid</th><th>Due</th><th>Due date</th><th>Status</th><th>Collect payment</th></tr></thead><tbody>
    ${d.rows.map(r => { const od = r.od; return html`<tr><td><b>${r.cname}</b></td><td>${r.number}<small>${r.order_no || ''}</small></td><td>${inr(r.total)}</td><td>${inr(r.paid)}</td><td><b>${inr(r.total - r.paid)}</b></td><td>${dt(r.due_date)}</td>
      <td>${od > 0 ? html`<${Badge} s="overdue">Overdue ${od} d<//>` : od === 0 ? html`<${Badge} s="due">Due today<//>` : html`<${Badge} s="notdue">Not due<//>`}</td>
      <td class="nowrap"><${Btn} sm kind="wa" icon="wa" onClick=${async () => { const x = await run(() => api('payments/remind/' + r.id, { body: {} })); x.ok ? toast('Reminder sent') : openExternal(x.waLink); }}>Remind</${Btn}> <${Btn} sm kind="green" onClick=${() => setSel(r)}>Record</${Btn}> <${Btn} sm kind="ghost" icon="doc" onClick=${() => openFile('/api/invoices/' + r.id + '/pdf')}/></td></tr>`; })}</tbody></table></div>`}<//>`
    : html`<${Load} q=${hist}>${(rows) => html`<div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Invoice</th><th>Amount</th><th>Mode</th><th>By</th><th></th></tr></thead><tbody>
      ${rows.map(p => html`<tr><td>${dt(p.date)}</td><td>${p.number}</td><td>${p.cname}</td><td>${p.inv || '—'}</td><td><b>${inr(p.amount)}</b></td><td>${p.mode}${p.reference ? ' · ' + p.reference : ''}</td><td>${p.uname || ''}</td><td><${Btn} sm kind="ghost" icon="doc" onClick=${() => openFile('/api/payments/' + p.id + '/receipt')}/></td></tr>`)}</tbody></table></div>`}<//>`}
  ${sel && html`<${PaymentModal} invoice=${sel} due=${sel.total - sel.paid} onClose=${() => setSel(null)} onDone=${() => { setSel(null); q.reload(); hist.reload(); }}/>`}</div>`;
}
