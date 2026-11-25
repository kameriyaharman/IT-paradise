// Shared UI kit for CRM (desktop) and staff app (mobile)
import { h, render } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import htm from 'htm';
export const html = htm.bind(h);
export { h, render, useState, useEffect, useCallback, useRef };

// ---- API ----
const TK = 'itp_token';
export const auth = {
  get token() { try { return localStorage.getItem(TK); } catch (e) { return null; } },
  set(t) { try { t ? localStorage.setItem(TK, t) : localStorage.removeItem(TK); } catch (e) { } },
  user: null,
};
export async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
  if (auth.token) o.headers.Authorization = 'Bearer ' + auth.token;
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch(path.startsWith('/') ? path : '/api/' + path, o);
  if (r.status === 401 && !path.includes('auth/login')) { auth.set(null); location.hash = '#/login'; throw new Error('Please login again'); }
  const ct = r.headers.get('content-type') || '';
  const j = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((j && j.error) || 'Request failed');
  return j;
}
export const put = (p, b) => api(p, { method: 'PUT', body: b });
export const patch = (p, b) => api(p, { method: 'PATCH', body: b });
export const del = (p) => api(p, { method: 'DELETE' });
// Open a PDF / file with auth (fetch → blob)
export const native = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
export function openExternal(url) {
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (native() && B && /^https?:/.test(url)) return B.open({ url });
  window.open(url, '_blank');
}
export async function openFile(path, name) {
  if (native()) { const { t } = await api('auth/file-token'); return openExternal(location.origin + path + (path.includes('?') ? '&' : '?') + 't=' + t); }
  const r = await fetch(path, { headers: { Authorization: 'Bearer ' + auth.token } });
  if (!r.ok) return toast('Could not open file', 'err');
  const b = await r.blob(); const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.target = '_blank'; if (name) a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

// ---- hooks ----
export function useApi(path, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    if (!path) return;
    set(s => ({ ...s, loading: true }));
    api(path).then(d => set({ data: d, loading: false, error: null })).catch(e => set({ data: null, loading: false, error: e.message }));
  }, [path, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load, setData: (d) => set(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}
export function useRoute() {
  const [r, setR] = useState(location.hash.slice(1) || '/');
  useEffect(() => { const f = () => setR(location.hash.slice(1) || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
export const go = (p) => { location.hash = '#' + p; };
export const qparam = (k) => new URLSearchParams((location.hash.split('?')[1]) || '').get(k);

// ---- format ----
export const inr = (n, short) => {
  n = Number(n || 0);
  if (short) { if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'; if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L'; if (Math.abs(n) >= 1e3) return '₹' + (n / 1e3).toFixed(1) + 'k'; }
  return '₹' + Math.round(n).toLocaleString('en-IN');
};
export const dt = (d, withTime) => d ? new Date(d).toLocaleString('en-IN', withTime ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const tm = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
export const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };
export const initials = (n) => String(n || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
export const localInput = (d) => { const x = d ? new Date(d) : new Date(); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const waLink = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}${text ? '?text=' + encodeURIComponent(text) : ''}`;

export const STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['demo', 'Demo / visit'], ['quotation', 'Quotation'], ['negotiation', 'Negotiation'], ['won', 'Won'], ['lost', 'Lost']];
export const STAGE = Object.fromEntries(STAGES);
export const SOURCES = { website: 'Website', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', indiamart: 'IndiaMART', linkedin: 'LinkedIn', google: 'Google', email: 'Email', call: 'Calls', walkin: 'Walk-in', reference: 'Reference', manual: 'Manual' };
export const CATS = { 'video-surveillance': 'CCTV', 'business-computing': 'Computing', 'enterprise-networking': 'Networking', 'access-attendance': 'Attendance', 'power-backup': 'Power', 'print-display': 'Print & display' };
export const LOST = ['Price high', 'Bought elsewhere', 'No budget', 'Not reachable', 'Later'];
const TONE = { new: 'blue', contacted: 'sky', demo: 'violet', quotation: 'amber', negotiation: 'violet', won: 'green', lost: 'grey', hot: 'red', warm: 'amber', cold: 'grey',
  draft: 'grey', pending_approval: 'red', approved: 'sky', sent: 'amber', accepted: 'green', rejected: 'grey', converted: 'green',
  waiting_payment: 'red', confirmed: 'blue', scheduled: 'sky', partially_delivered: 'amber', delivered: 'green', completed: 'green', cancelled: 'grey',
  open: 'red', assigned: 'blue', on_the_way: 'violet', in_progress: 'amber', closed: 'green', warranty: 'sky', amc: 'violet', paid: 'grey', free: 'green',
  ok: 'green', reorder: 'red', active: 'green', expired: 'grey', overdue: 'red', due: 'amber', notdue: 'grey' };
export const label = (s) => ({ pending_approval: 'Needs approval', waiting_payment: 'Waiting payment', partially_delivered: 'Partially delivered', on_the_way: 'On the way', in_progress: 'In progress', demo: 'Demo / visit' }[s] || String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));
export const Badge = ({ s, children }) => html`<span class="badge t-${TONE[s] || 'grey'}">${children || label(s)}</span>`;

// ---- icons ----
const I = {
  dash: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', funnel: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5', cart: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  rupee: 'M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10', box: 'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12',
  tool: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z', users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  chart: 'M3 3v18h18M7 16l4-6 4 4 5-7', zap: 'M13 2 3 14h9l-1 8 10-12h-9z', globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', plus: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12',
  back: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', check: 'M20 6 9 17l-5-5', cal: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18', pin: 'M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  wa: 'M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z', send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', home: 'M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10', user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ext: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3', copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
};
export const Ic = ({ n, s = 18 }) => html`<svg class="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d=${I[n] || I.doc}/></svg>`;

// ---- toast ----
export function toast(msg, kind = 'ok') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg; document.body.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3000);
}
export const run = async (fn, okMsg) => { try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, 'err'); throw e; } };

// ---- components ----
export const Spinner = () => html`<div class="spin"><span></span></div>`;
export const Err = ({ e }) => html`<div class="empty err">${e}</div>`;
export const Empty = ({ children }) => html`<div class="empty">${children || 'Nothing here yet'}</div>`;
export function Load({ q, children }) {
  if (q.loading && !q.data) return html`<${Spinner}/>`;
  if (q.error) return html`<${Err} e=${q.error}/>`;
  return children(q.data);
}
export function Modal({ title, onClose, children, wide, foot }) {
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  return html`<div class="modal" onClick=${(e) => e.target.classList.contains('modal') && onClose()}>
    <div class=${'mbox' + (wide ? ' wide' : '')}><div class="mhead"><h3>${title}</h3><button class="icbtn" onClick=${onClose}><${Ic} n="x"/></button></div>
    <div class="mbody">${children}</div>${foot && html`<div class="mfoot">${foot}</div>`}</div></div>`;
}
// Simple controlled form state
export function useForm(init) {
  const [v, setV] = useState(init || {});
  const bind = (k, type) => type === 'check'
    ? { checked: !!v[k], onChange: (e) => setV(s => ({ ...s, [k]: e.target.checked })) }
    : { value: v[k] == null ? '' : v[k], onInput: (e) => setV(s => ({ ...s, [k]: e.target.value })) };
  return [v, bind, setV];
}
export const F = ({ l, children, full }) => html`<label class=${'fld' + (full ? ' full' : '')}><span>${l}</span>${children}</label>`;
export function Btn({ onClick, children, kind = 'pri', sm, icon, disabled, type, title }) {
  const [busy, setBusy] = useState(false);
  const click = async (e) => { if (!onClick) return; setBusy(true); try { await onClick(e); } catch (x) { } finally { setBusy(false); } };
  return html`<button type=${type || 'button'} title=${title} class=${`btn b-${kind}${sm ? ' sm' : ''}`} disabled=${disabled || busy} onClick=${click}>${icon && html`<${Ic} n=${icon} s=${sm ? 14 : 16}/>`}${busy ? '…' : children}</button>`;
}
export function Search({ value, onInput, ph }) { return html`<div class="srch"><${Ic} n="search" s=${16}/><input placeholder=${ph || 'Search…'} value=${value} onInput=${(e) => onInput(e.target.value)}/></div>`; }
export function Tabs({ tabs, cur, onChange }) { return html`<div class="tabs">${tabs.map(([k, l]) => html`<button class=${cur === k ? 'on' : ''} onClick=${() => onChange(k)}>${l}</button>`)}</div>`; }
export const Kpi = ({ l, v, sub, tone, onClick }) => html`<div class=${'kpi' + (onClick ? ' click' : '')} onClick=${onClick}><small>${l}</small><b>${v}</b>${sub && html`<span class=${'t-' + (tone || 'grey')}>${sub}</span>`}</div>`;

// Product picker with live stock
export function ProductPicker({ onPick, ph }) {
  const [q, setQ] = useState(''); const [list, setList] = useState([]); const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => api('products?q=' + encodeURIComponent(q)).then(setList).catch(() => { }), 200); return () => clearTimeout(t); }, [q]);
  return html`<div class="picker"><div class="srch"><${Ic} n="plus" s=${16}/><input placeholder=${ph || 'Add product…'} value=${q} onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 200)} onInput=${(e) => setQ(e.target.value)}/></div>
    ${open && html`<div class="pick-list">${list.slice(0, 12).map(p => html`<button onMouseDown=${() => { onPick(p); setQ(''); }}><span>${p.name}<small>${p.sku || ''}</small></span><span class="r"><b>${+p.price ? inr(p.price) : '—'}</b><small class=${p.stock - p.reserved > 0 ? 't-green' : 't-red'}>Stock ${p.stock - p.reserved}</small></span></button>`)}
      <button onMouseDown=${() => { onPick({ custom: true, name: q }); setQ(''); }}><span>+ Custom line: “${q || 'service / item'}”</span></button></div>`}</div>`;
}

// Barcode / QR scanner (BarcodeDetector → html5-qrcode fallback)
export function Scanner({ onResult, onClose }) {
  const ref = useRef(); const [err, setErr] = useState('');
  useEffect(() => {
    let stop = () => { }, done = false;
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector();
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          const v = document.createElement('video'); v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true; await v.play(); ref.current.appendChild(v);
          stop = () => stream.getTracks().forEach(t => t.stop());
          const tick = async () => { if (done) return; try { const r = await det.detect(v); if (r[0]) { done = true; stop(); onResult(r[0].rawValue); return; } } catch (e) { } requestAnimationFrame(tick); };
          tick();
        } else {
          await new Promise((ok, no) => { if (window.Html5Qrcode) return ok(); const s = document.createElement('script'); s.src = '/vendor/qr/html5-qrcode.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
          const id = 'qr' + Date.now(); ref.current.id = id;
          const sc = new window.Html5Qrcode(id);
          await sc.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (txt) => { if (done) return; done = true; sc.stop().catch(() => { }); onResult(txt); });
          stop = () => sc.stop().catch(() => { });
        }
      } catch (e) { setErr('Camera not available — type the serial number instead.'); }
    })();
    return () => { done = true; stop(); };
  }, []);
  return html`<${Modal} title="Scan serial / barcode" onClose=${onClose}><div class="scanbox" ref=${ref}></div>${err && html`<p class="t-red">${err}</p>`}<//>`;
}

// Signature pad
export function SignPad({ onSave }) {
  const c = useRef(); let drawing = false;
  useEffect(() => { const x = c.current.getContext('2d'); x.lineWidth = 2.2; x.lineCap = 'round'; x.strokeStyle = '#0B1F44'; }, []);
  const pos = (e) => { const r = c.current.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [(t.clientX - r.left) * (c.current.width / r.width), (t.clientY - r.top) * (c.current.height / r.height)]; };
  const start = (e) => { drawing = true; const x = c.current.getContext('2d'); x.beginPath(); x.moveTo(...pos(e)); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const x = c.current.getContext('2d'); x.lineTo(...pos(e)); x.stroke(); e.preventDefault(); };
  const end = () => { drawing = false; };
  return html`<div><canvas ref=${c} width="600" height="220" class="sign" onMouseDown=${start} onMouseMove=${move} onMouseUp=${end} onTouchStart=${start} onTouchMove=${move} onTouchEnd=${end}></canvas>
    <div class="row gap"><${Btn} kind="ghost" sm onClick=${() => c.current.getContext('2d').clearRect(0, 0, 600, 220)}>Clear</${Btn}><${Btn} sm onClick=${() => new Promise(ok => c.current.toBlob(b => { onSave(b); ok(); }, 'image/png'))}>Save signature</${Btn}></div></div>`;
}

// Mini bar chart (SVG)
export function Bars({ data, h: hh = 180 }) { // data: [{label, parts:[{v,c,n}]}]
  const max = Math.max(1, ...data.map(d => d.parts.reduce((a, p) => a + p.v, 0)));
  const w = 100 / Math.max(1, data.length);
  return html`<div class="bars" style=${{ height: hh + 'px' }}>${data.map(d => html`<div class="bar" style=${{ width: w + '%' }}>
    <div class="stack" title=${d.parts.map(p => `${p.n}: ${inr(p.v)}`).join('\n')}>${d.parts.map(p => html`<i style=${{ height: (p.v / max * (hh - 26)) + 'px', background: p.c }}></i>`)}</div><small>${d.label}</small></div>`)}</div>`;
}
