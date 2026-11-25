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
