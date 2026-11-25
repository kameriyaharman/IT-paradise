(function () {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const toast = (t) => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); };
  const inr = (n) => Number(n || 0).toLocaleString('en-IN');

  // Mobile nav
  $$('[data-toggle="nav"]').forEach(b => b.addEventListener('click', () => $('#nav').classList.toggle('open')));

  // Modals
  function open(name, btn) {
    const m = $('#m-' + name); if (!m) return;
    const f = $('form', m); f.reset();
    $$('.merr', m).forEach(x => x.hidden = true);
    if (name === 'enquiry') {
      const pid = btn && btn.dataset.product;
      f.product_id.value = pid || '';
      $('.enq-prod', m).hidden = !pid;
      $('.need-wrap', m).hidden = !!pid;
      $('#enq-h').textContent = pid ? 'Enquire about this product' : 'Get a quote';
      if (pid) { $('.enq-pname', m).textContent = btn.dataset.pname; $('.enq-price', m).textContent = +btn.dataset.price ? '₹' + inr(btn.dataset.price) + ' + GST' : 'Price on request'; }
      f.form.value = (btn && btn.dataset.form) || (pid ? 'Product enquiry popup' : 'Quote popup');
      if (btn && btn.dataset.needval) f.need.value = btn.dataset.needval;
    }
    if (name === 'service') { $('.ticket-ok', m).hidden = true; $('button.btn', f).hidden = false; }
    m.hidden = false; setTimeout(() => { const i = $('input[name=name],input[name=problem]', m); i && i.focus(); }, 50);
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); open(o.dataset.open, o); return; }
    if (e.target.closest('[data-close]') || e.target.classList.contains('modal')) { e.target.closest('.modal').hidden = true; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal').forEach(m => m.hidden = true); });

  // All forms → API (enquiry captured into CRM)
  $$('form[data-api]').forEach(f => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button.btn', f), err = $('.merr', f);
    const data = Object.fromEntries(new FormData(f).entries());
    if (err) err.hidden = true;
    btn.disabled = true; const old = btn.innerHTML; btn.textContent = 'Sending…';
    try {
      const r = await fetch(f.dataset.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Something went wrong');
      if (window.gtag) gtag('event', 'generate_lead', { form: data.form || 'service' });
      if (j.ticket) { const ok = $('.ticket-ok', f); $('b', ok).textContent = j.ticket; ok.hidden = false; btn.hidden = true; }
      else location.href = '/enquiry-sent';
    } catch (ex) { if (err) { err.textContent = ex.message; err.hidden = false; } else alert(ex.message); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  }));

  // Best-seller filter pills
  $$('[data-filter]').forEach(p => p.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', p).forEach(x => x.classList.toggle('on', x === b));
    $$('#' + p.dataset.filter + ' > div').forEach(c => c.hidden = b.dataset.f && c.dataset.cat !== b.dataset.f);
  }));
  // Grid / list
  $$('[data-view]').forEach(b => b.addEventListener('click', () => { $$('[data-view]').forEach(x => x.classList.toggle('on', x === b)); $('.plist').classList.toggle('as-list', b.dataset.view === 'list'); }));
  // Tabs
  $$('.tab-h button').forEach(b => b.addEventListener('click', () => { $$('.tab-h button').forEach(x => x.classList.toggle('on', x === b)); $$('.tab-b').forEach(p => p.classList.toggle('on', p.dataset.pane === b.dataset.tab)); }));
  // Gallery thumbs
  $$('.pd-thumbs button').forEach(b => b.addEventListener('click', () => { $$('.pd-thumbs button').forEach(x => x.classList.toggle('on', x === b)); $('#pdMain').innerHTML = b.dataset.src ? `<img class="art big" src="${b.dataset.src}" alt="">` : b.innerHTML; }));
  // Bought together → add to quick enquiry
  $$('[data-add]').forEach(b => b.addEventListener('click', () => {
    const f = b.closest('.pd2').querySelector('form'); const items = f.items.value ? f.items.value.split(' | ') : [];
    if (!items.includes(b.dataset.add)) items.push(b.dataset.add);
    f.items.value = items.join(' | '); const a = $('.added', f); a.hidden = false; a.textContent = 'Also: ' + items.join(', '); b.textContent = 'Added ✓'; b.disabled = true;
  }));
  // Cookie notice
  try { if (!localStorage.getItem('itp_ck')) $('.cookie').hidden = false; } catch (e) { }
  $$('[data-cookie-ok]').forEach(b => b.addEventListener('click', () => { try { localStorage.setItem('itp_ck', '1'); } catch (e) { } $('.cookie').hidden = true; }));
  $$('[data-cookie]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); $('.cookie').hidden = false; }));
  if (location.hash === '#quote' && !$('#quote')) open('enquiry');
})();
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Header shadow
  const hdr = document.querySelector('.hdr');
  const onScroll = () => hdr && hdr.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // Scroll reveal with stagger
  const sel = '.cat,.pcard,.sector,.steps>div,.pkg,.sup,.sec-head,.h2,.eyebrow.center,.quote-blk>*,.assess,.values>div,.nums>div,.brand,.fbt,.tabs,.contact,.gal figure,.ftr-grid>div,.banner';
  const els = [...document.querySelectorAll(sel)].filter(e => !e.closest('.hero') && !e.closest('.modal'));
  els.forEach(e => { const sib = [...e.parentElement.children].filter(x => x.matches(sel)); e.style.setProperty('--rd', Math.min(sib.indexOf(e), 8) * 0.07 + 's'); e.classList.add('rv'); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  els.forEach(e => io ? io.observe(e) : e.classList.add('in'));
  const steps = document.querySelector('.steps');
  if (steps && io) new IntersectionObserver((es, o) => es.forEach(en => { if (en.isIntersecting) { steps.classList.add('in-line'); o.disconnect(); } }), { threshold: .3 }).observe(steps);
  // Count-up numbers
  const count = (el, to, dur, fmt) => { if (reduce) { el.textContent = fmt(to); return; } const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  document.querySelectorAll('.stats b').forEach((b, i) => {
    const raw = b.textContent.trim(); const m = raw.match(/^([\d,]+)(.*)$/); if (!m) return;
    const n = +m[1].replace(/,/g, ''); const yr = n > 1900 && n < 2100;
    setTimeout(() => count(b, n, yr ? 1200 : 1600, (v) => (yr ? v : v.toLocaleString('en-IN')) + m[2]), 700 + i * 120);
  });
  // Laptop screen counters after boot
  setTimeout(() => document.querySelectorAll('.desk [data-to]').forEach(e => count(e, +e.dataset.to, 1300, v => v)), reduce ? 0 : 4100);
  // Subtle 3D tilt of the laptop with the mouse
  const stage = document.querySelector('.lap-stage'), lap = stage && stage.querySelector('.lap');
  if (stage && !reduce && matchMedia('(pointer:fine)').matches) {
    setTimeout(() => {
      lap.style.animation = 'none'; lap.style.transition = 'transform .4s ease-out';
      stage.addEventListener('mousemove', (e) => { const r = stage.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; lap.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 6}deg)`; });
      stage.addEventListener('mouseleave', () => { lap.style.transform = ''; });
    }, 2600);
  }
})();
// ===== Quote list (multi-product quote request) =====
(function () {
  const KEY = 'itp_quote';
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const set = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } badge(); };
  const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
  function badge(bump) {
    const n = get().reduce((a, i) => a + 1, 0);
    $$('.qc-n').forEach(b => { b.textContent = n; b.hidden = !n; if (bump) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } });
  }
  function toast(html) { document.querySelectorAll('.qtoast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast qtoast'; d.innerHTML = html; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
  function add(id, name, qty) {
    const l = get(); const ex = l.find(i => i.id === id);
    if (ex) ex.qty += qty; else l.push({ id, qty });
    set(l); badge(true);
    toast(`✓ <b>${name}</b> added to quote list · <a href="/quote">View list (${l.length})</a>`);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-addq]'); if (!b) return;
    e.preventDefault();
    const q = b.dataset.qtyfrom ? Math.max(1, parseInt($(b.dataset.qtyfrom).value) || 1) : 1;
    add(+b.dataset.addq, b.dataset.pname, q);
    b.classList.add('added'); setTimeout(() => b.classList.remove('added'), 1200);
    // fly-to-cart effect
    const cart = $('.qcart'); if (cart && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const a = b.getBoundingClientRect(), c = cart.getBoundingClientRect(); const dot = document.createElement('i'); dot.className = 'flydot';
      dot.style.left = a.left + a.width / 2 + 'px'; dot.style.top = a.top + a.height / 2 + 'px'; document.body.appendChild(dot);
      requestAnimationFrame(() => { dot.style.transform = `translate(${c.left + c.width / 2 - a.left - a.width / 2}px, ${c.top + c.height / 2 - a.top - a.height / 2}px) scale(.4)`; dot.style.opacity = '.2'; });
      setTimeout(() => dot.remove(), 750);
    }
  });
  $$('.qty [data-step]').forEach(b => b.addEventListener('click', () => { const i = b.parentElement.querySelector('input'); i.value = Math.max(1, (parseInt(i.value) || 1) + +b.dataset.step); }));
  badge();

  // Quote page
  const box = $('#qlist'); if (!box) return;
  let prods = [];
  async function render() {
    const l = get();
    if (!l.length) { $('#qEst').textContent = '₹0'; return; }
    if (prods.length < l.length || l.some(i => !prods.find(p => p.id === i.id))) prods = await fetch('/api/public/products?ids=' + l.map(i => i.id).join(',')).then(r => r.json());
    const rows = l.map(i => ({ ...i, p: prods.find(p => p.id === i.id) })).filter(i => i.p);
    let tot = 0;
    box.innerHTML = `<div class="qhead"><b>${rows.length} product${rows.length > 1 ? 's' : ''}</b><button type="button" class="linkbtn" data-clear>Clear list</button></div>` + rows.map(r => {
      const pr = +r.p.price; tot += pr * r.qty;
      const img = r.p.image_ids && r.p.image_ids.length ? `<img src="/media/${r.p.image_ids[0]}" alt="">` : `<img src="/static/img/logo.svg" alt="" class="ph-img">`;
      return `<div class="qrow" data-id="${r.id}"><a href="/product/${r.p.slug}" class="qimg">${img}</a><div class="qinfo"><small>${r.p.cat || ''}</small><a href="/product/${r.p.slug}">${r.p.name}</a><span>${pr ? inr(pr) + ' + GST each' : 'Price on request'}</span></div>
        <div class="qty"><button type="button" data-d="-1">−</button><input type="number" min="1" value="${r.qty}"><button type="button" data-d="1">+</button></div><b class="qline">${pr ? inr(pr * r.qty) : '—'}</b><button type="button" class="qdel" aria-label="Remove">×</button></div>`;
    }).join('');
    $('#qEst').textContent = inr(tot);
    // illustrations for products without photos
    rows.forEach(r => { if (r.p.art_svg) box.querySelector(`.qrow[data-id="${r.id}"] .qimg`).innerHTML = r.p.art_svg; });
  }
  box.addEventListener('click', (e) => {
    const row = e.target.closest('.qrow'); let l = get();
    if (e.target.closest('[data-clear]')) { if (confirm('Clear your quote list?')) { set([]); location.reload(); } return; }
    if (!row) return; const id = +row.dataset.id;
    if (e.target.closest('.qdel')) { row.classList.add('out'); setTimeout(() => { set(l.filter(i => i.id !== id)); render().then(() => { if (!get().length) location.reload(); }); }, 250); return; }
    const d = e.target.closest('[data-d]'); if (d) { const it = l.find(i => i.id === id); it.qty = Math.max(1, it.qty + +d.dataset.d); set(l); render(); }
  });
  box.addEventListener('change', (e) => { const row = e.target.closest('.qrow'); if (!row) return; const l = get(); const it = l.find(i => i.id === +row.dataset.id); it.qty = Math.max(1, parseInt(e.target.value) || 1); set(l); render(); });
  render();
  $('#qsend').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, err = $('.merr', f), btn = $('button.btn', f);
    const l = get(); if (!l.length) { err.textContent = 'Your quote list is empty — add products first.'; err.hidden = false; return; }
    const data = Object.fromEntries(new FormData(f).entries()); data.install = !!f.install.checked; data.items = l;
    err.hidden = true; btn.disabled = true; const old = btn.innerHTML; btn.textContent = 'Sending…';
    try {
      const r = await fetch('/api/public/quote-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Something went wrong');
      if (window.gtag) gtag('event', 'generate_lead', { form: 'quote_list', items: l.length });
      set([]); location.href = '/enquiry-sent';
    } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; btn.innerHTML = old; }
  });
})();
