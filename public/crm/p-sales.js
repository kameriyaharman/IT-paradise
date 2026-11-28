import { html, useState, useEffect, useRef, api, patch, useApi, Load, Ic, Badge, Kpi, inr, dt, tm, ago, initials, go, qparam, toast, run, Btn, Modal, F, useForm, Search, Tabs, STAGES, STAGE, SOURCES, CATS, LOST, localInput, waLink, Empty, auth, openFile } from './ui.js';

const SRC_COL = { whatsapp: '#22C55E', website: '#1E9BE0', call: '#6366F1', indiamart: '#F59E0B', instagram: '#E1306C', facebook: '#1877F2', walkin: '#94A3B8', linkedin: '#0A66C2', google: '#EA4335', email: '#0EA5E9', reference: '#8B5CF6', manual: '#64748B' };

// ================= Dashboard =================
export function Dashboard({ user }) {
  const q = useApi('dashboard');
  return html`<div><div class="ph"><h1>Dashboard</h1><span class="muted">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  <${Load} q=${q}>${(d) => { const k = d.k; const growth = +k.sales_prev ? Math.round((k.sales_month - k.sales_prev) / k.sales_prev * 100) : null;
    const fun = Object.fromEntries(d.funnel.map(f => [f.stage, f.c])); const tot = d.funnel.reduce((a, f) => a + f.c, 0);
    const steps = [['Leads', tot], ['Contacted', tot - (fun.new || 0) - (fun.lost || 0)], ['Quotation sent', (fun.quotation || 0) + (fun.negotiation || 0) + (fun.won || 0)], ['Negotiation', (fun.negotiation || 0) + (fun.won || 0)], ['Won', fun.won || 0]];
    const srcTot = d.sources.reduce((a, s) => a + s.c, 0) || 1;
    return html`
    <div class="kpis">
      <${Kpi} l="New leads today" v=${k.leads_today} sub=${`WhatsApp ${k.leads_today_wa}`} tone="green" onClick=${() => go('/leads')}/>
      <${Kpi} l="Follow-ups due" v=${k.fu_due} sub=${`${k.fu_overdue} overdue`} tone="red" onClick=${() => go('/followups')}/>
      <${Kpi} l="Quotes this month" v=${k.quotes_month} sub=${inr(k.quotes_value, 1)} onClick=${() => go('/quotations')}/>
      <${Kpi} l=${'Sales (' + new Date().toLocaleString('en-IN', { month: 'short' }) + ')'} v=${inr(k.sales_month, 1)} sub=${growth == null ? '' : (growth >= 0 ? '+' : '') + growth + '%'} tone=${growth >= 0 ? 'green' : 'red'} onClick=${() => go('/orders')}/>
      <${Kpi} l="Payments due" v=${inr(k.dues, 1)} sub=${`${k.dues_count} invoices`} tone="red" onClick=${() => go('/payments')}/>
      <${Kpi} l="Low stock items" v=${k.low_stock} sub="reorder" tone="red" onClick=${() => go('/stock')}/>
    </div>
    ${user.role === 'owner' && html`<div class="kpis sm">
      <${Kpi} l="Collected (month)" v=${inr(k.collected_month, 1)}/><${Kpi} l="Pending quotations" v=${k.pending_quotes} onClick=${() => go('/quotations')}/>
      <${Kpi} l="Pending installations" v=${k.pending_installs} onClick=${() => go('/service')}/><${Kpi} l="Open service tickets" v=${k.pending_tickets} onClick=${() => go('/service')}/>
      <${Kpi} l="AMC expiring (30 d)" v=${k.amc_expiring} onClick=${() => go('/service')}/><${Kpi} l="Stock valuation" v=${inr(k.stock_value, 1)} onClick=${() => go('/stock')}/></div>`}
    <div class="g2c">
      <div class="card pad"><h3>Sales funnel · ${new Date().toLocaleString('en-IN', { month: 'long' })}</h3>
        ${steps.map(([l, v]) => html`<div class="hbar"><span>${l}</span><div><i style=${{ width: (tot ? Math.max(4, v / tot * 100) : 0) + '%' }}>${v}</i></div></div>`)}</div>
      <div class="card pad"><h3>Leads by source <small class="muted">· 30 days</small></h3>
        ${d.sources.length ? d.sources.map(s => html`<div class="srow"><span>${SOURCES[s.source] || s.source}</span><div class="sbar"><i style=${{ width: (s.c / srcTot * 100) + '%', background: SRC_COL[s.source] || '#1E9BE0' }}></i></div><b>${Math.round(s.c / srcTot * 100)}%</b></div>`) : html`<${Empty}/>`}</div>
    </div>
    <div class="g3c">
      <div class="card pad"><h3>Today’s follow-ups</h3>${d.followups.length ? d.followups.map(f => html`<a class="lrow" href=${'#/leads/' + f.lead_id}><div><b>${f.name}</b><small>${f.need || f.note || ''}</small></div><${Badge} s=${f.stage}/></a>`) : html`<${Empty}>All caught up 🎉<//>`}</div>
      <div class="card pad"><h3>Top selling (${new Date().toLocaleString('en-IN', { month: 'short' })})</h3>${d.top.length ? d.top.map(t => html`<div class="lrow"><div><b>${t.name}</b></div><b>${t.qty}</b></div>`) : html`<${Empty}>No orders yet this month<//>`}</div>
      ${user.role === 'owner' ? html`<div class="card pad"><h3>Team today</h3>${d.team.map(t => html`<div class="trow"><span class="av">${initials(t.name)}</span><div><b>${t.name}</b><small>${t.role === 'sales' ? `Sales · ${t.calls} calls · ${t.quotes} quotes · ${t.chats} WA` : `Tech · ${t.installs} installs · ${t.services} service`}</small></div>${t.check_in ? html`<${Badge} s="ok">In ${tm(t.check_in)}<//>` : html`<${Badge} s="cancelled">Not in<//>`}</div>`)}</div>`
        : html`<div class="card pad"><h3>Quick actions</h3><div class="qa"><a class="btn b-pri" href="#/leads?new=1">+ New lead</a><a class="btn b-ghost" href="#/quotations/new">+ New quotation</a><a class="btn b-ghost" href="#/inbox">WhatsApp inbox</a></div></div>`}
    </div>`; }}<//></div>`;
}

// ================= WhatsApp inbox =================
export function Inbox({ phone, user }) {
  const list = useApi('inbox');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setInterval(list.reload, 15000); return () => clearInterval(t); }, []);
  return html`<div><div class="ph"><h1>WhatsApp inbox — lead capture</h1>${auth.me && !auth.me.wa_ready && html`<a class="badge t-amber" href="#/settings">WhatsApp API not connected — messages are queued. Connect in Settings →</a>`}</div>
  <div class="inbox card">
    <div class="ilist"><${Search} value=${q} onInput=${setQ} ph="Search chats"/>
      <${Load} q=${list}>${(rows) => rows.filter(r => !q || (r.name || '').toLowerCase().includes(q.toLowerCase()) || r.phone.includes(q)).map(r => html`<a class=${'chat' + (r.phone === phone ? ' on' : '')} href=${'#/inbox/' + r.phone}>
        <span class="av">${initials(r.name || '+')}</span><div><b>${r.name || '+' + r.phone}</b><small>${r.body}</small></div><div class="r"><small>${tm(r.created_at)}</small>${r.unread > 0 && html`<i class="dot">${r.unread}</i>`}</div></a>`)}<//>
    </div>
    ${phone ? html`<${Chat} phone=${phone} user=${user} onSent=${list.reload}/>` : html`<div class="ichat"><${Empty}>Select a chat<//></div><div></div>`}
  </div></div>`;
}
function Chat({ phone, user, onSent }) {
  const q = useApi('inbox/' + phone, [phone]);
  const [txt, setTxt] = useState(''); const end = useRef();
  useEffect(() => { end.current && end.current.scrollIntoView(); }, [q.data]);
  useEffect(() => { const t = setInterval(q.reload, 10000); return () => clearInterval(t); }, [phone]);
  const send = async (text) => { if (!text) return; const r = await run(() => api('inbox/' + phone, { body: { text } })); setTxt(''); q.reload(); onSent();
    if (r && !r.ok) toast(r.status === 'not_configured' ? 'Saved — WhatsApp API not connected yet' : 'Send failed: ' + (r.error || ''), 'err'); };
  return html`<${Load} q=${q}>${(d) => html`
    <div class="ichat"><div class="msgs">${d.messages.map(m => html`<div class=${'msg ' + m.direction + (m.is_bot ? ' bot' : '')}>${m.is_bot ? '🤖 ' : ''}${m.body}<small>${tm(m.created_at)}${m.direction === 'out' ? ' · ' + (m.status === 'not_configured' ? 'queued' : m.status) : ''}${m.uname ? ' · ' + m.uname : ''}</small></div>`)}<div ref=${end}></div></div>
      <form class="composer" onSubmit=${(e) => { e.preventDefault(); send(txt); }}><input placeholder="Type a message…" value=${txt} onInput=${(e) => setTxt(e.target.value)}/><button class="btn b-wa"><${Ic} n="send" s=${16}/></button></form></div>
    <div class="iside">${d.lead ? html`<${Badge} s="won">Lead auto-created ✓<//><h3>${d.lead.name}</h3>
      <dl><dt>Company</dt><dd>${d.lead.company || '—'}</dd><dt>Need</dt><dd>${d.lead.need || '—'}</dd><dt>Source</dt><dd>${SOURCES[d.lead.source]}${d.lead.source_detail ? ' · ' + d.lead.source_detail : ''}</dd>
      <dt>Assigned to</dt><dd>${d.lead.owner_name || '—'}</dd><dt>Stage</dt><dd><${Badge} s=${d.lead.stage}/></dd></dl>
      <div class="row gap"><a class="btn b-pri sm" href=${'#/quotations/new?lead=' + d.lead.id}>Quotation</a><a class="btn b-ghost sm" href=${'#/leads/' + d.lead.id}>Open lead</a></div>` : html`<p class="muted">No lead linked yet.</p>`}
      <h4>Quick replies</h4><div class="chips">${(d.quick_replies || []).map(t => html`<button class="chip" onClick=${() => setTxt(t === 'Location' ? 'Our showroom: ' + location.origin + '/contact' : t === 'Catalogue PDF' ? 'Catalogue: ' + location.origin + '/products' : t === 'Price list' ? 'Price list: ' + location.origin + '/products' : t === 'Thank you' ? 'Thank you! 🙏 — IT Paradise' : t)}>${t}</button>`)}</div>
    </div>`}<//>`;
}

// ================= Leads & pipeline =================
export function NewLead({ onClose, onSaved, preset }) {
  const users = useApi(auth.user.role === 'owner' ? 'users' : null);
  const [v, bind] = useForm({ source: 'walkin', ...preset });
  const save = async () => { const r = await run(() => api('leads', { body: v })); if (r.duplicate) toast('Existing lead found — enquiry added to it', 'warn'); else toast('Lead created'); onSaved(r.lead); };
  return html`<${Modal} title="New lead" onClose=${onClose} foot=${html`<${Btn} kind="ghost" onClick=${onClose}>Cancel</${Btn}><${Btn} onClick=${save}>Save lead</${Btn}>`}>
    <div class="form2"><${F} l="Name *"><input ...${bind('name')}/></${F}><${F} l="Mobile *"><input ...${bind('phone')} inputmode="tel"/></${F}>
    <${F} l="Company"><input ...${bind('company')}/></${F}><${F} l="City"><input ...${bind('city')}/></${F}><${F} l="Email"><input ...${bind('email')}/></${F}>
    <${F} l="Source"><select ...${bind('source')}>${Object.entries(SOURCES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></${F}>
    <${F} l="Requirement" full><input ...${bind('need')} placeholder="8 IP cameras + NVR"/></${F}><${F} l="Quantity"><input ...${bind('quantity')}/></${F}><${F} l="Budget"><input ...${bind('budget')}/></${F}>
    <${F} l="Category"><select ...${bind('category')}><option value="">Auto-detect</option>${Object.entries(CATS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></${F}>
    ${users.data && html`<${F} l="Assign to"><select ...${bind('owner_id')}><option value="">Auto (round-robin)</option>${users.data.filter(u => u.role === 'sales' && u.active).map(u => html`<option value=${u.id}>${u.name}</option>`)}</select></${F}>`}</div><//>`;
}
export function Leads({ user }) {
  const [cat, setCat] = useState(''); const [q, setQ] = useState(''); const [view, setView] = useState('board'); const [src, setSrc] = useState(''); const [own, setOwn] = useState('');
  const [newOpen, setNew] = useState(qparam('new') === '1');
  const L = useApi(`leads?category=${cat}&source=${src}&owner=${own}&q=${encodeURIComponent(q)}`, []);
  const users = useApi(user.role === 'owner' ? 'users' : null);
  const drop = async (id, stage) => {
    let lost_reason; if (stage === 'lost') { lost_reason = prompt('Lost reason: ' + LOST.join(' / '), 'Price high'); if (lost_reason == null) return; }
    if (stage === 'won') { toast('Convert a quotation to order to mark Won', 'warn'); }
    await run(() => patch('leads/' + id, { stage, lost_reason })); L.reload();
  };
  return html`<div><div class="ph"><h1>Leads & pipeline</h1><div class="row gap"><${Tabs} tabs=${[['board', 'Board'], ['list', 'List']]} cur=${view} onChange=${setView}/><${Btn} icon="plus" onClick=${() => setNew(true)}>Add lead</${Btn}></div></div>
  <${Load} q=${L}>${(d) => { const counts = Object.fromEntries(d.cats.map(c => [c.category, c.c])); const all = d.cats.reduce((a, c) => a + c.c, 0);
    return html`<div class="filterbar"><div class="tabs">
      <button class=${!cat ? 'on' : ''} onClick=${() => setCat('')}>All ${all}</button>${Object.entries(CATS).map(([k, l]) => html`<button class=${cat === k ? 'on' : ''} onClick=${() => setCat(k)}>${l} ${counts[k] || 0}</button>`)}</div>
      <${Search} value=${q} onInput=${setQ} ph="Name, phone, need"/>
      <select class="sel" value=${src} onChange=${(e) => setSrc(e.target.value)}><option value="">All sources</option>${Object.entries(SOURCES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
      ${users.data && html`<select class="sel" value=${own} onChange=${(e) => setOwn(e.target.value)}><option value="">All salespeople</option>${users.data.filter(u => u.role === 'sales').map(u => html`<option value=${u.id}>${u.name}</option>`)}</select>`}</div>
    ${view === 'board' ? html`<div class="board">${STAGES.map(([s, l]) => { const items = d.rows.filter(r => r.stage === s); return html`<div class="col" onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => drop(e.dataTransfer.getData('id'), s)}>
      <div class="colh"><b>${l}</b><span>${items.length}</span></div>
      ${items.map(r => html`<a class="lcard" href=${'#/leads/' + r.id} draggable="true" onDragStart=${(e) => e.dataTransfer.setData('id', r.id)}>
        <b>${r.name}</b><small>${r.need || ''}${r.source ? ' · ' + (SOURCES[r.source] || r.source) : ''}</small>
        <div class="lc-f"><span class=${'src s-' + r.source}>${{ whatsapp: 'WA', website: 'Web', call: 'Call', indiamart: 'IM', instagram: 'IG', facebook: 'FB' }[r.source] || (SOURCES[r.source] || '').slice(0, 5)}</span>${r.priority === 'hot' && html`<span title="Hot">🔥</span>`}<b>${inr(r.value, 1)}</b></div>
        ${user.role === 'owner' && r.owner_name && html`<small class="own">${r.owner_name}</small>`}</a>`)}</div>`; })}</div>`
      : html`<div class="card"><table class="tbl"><thead><tr><th>Lead</th><th>Need</th><th>Source</th><th>Owner</th><th>Stage</th><th>Value</th><th>Next follow-up</th><th>Created</th></tr></thead><tbody>
        ${d.rows.map(r => html`<tr onClick=${() => go('/leads/' + r.id)} class="click"><td><b>${r.name}</b><small>${r.phone || ''}</small></td><td>${r.need}</td><td>${SOURCES[r.source]}</td><td>${r.owner_name || '—'}</td><td><${Badge} s=${r.stage}/></td><td>${inr(r.value)}</td><td>${r.next_fu ? dt(r.next_fu, 1) : '—'}</td><td>${ago(r.created_at)}</td></tr>`)}</tbody></table></div>`}`; }}<//>
  ${newOpen && html`<${NewLead} onClose=${() => { setNew(false); history.replaceState(null, '', '#/leads'); }} onSaved=${(l) => { setNew(false); go('/leads/' + l.id); }}/>`}</div>`;
}

export function LeadDetail({ id, user, mobile }) {
  const q = useApi('leads/' + id, [id]);
  const users = useApi(user.role === 'owner' ? 'users' : null);
  const [fu, bindFu, setFu] = useForm({ due_at: localInput(new Date(Date.now() + 864e5)), type: 'call', note: '', auto_nudge: true });
  const [note, setNote] = useState(''); const [edit, setEdit] = useState(false);
  const act = async (type, body, extra) => { await run(() => api(`leads/${id}/activity`, { body: { type, body, close_followups: true, ...extra } })); q.reload(); };
  return html`<${Load} q=${q}>${(d) => { const L = d.lead; const tel = 'tel:+' + String(L.phone || '').replace(/\D/g, '');
    return html`<div>
    ${!mobile && html`<div class="ph"><h1><a href="#/leads" class="back"><${Ic} n="back"/></a> Lead · ${L.name}${L.company ? ' (' + L.company + ')' : ''}</h1><div class="row gap">
      <a class="btn b-pri" href=${'#/quotations/new?lead=' + L.id}><${Ic} n="doc" s=${16}/> Quotation</a>${L.customer_id && html`<a class="btn b-ghost" href=${'#/customers/' + L.customer_id}>Customer history</a>`}</div></div>`}
    <div class=${mobile ? '' : 'g2c wide-l'}>
      <div class="col-stack">
        <div class="card pad">
          ${edit ? html`<${EditLead} L=${L} onDone=${() => { setEdit(false); q.reload(); }}/>` : html`
          <div class="info2"><div><small>Mobile</small><b><a href=${tel}>${L.phone ? '+' + L.phone : '—'}</a></b></div><div><small>City</small><b>${L.city || '—'}</b></div>
          <div><small>Need</small><b>${L.need || '—'}</b></div><div><small>Budget</small><b>${L.budget || '—'}</b></div>
          <div><small>Source</small><b>${SOURCES[L.source]}${L.source_detail ? ' · ' + L.source_detail : ''}</b></div>
          <div><small>Owner</small>${users.data ? html`<select class="sel" value=${L.owner_id || ''} onChange=${async (e) => { await run(() => patch('leads/' + id, { owner_id: e.target.value }), 'Lead transferred'); q.reload(); }}><option value="">—</option>${users.data.filter(u => u.role !== 'tech').map(u => html`<option value=${u.id}>${u.name}</option>`)}</select>` : html`<b>${d.owner ? d.owner.name : '—'}</b>`}</div>
          <div><small>Stage</small><select class="sel" value=${L.stage} onChange=${async (e) => { const s = e.target.value; let lr; if (s === 'lost') { lr = prompt('Lost reason', LOST[0]); if (lr == null) return; } await run(() => patch('leads/' + id, { stage: s, lost_reason: lr })); q.reload(); }}>${STAGES.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></div>
          <div><small>Lead score</small><b><${Badge} s=${L.priority}>${L.priority === 'hot' ? 'Hot 🔥' : L.priority === 'warm' ? 'Warm' : 'Cold'}<//> ${L.score}</b></div>
          <div><small>Value</small><b>${inr(L.value)}</b></div>${L.utm && (L.utm.utm_source || L.utm.gclid || L.utm.fbclid) && html`<div><small>Campaign</small><b>${[L.utm.utm_source, L.utm.utm_medium, L.utm.utm_campaign].filter(Boolean).join(' / ') || (L.utm.gclid ? 'Google Ads click' : 'Facebook ad click')}</b></div>`}${L.page_url && html`<div><small>Enquiry page</small><b class="clip1"><a class="t-blue" target="_blank" href=${L.page_url}>${L.page_url.replace(/^https?:\/\/[^/]+/, '') || '/'}</a></b></div>`}${L.quantity && html`<div><small>Quantity</small><b>${L.quantity}</b></div>`}</div>
          <div class="row gap mt"><a class="btn b-ghost" href=${tel} onClick=${() => act('call', 'Called customer')}><${Ic} n="phone" s=${16}/> Call</a>
            <a class="btn b-wa" href=${waLink(L.phone, `Namaste ${L.name} ji, ${auth.user.name} from IT Paradise.`)} target="_blank" onClick=${() => act('whatsapp', 'WhatsApp opened')}><${Ic} n="wa" s=${16}/> WhatsApp</a>
            <${Btn} kind="navy" icon="pin" onClick=${() => act('visit', 'Site visit done')}>Visit</${Btn}><${Btn} kind="ghost" sm icon="edit" onClick=${() => setEdit(true)}>Edit</${Btn}></div>`}
        </div>
        <div class="card pad"><h3>Schedule follow-up</h3>
          <div class="form2"><${F} l="When"><input type="datetime-local" ...${bindFu('due_at')}/></${F}><${F} l="Type"><select ...${bindFu('type')}><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="visit">Visit</option><option value="demo">Demo</option></select></${F}>
          <${F} l="Note" full><input ...${bindFu('note')} placeholder="Confirm brand & installation date"/></${F}></div>
          <label class="chk"><input type="checkbox" ...${bindFu('auto_nudge', 'check')}/> Auto WhatsApp reminder to customer if no reply in 24 h</label>
          <${Btn} onClick=${async () => { await run(() => api(`leads/${id}/followups`, { body: { ...fu, due_at: new Date(fu.due_at).toISOString() } }), 'Follow-up scheduled'); setFu(f => ({ ...f, note: '' })); q.reload(); }}>Save</${Btn}>
          ${d.followups.filter(f => !f.done).map(f => html`<div class="lrow"><div><b>${dt(f.due_at, 1)} · ${f.type}</b><small>${f.note || ''}</small></div><${Btn} sm kind="ghost" icon="check" onClick=${async () => { await run(() => patch('followups/' + f.id, { done: true })); q.reload(); }}>Done</${Btn}></div>`)}
        </div>
        ${d.quotations.length > 0 && html`<div class="card pad"><h3>Quotations</h3>${d.quotations.map(x => html`<a class="lrow" href=${'#/quotations/' + x.id}><div><b>${x.number}</b><small>${dt(x.created_at)} · opened ${x.opened_count}×</small></div><div class="r"><b>${inr(x.total)}</b><${Badge} s=${x.status}/></div></a>`)}</div>`}
      </div>
      <div class="col-stack">
        <div class="card pad"><h3>Timeline</h3>
          <div class="row gap"><input class="grow" placeholder="Add a note…" value=${note} onInput=${(e) => setNote(e.target.value)}/><${Btn} sm onClick=${async () => { if (note) { await act('note', note); setNote(''); } }}>Add</${Btn}></div>
          <ul class="timeline">${d.activities.map(a => html`<li class=${'tl-' + a.type}><b>${a.body}</b><small>${dt(a.created_at, 1)}${a.uname ? ' · ' + a.uname : ''}</small></li>`)}</ul></div>
        ${L.stage !== 'won' && L.stage !== 'lost' && html`<div class="card pad"><h3>Lost reason (if lost)</h3><div class="chips">${LOST.map(r => html`<button class="chip" onClick=${async () => { if (confirm('Mark lead as lost: ' + r + '?')) { await run(() => patch('leads/' + id, { stage: 'lost', lost_reason: r })); q.reload(); } }}>${r}</button>`)}</div></div>`}
        ${d.messages.length > 0 && !mobile && html`<div class="card pad"><h3>WhatsApp</h3><div class="msgs mini">${d.messages.slice(-6).map(m => html`<div class=${'msg ' + m.direction}>${m.body}<small>${tm(m.created_at)}</small></div>`)}</div><a href=${'#/inbox/' + (L.phone || '')} class="btn b-ghost sm">Open chat</a></div>`}
      </div>
    </div></div>`; }}<//>`;
}
function EditLead({ L, onDone }) {
  const [v, bind] = useForm({ name: L.name, company: L.company, phone: L.phone, email: L.email, city: L.city, need: L.need, budget: L.budget, quantity: L.quantity, value: L.value, priority: L.priority, category: L.category });
  return html`<div class="form2"><${F} l="Name"><input ...${bind('name')}/></${F}><${F} l="Company"><input ...${bind('company')}/></${F}><${F} l="Mobile"><input ...${bind('phone')}/></${F}><${F} l="Email"><input ...${bind('email')}/></${F}>
    <${F} l="City"><input ...${bind('city')}/></${F}><${F} l="Budget"><input ...${bind('budget')}/></${F}><${F} l="Need" full><input ...${bind('need')}/></${F}><${F} l="Quantity"><input ...${bind('quantity')}/></${F}><${F} l="Value ₹"><input type="number" ...${bind('value')}/></${F}>
    <${F} l="Priority"><select ...${bind('priority')}><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></select></${F}>
    <${F} l="Category"><select ...${bind('category')}><option value="">—</option>${Object.entries(CATS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></${F}></div>
    <div class="row gap mt"><${Btn} kind="ghost" onClick=${onDone}>Cancel</${Btn}><${Btn} onClick=${async () => { await run(() => patch('leads/' + L.id, v), 'Saved'); onDone(); }}>Save</${Btn}></div>`;
}

// ================= Follow-ups =================
export function Followups({ user }) {
  const q = useApi('followups');
  const [tab, setTab] = useState('today');
  const now = new Date(); const eod = new Date(); eod.setHours(23, 59, 59);
  return html`<div><div class="ph"><h1>Follow-ups</h1><${Tabs} tabs=${[['overdue', 'Overdue'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All']]} cur=${tab} onChange=${setTab}/></div>
  <${Load} q=${q}>${(rows) => { const f = rows.filter(r => { const d = new Date(r.due_at); return tab === 'all' || (tab === 'overdue' ? d < now : tab === 'today' ? d >= now && d <= eod || (d < now && false) : d > eod); });
    return html`<div class="card"><table class="tbl"><thead><tr><th>Due</th><th>Lead</th><th>Need</th><th>Type</th><th>Note</th>${user.role === 'owner' && html`<th>Salesperson</th>`}<th></th></tr></thead><tbody>
    ${f.length ? f.map(r => html`<tr><td class=${new Date(r.due_at) < now ? 't-red' : ''}><b>${dt(r.due_at, 1)}</b></td><td><a href=${'#/leads/' + r.lead_id}><b>${r.name}</b></a><small>${r.phone ? '+' + r.phone : ''}</small></td><td>${r.need}</td><td>${r.type}</td><td>${r.note}</td>${user.role === 'owner' && html`<td>${r.uname}</td>`}
      <td class="nowrap"><a class="btn b-ghost sm" href=${'tel:+' + r.phone}><${Ic} n="phone" s=${14}/></a> <a class="btn b-wa sm" target="_blank" href=${waLink(r.phone)}><${Ic} n="wa" s=${14}/></a> <${Btn} sm kind="ghost" icon="check" onClick=${async () => { const o = prompt('Outcome (optional)', ''); if (o === null) return; await run(() => patch('followups/' + r.id, { done: true, outcome: o })); q.reload(); }}>Done</${Btn}></td></tr>`) : html`<tr><td colspan="7"><${Empty}>Nothing here 🎉<//></td></tr>`}</tbody></table></div>`; }}<//></div>`;
}

// ================= Customers =================
export function Customers() {
  const [s, setS] = useState(''); const q = useApi('customers?q=' + encodeURIComponent(s));
  const [add, setAdd] = useState(false); const [v, bind] = useForm({});
  return html`<div><div class="ph"><h1>Customers</h1><div class="row gap"><${Search} value=${s} onInput=${setS} ph="Name, phone, company"/><${Btn} icon="plus" onClick=${() => setAdd(true)}>Add customer</${Btn}></div></div>
  <${Load} q=${q}>${(rows) => html`<div class="card"><table class="tbl"><thead><tr><th>Customer</th><th>Phone</th><th>City</th><th>Type</th><th>Business</th><th>Outstanding</th></tr></thead><tbody>
    ${rows.map(c => html`<tr class="click" onClick=${() => go('/customers/' + c.id)}><td><b>${c.name}</b><small>${c.company || ''}</small></td><td>${c.phone ? '+' + c.phone : ''}</td><td>${c.city}</td><td>${c.type}</td><td>${inr(c.business)}</td><td class=${+c.due > 0 ? 't-red' : ''}>${inr(c.due)}</td></tr>`)}</tbody></table></div>`}<//>
  ${add && html`<${Modal} title="Add customer" onClose=${() => setAdd(false)} foot=${html`<${Btn} onClick=${async () => { await run(() => api('customers', { body: v }), 'Customer added'); setAdd(false); q.reload(); }}>Save</${Btn}>`}>
    <div class="form2"><${F} l="Name"><input ...${bind('name')}/></${F}><${F} l="Company"><input ...${bind('company')}/></${F}><${F} l="Mobile"><input ...${bind('phone')}/></${F}><${F} l="Email"><input ...${bind('email')}/></${F}><${F} l="City"><input ...${bind('city')}/></${F}><${F} l="GSTIN"><input ...${bind('gstin')}/></${F}>
    <${F} l="Address" full><input ...${bind('address')}/></${F}><${F} l="Type"><select ...${bind('type')}><option value="retail">Retail</option><option value="corporate">Corporate</option><option value="school">School</option><option value="factory">Factory</option><option value="hospital">Hospital</option><option value="government">Government</option></select></${F}></div><//>`}</div>`;
}
export function CustomerDetail({ id }) {
  const q = useApi('customers/' + id, [id]); const [tab, setTab] = useState('history'); const [edit, setEdit] = useState(false);
  return html`<${Load} q=${q}>${(d) => { const c = d.customer; return html`<div>
    <div class="ph"><h1><a href="#/customers" class="back"><${Ic} n="back"/></a> ${c.name}${c.company ? ' · ' + c.company : ''}</h1><div class="row gap"><a class="btn b-pri" href=${'#/quotations/new?customer=' + c.id}>New quotation</a><${Btn} kind="ghost" onClick=${() => setEdit(true)}>Edit</${Btn}></div></div>
    <div class="kpis sm"><${Kpi} l="Mobile" v=${c.phone ? '+' + c.phone : '—'}/><${Kpi} l="City" v=${c.city || '—'}/><${Kpi} l="GSTIN" v=${c.gstin || '—'}/><${Kpi} l="Orders" v=${d.orders.length}/><${Kpi} l="Business" v=${inr(d.orders.reduce((a, o) => a + +o.total, 0), 1)}/><${Kpi} l="Outstanding" v=${inr(d.invoices.reduce((a, i) => a + (i.total - i.paid), 0))} tone="red"/></div>
    <${Tabs} tabs=${[['history', 'History'], ['sites', 'Sites / locations'], ['ledger', 'Ledger'], ['assets', 'Equipment & warranty'], ['service', 'Service & AMC']]} cur=${tab} onChange=${setTab}/>
    <div class="card pad mt">${tab === 'history' ? html`<div class="g3c">
        <div><h4>Leads</h4>${d.leads.map(l => html`<a class="lrow" href=${'#/leads/' + l.id}><div><b>${l.need || l.name}</b><small>${dt(l.created_at)} · ${SOURCES[l.source]} · ${l.owner || ''}</small></div><${Badge} s=${l.stage}/></a>`)}</div>
        <div><h4>Quotations</h4>${d.quotes.map(x => html`<a class="lrow" href=${'#/quotations/' + x.id}><div><b>${x.number}</b><small>${dt(x.created_at)}</small></div><div class="r"><b>${inr(x.total)}</b><${Badge} s=${x.status}/></div></a>`)}</div>
        <div><h4>Orders</h4>${d.orders.map(x => html`<a class="lrow" href=${'#/orders/' + x.id}><div><b>${x.number}</b><small>${dt(x.created_at)}</small></div><div class="r"><b>${inr(x.total)}</b><${Badge} s=${x.status}/></div></a>`)}</div></div>`
      : tab === 'sites' ? html`<${Sites} cid=${c.id}/>`
      : tab === 'ledger' ? html`<table class="tbl"><thead><tr><th>Date</th><th>Ref</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${d.ledger.map(l => html`<tr><td>${dt(l.date)}</td><td>${l.ref}${l.mode ? ' · ' + l.mode : ''}</td><td>${l.debit ? inr(l.debit) : ''}</td><td>${l.credit ? inr(l.credit) : ''}</td><td><b>${inr(l.balance)}</b></td></tr>`)}</tbody></table>`
      : tab === 'assets' ? html`<table class="tbl"><thead><tr><th>Serial</th><th>Product</th><th>Warranty till</th></tr></thead><tbody>${d.serials.map(s => html`<tr><td><a href=${'#/serial/' + encodeURIComponent(s.serial)}>${s.serial}</a></td><td>${s.name}</td><td class=${new Date(s.warranty_until) < new Date() ? 't-red' : 't-green'}>${dt(s.warranty_until)}</td></tr>`)}</tbody></table>`
      : html`<div class="g2c"><div><h4>Jobs</h4>${d.jobs.map(j => html`<a class="lrow" href=${'#/jobs/' + j.id}><div><b>${j.number} · ${j.title || j.issue}</b><small>${dt(j.created_at)} · ${j.kind}</small></div><${Badge} s=${j.status}/></a>`)}</div><div><h4>AMC</h4>${d.amcs.map(a => html`<div class="lrow"><div><b>${a.title}</b><small>${dt(a.start_date)} → ${dt(a.end_date)}</small></div><${Badge} s=${a.status}/></div>`)}</div></div>`}</div>
    ${edit && html`<${EditCustomer} c=${c} onClose=${() => { setEdit(false); q.reload(); }}/>`}</div>`; }}<//>`;
}
function EditCustomer({ c, onClose }) {
  const [v, bind] = useForm(c);
  return html`<${Modal} title="Edit customer" onClose=${onClose} foot=${html`<${Btn} onClick=${async () => { await run(() => patch('customers/' + c.id, v), 'Saved'); onClose(); }}>Save</${Btn}>`}>
  <div class="form2">${['name', 'company', 'phone', 'email', 'city', 'gstin'].map(k => html`<${F} l=${k}><input ...${bind(k)}/></${F}>`)}<${F} l="Address" full><input ...${bind('address')}/></${F}></div><//>`;
}

function Sites({ cid }) {
  const q = useApi(`customers/${cid}/sites`, [cid]); const [v, bind, setV] = useForm({});
  return html`<div><${Load} q=${q}>${(rows) => rows.length ? html`<table class="tbl"><thead><tr><th>Site</th><th>Address</th><th>Contact</th><th></th></tr></thead><tbody>${rows.map(s => html`<tr><td><b>${s.name}</b><small>${s.city || ''}</small></td><td>${s.address}</td><td>${s.contact || ''}<small>${s.phone ? '+' + s.phone : ''}</small></td><td><a class="t-blue small" target="_blank" href=${'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((s.address || '') + ' ' + (s.city || ''))}>Map</a> <button class="icbtn" onClick=${async () => { if (confirm('Remove site?')) { await run(() => api(`customers/${cid}/sites/${s.id}`, { method: 'DELETE' })); q.reload(); } }}><${Ic} n="x" s=${14}/></button></td></tr>`)}</tbody></table>` : html`<p class="muted">No additional sites. Add branches, factory units, school campuses etc.</p>`}<//>
    <h4>Add site / location</h4><div class="form2"><${F} l="Site name"><input ...${bind('name')} placeholder="Unit 2 / Branch / Campus"/></${F}><${F} l="City"><input ...${bind('city')}/></${F}><${F} l="Address" full><input ...${bind('address')}/></${F}><${F} l="Contact person"><input ...${bind('contact')}/></${F}><${F} l="Contact mobile"><input ...${bind('phone')}/></${F}></div>
    <${Btn} sm onClick=${async () => { if (!v.name) return toast('Site name required', 'err'); await run(() => api(`customers/${cid}/sites`, { body: v }), 'Site added'); setV({}); q.reload(); }}>Add site</${Btn}></div>`;
}
