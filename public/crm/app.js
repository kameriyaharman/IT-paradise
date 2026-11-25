import { html, render, useState, useEffect, api, auth, useRoute, go, Ic, initials, toast, Btn, useForm, F, ago } from './ui.js';
import * as S from './p-sales.js';
import * as Q from './p-quote.js';
import * as O from './p-ops.js';
import * as A from './p-admin.js';

const MOBILE = location.pathname.startsWith('/app');
const ADMIN = location.pathname.startsWith('/admin');

export function Login({ onDone }) {
  const [v, bind] = useForm({ email: '', password: '', role: MOBILE ? 'sales' : '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e && e.preventDefault(); setErr('');
    try { const r = await api('auth/login', { body: { email: v.email, password: v.password, role: v.role || undefined } }); auth.set(r.token); onDone(r.user); }
    catch (x) { setErr(x.message); }
  };
  return html`<div class="login"><form class="lbox" onSubmit=${submit}>
    <div class="lbrand"><img src="/static/img/logo.svg" width="46"/><div><b>IT PARADISE</b><small>${MOBILE ? 'STAFF APP' : ADMIN ? 'WEBSITE ADMIN' : 'BUSINESS CRM'}</small></div></div>
    ${MOBILE && html`<div class="roles">${[['owner', 'Owner'], ['sales', 'Sales'], ['tech', 'Technician']].map(([k, l]) => html`<button type="button" class=${v.role === k ? 'on' : ''} onClick=${() => bind('role').onInput({ target: { value: k } })}>${l}</button>`)}</div>`}
    <${F} l="Email or mobile"><input ...${bind('email')} autocomplete="username" required/></${F}>
    <${F} l="Password"><input type="password" ...${bind('password')} autocomplete="current-password" required/></${F}>
    ${err && html`<p class="t-red small">${err}</p>`}
    <button class="btn b-pri big">Login</button>
    <p class="muted small center">Forgot password? Ask the owner to reset it from Team.</p>${!MOBILE && html`<p class="small center"><a class="t-blue" href="/download/app">Download staff Android app</a></p>`}
  </form></div>`;
}

function Notifs({ onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('notifications').then(setD); api('notifications/read', { body: {} }); }, []);
  return html`<div class="drop notif" onClick=${(e) => e.stopPropagation()}>
    <div class="drop-h"><b>Notifications</b><button class="icbtn" onClick=${onClose}><${Ic} n="x" s=${16}/></button></div>
    ${!d ? html`<div class="spin"><span></span></div>` : !d.items.length ? html`<div class="empty">No notifications</div>` :
      d.items.map(n => html`<a class=${'nrow' + (n.read ? '' : ' unread')} href=${(n.link || '').replace(/^\/crm/, '').replace(/^\/app/, '') || '#/'} onClick=${onClose}><b>${n.title}</b><span>${n.body}</span><small>${ago(n.created_at)}</small></a>`)}
  </div>`;
}

function GlobalSearch() {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]);
  useEffect(() => { if (q.length < 2) return setRes([]); const t = setTimeout(() => api('search?q=' + encodeURIComponent(q)).then(setRes).catch(() => { }), 250); return () => clearTimeout(t); }, [q]);
  return html`<div class="gsearch"><div class="srch"><${Ic} n="search" s=${16}/><input placeholder="Search lead, customer, invoice, serial…" value=${q} onInput=${(e) => setQ(e.target.value)}/></div>
    ${res.length > 0 && html`<div class="pick-list">${res.map(r => html`<a href=${r.link} onClick=${() => setQ('')}><span><small class="t-blue">${r.type}</small> ${r.label}</span><small>${r.sub || ''}</small></a>`)}</div>`}</div>`;
}

const NAV = [
  ['SALES', [['/', 'Dashboard', 'dash'], ['/inbox', 'WhatsApp inbox', 'chat'], ['/leads', 'Leads & pipeline', 'funnel'], ['/followups', 'Follow-ups', 'phone'], ['/quotations', 'Quotations', 'doc'], ['/orders', 'Orders & invoices', 'cart'], ['/payments', 'Payments & dues', 'rupee'], ['/customers', 'Customers', 'user']]],
  ['OPERATIONS', [['/stock', 'Stock & purchase', 'box'], ['/service', 'Service & AMC', 'tool'], ['/team', 'Team & tasks', 'users', 'owner']]],
  ['INSIGHTS', [['/reports', 'Reports', 'chart', 'owner'], ['/automations', 'Automations', 'zap', 'owner']]],
  ['SETUP', [['/settings', 'Settings & integrations', 'gear', 'owner']]],
];

function Shell({ user, route, children, onLogout }) {
  const [menu, setMenu] = useState(false); const [notif, setNotif] = useState(false); const [unread, setUnread] = useState(0);
  useEffect(() => { const f = () => api('notifications').then(d => setUnread(d.unread)).catch(() => { }); f(); const t = setInterval(f, 30000); return () => clearInterval(t); }, []);
  const base = '/' + (route.split(/[/?]/)[1] || '');
  return html`<div class=${'shell' + (menu ? ' menu-open' : '')} onClick=${() => notif && setNotif(false)}>
    <aside class="side">
      <a class="brand" href="#/"><img src="/static/img/logo.svg" width="34"/><div><b>IT PARADISE</b><small>TECHNOLOGY. INTEGRATED.</small></div></a>
      <div class="side-tag">BUSINESS CRM</div>
      ${NAV.map(([g, items]) => { const vis = items.filter(i => !i[3] || i[3] === user.role); return vis.length > 0 && html`<div class="ngroup"><div class="nlabel">${g}</div>${vis.map(([p, l, ic]) => html`<a href=${'#' + p} class=${base === p || (p === '/' && base === '/') ? 'on' : ''} onClick=${() => setMenu(false)}><${Ic} n=${ic}/>${l}</a>`)}</div>`; })}
      <div class="side-foot">${user.role === 'owner' && html`<a href="/admin"><${Ic} n="globe" s=${15}/> Website admin</a>`}<a href="/" target="_blank"><${Ic} n="ext" s=${15}/> View website</a><a href="/app"><${Ic} n="phone" s=${15}/> Mobile app view</a><a href="/download/app"><${Ic} n="download" s=${15}/> Download Android app</a></div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="icbtn burger" onClick=${() => setMenu(!menu)}><${Ic} n="list"/></button>
        <${GlobalSearch}/>
        <div class="top-r">
          ${user.role !== 'tech' && html`<a class="btn b-pri" href="#/leads?new=1"><${Ic} n="plus" s=${16}/> New</a>`}
          <button class="icbtn bell" onClick=${(e) => { e.stopPropagation(); setNotif(!notif); setUnread(0); }}><${Ic} n="bell"/>${unread > 0 && html`<i>${unread}</i>`}</button>
          ${notif && html`<${Notifs} onClose=${() => setNotif(false)}/>`}
          <div class="me" title=${user.name + ' · ' + user.role}><span class="av">${initials(user.name)}</span><div><b>${user.name}</b><small>${{ owner: 'Owner / Admin', sales: 'Sales executive', tech: 'Technician' }[user.role]}</small></div>
            <button class="icbtn" title="Logout" onClick=${onLogout}><${Ic} n="logout" s=${16}/></button></div>
        </div>
      </header>
      <div class="page">${children}</div>
    </div>
  </div>`;
}

function Router({ route, user }) {
  const [path] = route.split('?'); const p = path.split('/').filter(Boolean);
  const own = user.role === 'owner';
  switch (p[0] || '') {
    case '': return html`<${S.Dashboard} user=${user}/>`;
    case 'inbox': return html`<${S.Inbox} phone=${p[1]} user=${user}/>`;
    case 'leads': return p[1] ? html`<${S.LeadDetail} id=${p[1]} user=${user}/>` : html`<${S.Leads} user=${user}/>`;
    case 'followups': return html`<${S.Followups} user=${user}/>`;
    case 'customers': return p[1] ? html`<${S.CustomerDetail} id=${p[1]} user=${user}/>` : html`<${S.Customers}/>`;
    case 'quotations': return p[1] ? html`<${Q.QuoteEditor} id=${p[1]} user=${user}/>` : html`<${Q.Quotations} user=${user}/>`;
    case 'orders': return p[1] ? html`<${Q.OrderDetail} id=${p[1]} user=${user}/>` : html`<${Q.Orders} user=${user}/>`;
    case 'payments': return html`<${Q.Payments} user=${user}/>`;
    case 'stock': return html`<${O.Stock} user=${user}/>`;
    case 'service': return html`<${O.Service} user=${user}/>`;
    case 'jobs': return html`<${O.JobDetail} id=${p[1]} user=${user}/>`;
    case 'serial': return html`<${O.SerialView} serial=${decodeURIComponent(p[1] || '')}/>`;
    case 'team': return own ? html`<${O.Team}/>` : null;
    case 'reports': return own ? html`<${O.Reports}/>` : null;
    case 'automations': return own ? html`<${O.Automations}/>` : null;
    case 'website': location.href = '/admin'; return null;
    case 'settings': return own ? html`<${A.Settings} user=${user}/>` : null;
    default: return html`<div class="empty">Page not found</div>`;
  }
}

const ANAV = [['WEBSITE', [['/', 'Overview', 'dash'], ['/products', 'Products', 'box'], ['/categories', 'Categories', 'list'], ['/brands', 'Brands', 'doc'], ['/sectors', 'Solutions by sector', 'users'], ['/banners', 'Home banners', 'camera'], ['/pages', 'Pages', 'doc'], ['/gallery', 'Photo gallery', 'camera']]],
  ['LEADS', [['/enquiries', 'Website enquiries', 'chat']]], ['SETTINGS', [['/settings', 'Contact, about & SEO', 'gear'], ['/account', 'My account', 'user']]]];
function AdminShell({ user, route, onLogout }) {
  const [menu, setMenu] = useState(false);
  const [path] = route.split('?'); const p = path.split('/').filter(Boolean); const base = '/' + (p[0] || '');
  if (user.role !== 'owner') return html`<div class="login"><div class="lbox"><h3>Website admin is for the owner / admin account only.</h3><a class="btn b-pri" href="/crm">Go to CRM</a><button class="btn b-ghost" onClick=${onLogout}>Logout</button></div></div>`;
  const page = (() => { switch (p[0] || '') {
    case '': return html`<${A.AdminHome}/>`;
    case 'products': return p[1] ? html`<${A.ProductEdit} id=${p[1]}/>` : html`<div><div class="ph"><h1>Products</h1></div><${A.ProductList}/></div>`;
    case 'categories': case 'brands': case 'sectors': case 'banners': case 'gallery': return html`<div><div class="ph"><h1>${{ categories: 'Categories', brands: 'Brands', sectors: 'Solutions by sector', banners: 'Home banners', gallery: 'Photo gallery' }[p[0]]}</h1></div><${A.Simple} t=${p[0]}/></div>`;
    case 'pages': return html`<div><div class="ph"><h1>Pages</h1></div><${A.Pages}/></div>`;
    case 'enquiries': return html`<${A.Enquiries}/>`;
    case 'settings': return html`<${A.WebsiteSettings}/>`;
    case 'account': return html`<div><div class="ph"><h1>My account</h1></div><${A.Account}/></div>`;
    default: return html`<div class="empty">Page not found</div>`; } })();
  return html`<div class=${'shell admin' + (menu ? ' menu-open' : '')}>
    <aside class="side"><a class="brand" href="#/"><img src="/static/img/logo.svg" width="34"/><div><b>IT PARADISE</b><small>TECHNOLOGY. INTEGRATED.</small></div></a><div class="side-tag">WEBSITE ADMIN</div>
      ${ANAV.map(([g, items]) => html`<div class="ngroup"><div class="nlabel">${g}</div>${items.map(([h, l, ic]) => html`<a href=${'#' + h} class=${base === h ? 'on' : ''} onClick=${() => setMenu(false)}><${Ic} n=${ic}/>${l}</a>`)}</div>`)}
      <div class="side-foot"><a href="/" target="_blank"><${Ic} n="ext" s=${15}/> View website</a><a href="/crm"><${Ic} n="dash" s=${15}/> Open CRM</a></div></aside>
    <div class="main"><header class="top"><button class="icbtn burger" onClick=${() => setMenu(!menu)}><${Ic} n="list"/></button><div class="gsearch"></div>
      <div class="top-r"><a class="btn b-pri" href="#/products/new"><${Ic} n="plus" s=${16}/> Add product</a><div class="me"><span class="av">${initials(user.name)}</span><div><b>${user.name}</b><small>Website admin</small></div><button class="icbtn" title="Logout" onClick=${onLogout}><${Ic} n="logout" s=${16}/></button></div></div></header>
      <div class="page">${page}</div></div></div>`;
}

function App() {
  const route = useRoute();
  const [user, setUser] = useState(undefined);
  useEffect(() => { if (!auth.token) return setUser(null); api('me').then(d => { auth.user = d.user; auth.me = d; setUser(d.user); }).catch(() => setUser(null)); }, []);
  const logout = async () => { await api('auth/logout', { body: {} }).catch(() => { }); auth.set(null); setUser(null); };
  if (user === undefined) return html`<div class="boot"><img src="/static/img/logo.svg" width="56"/></div>`;
  if (!user) return html`<${Login} onDone=${(u) => { auth.user = u; setUser(u); api('me').then(d => auth.me = d); go('/'); }}/>`;
  if (ADMIN) return html`<${AdminShell} user=${user} route=${route} onLogout=${logout}/>`;
  if (MOBILE) return html`<${MobileApp} user=${user} route=${route} onLogout=${logout}/>`;
  if (user.role === 'tech') { location.href = '/app'; return null; }
  return html`<${Shell} user=${user} route=${route} onLogout=${logout}><${Router} route=${route} user=${user}/><//>`;
}

// Inside the Android app: open external / new-tab links in the system browser or the right app (WhatsApp, dialer, maps)
import { native, openExternal } from './ui.js';
if (native()) document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]'); if (!a) return;
  const href = a.getAttribute('href');
  if (/^https?:/.test(href) && (a.target === '_blank' || new URL(href).host !== location.host)) { e.preventDefault(); openExternal(href); }
}, true);
let MobileApp = () => null;
if (MOBILE) { document.body.classList.add('mobile'); MobileApp = (await import('./mobile.js')).MobileApp; }
render(html`<${App}/>`, document.getElementById('app'));
