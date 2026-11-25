// Staff mobile app (Android APK wraps this): role-based dashboards for Owner, Sales, Technician
import { html, useState, useEffect, api, patch, useApi, Load, Ic, Badge, Kpi, inr, dt, tm, ago, initials, go, toast, run, Btn, Search, Empty, waLink, auth, Scanner, STAGES, SOURCES } from './ui.js';
import * as S from './p-sales.js';
import * as Q from './p-quote.js';
import * as O from './p-ops.js';
import { Account } from './p-admin.js';

const TABS = {
  sales: [['/', 'Today', 'home'], ['/leads', 'Leads', 'funnel'], ['/inbox', 'Inbox', 'chat'], ['/quote/new', 'Quote', 'doc'], ['/me', 'Me', 'user']],
  tech: [['/', 'Jobs', 'tool'], ['/scan', 'Scan', 'scan'], ['/me', 'Me', 'user']],
  owner: [['/', 'Home', 'home'], ['/leads', 'Leads', 'funnel'], ['/service', 'Service', 'tool'], ['/more', 'More', 'list']],
};

function Header({ user, onLogout }) {
  const [n, setN] = useState(0);
  useEffect(() => { const f = () => api('notifications').then(d => setN(d.unread)).catch(() => { }); f(); const t = setInterval(f, 30000); return () => clearInterval(t); }, []);
  return html`<header class="mtop"><a href="#/" class="mbrand"><img src="/static/img/logo.svg" width="30"/><div><b>IT PARADISE</b><small>TECHNOLOGY. INTEGRATED.</small></div></a>
    <a class="icbtn bell" href="#/notifications" onClick=${() => setN(0)}><${Ic} n="bell"/>${n > 0 && html`<i>${n}</i>`}</a></header>`;
}

function Attendance() {
  const [a, setA] = useState(auth.me && auth.me.attendance);
  const act = async (k) => {
    let location = null;
    try { location = await new Promise((ok) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => ok(p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5)), () => ok(null), { timeout: 5000 }) : ok(null)); } catch (e) { }
    setA(await run(() => api('attendance/' + k, { body: { location } }), k === 'in' ? 'Checked in ✓' : 'Checked out'));
  };
  return html`<div class="att card">${a && a.check_in ? html`<span><${Ic} n="check" s=${16}/> In ${tm(a.check_in)}${a.check_out ? ' · Out ' + tm(a.check_out) : ''}</span>${!a.check_out && html`<${Btn} sm kind="ghost" onClick=${() => act('out')}>Check out</${Btn}>`}`
    : html`<span class="muted">Not checked in</span><${Btn} sm kind="green" onClick=${() => act('in')}>Check in</${Btn}>`}</div>`;
}

// ---------- Sales ----------
function SalesToday({ user }) {
  const d = useApi('dashboard'); const f = useApi('followups');
  return html`<div><${Attendance}/>
    <${Load} q=${d}>${(x) => html`<div class="mk3"><a href="#/followups" class="mk"><b>${x.k.fu_due}</b><small>Follow-ups</small></a><a href="#/leads" class="mk"><b>${x.k.leads_today}</b><small>New leads</small></a><a href="#/quotes" class="mk"><b>${inr(x.k.quotes_value, 1)}</b><small>Quoted</small></a></div>`}<//>
    <h3 class="msec">Follow-ups</h3>
    <${Load} q=${f}>${(rows) => rows.length ? rows.slice(0, 30).map(r => html`<a class="mrow card" href=${'#/leads/' + r.lead_id}><span class=${'mic ' + (new Date(r.due_at) < new Date() ? 't-red' : '')}><${Ic} n=${r.type === 'visit' ? 'pin' : r.type === 'whatsapp' ? 'wa' : 'phone'} s=${18}/></span><div><b>${r.name}</b><small>${r.need || r.note || ''}</small><small class=${new Date(r.due_at) < new Date() ? 't-red' : 'muted'}>${dt(r.due_at, 1)}</small></div><${Ic} n="right" s=${16}/></a>`) : html`<${Empty}>No pending follow-ups 🎉<//>`}<//></div>`;
}
function MLeads({ user }) {
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const L = useApi(`leads?q=${encodeURIComponent(q)}&stage=${st}`); const [nw, setNw] = useState(false);
  return html`<div><div class="row gap"><${Search} value=${q} onInput=${setQ} ph="Search leads"/><${Btn} icon="plus" onClick=${() => setNw(true)}/></div>
    <div class="hscroll">${[['', 'All'], ...STAGES].map(([k, l]) => html`<button class=${'chip' + (st === k ? ' on' : '')} onClick=${() => setSt(k)}>${l}</button>`)}</div>
    <${Load} q=${L}>${(d) => d.rows.length ? d.rows.map(r => html`<a class="mrow card" href=${'#/leads/' + r.id}><span class="av">${initials(r.name)}</span><div><b>${r.name}${r.priority === 'hot' ? ' 🔥' : ''}</b><small>${r.need || ''}</small><small class="muted">${SOURCES[r.source]} · ${inr(r.value, 1)}${user.role === 'owner' && r.owner_name ? ' · ' + r.owner_name : ''}</small></div><${Badge} s=${r.stage}/></a>`) : html`<${Empty}/>`}<//>
    ${nw && html`<${S.NewLead} onClose=${() => setNw(false)} onSaved=${(l) => { setNw(false); go('/leads/' + l.id); }}/>`}</div>`;
}
function LeadCard({ id, user }) {
  const q = useApi('leads/' + id, [id]);
  const wonFlow = async (d) => {
    const qt = d.quotations.find(x => !['converted', 'rejected'].includes(x.status));
    if (!qt) { toast('Create a quotation first', 'warn'); return go('/quote/new?lead=' + id); }
    if (!confirm(`Mark won and convert ${qt.number} (${inr(qt.total)}) to order?`)) return;
    const o = await run(() => api(`quotations/${qt.id}/convert`, { body: {} }), 'Order created — advance link sent'); go('/order/' + o.id);
  };
  return html`<${Load} q=${q}>${(d) => { const L = d.lead; const qt = d.quotations[0]; const nf = d.followups.find(f => !f.done);
    return html`<div><div class="lcardm card"><div class="row gap"><${Badge} s=${L.stage}/>${L.priority === 'hot' && html`<${Badge} s="hot">Hot 🔥<//>`}</div>
      <h2>${L.need || L.name}</h2><p class="muted">${L.name}${L.company ? ' · ' + L.company : ''}${L.city ? ' · ' + L.city : ''} · ${inr(L.value)}</p>
      <div class="b3"><a class="btn b-ghost" href=${'tel:+' + L.phone} onClick=${() => api(`leads/${id}/activity`, { body: { type: 'call', body: 'Called from app', close_followups: true } })}><${Ic} n="phone" s=${16}/> Call</a>
        <a class="btn b-wa" target="_blank" href=${waLink(L.phone, `Namaste ${L.name} ji, ${user.name} from IT Paradise.`)} onClick=${() => api(`leads/${id}/activity`, { body: { type: 'whatsapp', body: 'WhatsApp from app' } })}><${Ic} n="wa" s=${16}/> WA</a>
        <button class="btn b-navy" onClick=${async () => { await run(() => api(`leads/${id}/activity`, { body: { type: 'visit', body: 'Site visit (app)', close_followups: true } }), 'Visit logged'); q.reload(); }}><${Ic} n="pin" s=${16}/> Visit</button></div>
      ${qt && html`<a class="mrow" href=${'#/quote/' + qt.id}><span class="mic"><${Ic} n="doc" s=${18}/></span><div><b>${qt.number} ${qt.opened_count ? 'opened ' + qt.opened_count + '×' : ''}</b><small>${inr(qt.total)} · ${dt(qt.created_at)}</small></div></a>`}
      ${nf && html`<div class="mrow"><span class="mic"><${Ic} n="cal" s=${18}/></span><div><b>Next: ${dt(nf.due_at, 1)}</b><small>${nf.note || nf.type}</small></div></div>`}
      ${!['won', 'lost'].includes(L.stage) && html`<div class="b2"><a class="btn b-ghost" href=${'#/quote/new?lead=' + id}><${Ic} n="plus" s=${16}/> Quick quote</a><${Btn} onClick=${() => wonFlow(d)} icon="check">Mark won → create order</${Btn}></div>`}</div>
      <${S.LeadDetail} id=${id} user=${user} mobile/></div>`; }}<//>`;
}
function MQuotes({ user }) { const q = useApi('quotations'); return html`<div><a class="btn b-pri btn-block" href="#/quote/new">+ New quotation</a><${Load} q=${q}>${(rows) => rows.map(r => html`<a class="mrow card" href=${'#/quote/' + r.id}><div><b>${r.number}</b><small>${r.cname} · ${dt(r.created_at)}</small></div><div class="r"><b>${inr(r.total)}</b><${Badge} s=${r.status}/></div></a>`)}<//></div>`; }

// ---------- Technician ----------
function TechJobs({ user }) {
  const d = useApi('dashboard');
  return html`<div><${Attendance}/><${Load} q=${d}>${(x) => { const open = x.jobs.filter(j => j.status !== 'completed'); const done = x.jobs.filter(j => j.status === 'completed');
    return html`<div class="mk3"><div class="mk"><b>${open.length}</b><small>Open jobs</small></div><div class="mk"><b>${x.completed_month}</b><small>Done (month)</small></div><div class="mk"><b>${inr(x.collected_month, 1)}</b><small>Collected</small></div></div>
    <h3 class="msec">Assigned jobs</h3>${open.length ? open.map(j => html`<a class="mrow card" href=${'#/jobs/' + j.id}><span class="mic"><${Ic} n=${j.kind === 'installation' ? 'box' : 'tool'} s=${18}/></span><div><b>${j.title || j.issue}</b><small>${j.number} · ${j.cname || ''}</small><small class="muted">${j.address || ''}${j.scheduled_at ? ' · ' + dt(j.scheduled_at, 1) : ''}</small></div><${Badge} s=${j.status}/></a>`) : html`<${Empty}>No open jobs 🎉<//>`}
    ${done.length > 0 && html`<h3 class="msec">Completed</h3>${done.map(j => html`<a class="mrow card dim" href=${'#/jobs/' + j.id}><div><b>${j.title || j.issue}</b><small>${j.number}</small></div><${Badge} s=${j.status}/></a>`)}`}`; }}<//></div>`;
}
function ScanPage() {
  const [scan, setScan] = useState(false); const [s, setS] = useState(''); const [r, setR] = useState(null);
  const look = async (v) => { try { setR(await api('serials/' + encodeURIComponent(v || s))); } catch (e) { setR({ error: e.message }); } };
  return html`<div><h3 class="msec">Serial / warranty lookup</h3><div class="card pad"><${Btn} icon="scan" onClick=${() => setScan(true)}>Scan barcode / QR</${Btn}><div class="row gap mt"><input class="grow" placeholder="or type serial" value=${s} onInput=${(e) => setS(e.target.value)}/><${Btn} kind="ghost" onClick=${() => look()}>Find</${Btn}></div></div>
    ${r && html`<div class="card pad mt">${r.error ? html`<p class="t-red">${r.error}</p>` : html`<${O.SerialCard} s=${r}/>`}</div>`}
    ${scan && html`<${Scanner} onClose=${() => setScan(false)} onResult=${(v) => { setScan(false); setS(v); look(v); }}/>`}</div>`;
}

// ---------- Owner ----------
function OwnerHome({ user }) {
  const d = useApi('dashboard'); const pq = useApi('quotations');
  return html`<div><${Load} q=${d}>${(x) => { const k = x.k; return html`
    <div class="mk3"><a href="#/leads" class="mk"><b>${k.leads_today}</b><small>Leads today</small></a><a href="#/followups" class="mk"><b>${k.fu_overdue}</b><small>Overdue follow-ups</small></a><a href="#/orders" class="mk"><b>${inr(k.sales_month, 1)}</b><small>Sales (month)</small></a></div>
    <div class="mk3"><a href="#/payments" class="mk"><b>${inr(k.dues, 1)}</b><small>Outstanding</small></a><a href="#/stock" class="mk"><b>${k.low_stock}</b><small>Low stock</small></a><a href="#/service" class="mk"><b>${k.pending_installs + k.pending_tickets}</b><small>Open jobs</small></a></div>
    <div class="mk3"><div class="mk"><b>${inr(k.collected_month, 1)}</b><small>Collected</small></div><div class="mk"><b>${k.amc_expiring}</b><small>AMC expiring</small></div><div class="mk"><b>${inr(k.stock_value, 1)}</b><small>Stock value</small></div></div>`; }}<//>
    <${Load} q=${pq}>${(rows) => { const p = rows.filter(r => r.status === 'pending_approval'); return p.length > 0 && html`<h3 class="msec">Quotations to approve</h3>${p.map(r => html`<a class="mrow card" href=${'#/quote/' + r.id}><div><b>${r.number} · ${r.cname}</b><small>${r.uname} · margin ${Math.round(r.margin / ((r.subtotal - r.discount) || 1) * 100)}%</small></div><b>${inr(r.total)}</b></a>`)}`; }}<//>
    <${Load} q=${d}>${(x) => html`<h3 class="msec">Team today</h3>${x.team.map(t => html`<div class="mrow card"><span class="av">${initials(t.name)}</span><div><b>${t.name}</b><small>${t.role === 'sales' ? `${t.calls} calls · ${t.quotes} quotes · ${t.chats} WA` : `${t.installs} installs · ${t.services} service`}</small></div>${t.check_in ? html`<${Badge} s="ok">In ${tm(t.check_in)}<//>` : html`<${Badge} s="cancelled">—<//>`}</div>`)}
      <h3 class="msec">Leads by source</h3><div class="card pad">${x.sources.map(s => html`<div class="lrow"><span>${SOURCES[s.source]}</span><b>${s.c}</b></div>`)}</div>`}<//></div>`;
}
function More({ user }) {
  const L = [['/orders', 'Orders & invoices', 'cart'], ['/payments', 'Payments & dues', 'rupee'], ['/quotes', 'Quotations', 'doc'], ['/followups', 'Follow-ups', 'phone'], ['/inbox', 'WhatsApp inbox', 'chat'], ['/stock', 'Stock & purchase', 'box'], ['/team', 'Team & targets', 'users'], ['/customers', 'Customers', 'user'], ['/me', 'My account', 'gear']];
  return html`<div>${L.map(([p, l, i]) => html`<a class="mrow card" href=${'#' + p}><span class="mic"><${Ic} n=${i} s=${18}/></span><div><b>${l}</b></div><${Ic} n="right" s=${16}/></a>`)}
    <a class="mrow card" href="/crm"><span class="mic"><${Ic} n="ext" s=${18}/></span><div><b>Open full CRM & admin panel</b><small>Reports, automations, website admin, settings</small></div></a></div>`;
}
function Me({ user, onLogout }) {
  const t = useApi('tasks');
  return html`<div><div class="card pad center"><span class="av big">${initials(user.name)}</span><h2>${user.name}</h2><p class="muted">${{ owner: 'Owner / Admin', sales: 'Sales executive', tech: 'Technician' }[user.role]} · ${user.email}</p></div>
    <${Attendance}/><h3 class="msec">My tasks</h3><${Load} q=${t}>${(rows) => rows.length ? rows.map(x => html`<label class=${'chk task card' + (x.done ? ' done' : '')}><input type="checkbox" checked=${x.done} onChange=${async (e) => { await patch('tasks/' + x.id, { done: e.target.checked }); t.reload(); }}/><span>${x.title}</span><small>${dt(x.due)}</small></label>`) : html`<${Empty}>No tasks<//>`}<//>
    <h3 class="msec">Security</h3><${Account}/><div class="mt"><${Btn} kind="ghost" icon="logout" onClick=${onLogout}>Logout</${Btn}></div></div>`;
}
function Notifs() {
  const q = useApi('notifications'); useEffect(() => { api('notifications/read', { body: {} }); }, []);
  return html`<div><h3 class="msec">Notifications</h3><${Load} q=${q}>${(d) => d.items.length ? d.items.map(n => html`<a class=${'mrow card' + (n.read ? '' : ' unread')} href=${(n.link || '').replace(/^\/(crm|app)/, '').replace('#/quotations/', '#/quote/') || '#/'}><div><b>${n.title}</b><small>${n.body}</small><small class="muted">${ago(n.created_at)}</small></div></a>`) : html`<${Empty}/>`}<//></div>`;
}

function Page({ route, user, onLogout }) {
  const [path] = route.split('?'); const p = path.split('/').filter(Boolean); const r = user.role;
  switch (p[0] || '') {
    case '': return r === 'tech' ? html`<${TechJobs} user=${user}/>` : r === 'owner' ? html`<${OwnerHome} user=${user}/>` : html`<${SalesToday} user=${user}/>`;
    case 'leads': return p[1] ? html`<${LeadCard} id=${p[1]} user=${user}/>` : html`<${MLeads} user=${user}/>`;
    case 'followups': return html`<${S.Followups} user=${user}/>`;
    case 'inbox': return html`<div class=${'minbox' + (p[1] ? ' open' : '')}><${S.Inbox} phone=${p[1]} user=${user}/></div>`;
    case 'quote': return html`<${Q.QuoteEditor} id=${p[1] || 'new'} user=${user} mobile/>`;
    case 'quotations': return p[1] ? html`<${Q.QuoteEditor} id=${p[1]} user=${user} mobile/>` : html`<${MQuotes} user=${user}/>`;
    case 'quotes': return html`<${MQuotes} user=${user}/>`;
    case 'order': case 'orders': return p[1] ? html`<${Q.OrderDetail} id=${p[1]} user=${user}/>` : html`<${Q.Orders} user=${user}/>`;
    case 'payments': return html`<${Q.Payments} user=${user}/>`;
    case 'customers': return p[1] ? html`<${S.CustomerDetail} id=${p[1]}/>` : html`<${S.Customers}/>`;
    case 'jobs': return html`<${O.JobDetail} id=${p[1]} user=${user} mobile/>`;
    case 'scan': return html`<${ScanPage}/>`;
    case 'service': return html`<${O.Service} user=${user}/>`;
    case 'stock': return html`<${O.Stock} user=${user}/>`;
    case 'team': return r === 'owner' ? html`<${O.Team}/>` : null;
    case 'serial': return html`<${O.SerialView} serial=${decodeURIComponent(p[1] || '')}/>`;
    case 'more': return html`<${More} user=${user}/>`;
    case 'me': return html`<${Me} user=${user} onLogout=${onLogout}/>`;
    case 'notifications': return html`<${Notifs}/>`;
    default: return html`<${Empty}>Not found<//>`;
  }
}

export function MobileApp({ user, route, onLogout }) {
  const tabs = TABS[user.role] || TABS.sales; const base = '/' + (route.split(/[/?]/)[1] || '');
  // Desktop-style deep links (#/quotations/12) map to mobile screens
  useEffect(() => { window.scrollTo(0, 0); }, [route]);
  return html`<div class="mapp"><${Header} user=${user} onLogout=${onLogout}/>
    <main class="mmain">${route !== '/' && html`<button class="mback" onClick=${() => history.length > 1 ? history.back() : go('/')}><${Ic} n="back" s=${18}/> Back</button>`}<${Page} route=${route} user=${user} onLogout=${onLogout}/></main>
    <nav class="mtabs">${tabs.map(([p, l, i]) => html`<a href=${'#' + p} class=${(p === '/' ? base === '/' : base === '/' + p.split('/')[1]) ? 'on' : ''}><${Ic} n=${i} s=${21}/><span>${l}</span></a>`)}</nav></div>`;
}
