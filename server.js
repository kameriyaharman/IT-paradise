const express = require('express');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { migrate, getSettings, setSetting, one } = require('./src/db');
const { seed } = require('./src/seed');
const automations = require('./src/automations');

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!req.path.startsWith('/app')) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Remember public URL for links in WhatsApp messages
app.use(async (req, res, next) => {
  try {
    const s = await getSettings();
    const host = req.get('host');
    if (!process.env.PUBLIC_URL && !s.public_url && host && !/localhost|127\.0\.0\.1|healthcheck|railway\.internal/.test(host)) await setSetting('public_url', `https://${host}`);
  } catch (e) { /* ignore */ }
  next();
});

app.get(['/download/app', '/download/ITParadise.apk'], (req, res) => {
  const f = path.join(__dirname, 'public/downloads/ITParadise.apk');
  if (!require('fs').existsSync(f)) return res.status(503).send('The Android app is being built — please try again in a few minutes.');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.download(f, 'ITParadise.apk');
});
app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d', setHeaders: (res, f) => { if (/[\\/]crm[\\/]/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use('/vendor/preact', express.static(path.join(__dirname, 'node_modules/preact/dist'), { maxAge: '30d' }));
app.use('/vendor/hooks', express.static(path.join(__dirname, 'node_modules/preact/hooks/dist'), { maxAge: '30d' }));
app.use('/vendor/qr', express.static(path.join(__dirname, 'node_modules/html5-qrcode'), { maxAge: '30d' }));
app.use('/vendor/htm', express.static(path.join(__dirname, 'node_modules/htm/dist'), { maxAge: '30d' }));

app.get('/media/:id', async (req, res) => {
  const m = await one('SELECT mime,data FROM media WHERE id=$1', [+req.params.id || 0]);
  if (!m) return res.status(404).end();
  res.setHeader('Content-Type', m.mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
  res.end(m.data);
});

app.use('/webhooks', require('./src/routes/webhooks'));
app.use('/api/cms', require('./src/routes/cms'));
app.use('/api/public', require('./src/routes/public'));
app.use('/api', require('./src/routes/api'));

// CRM (desktop) and staff app (mobile) — same SPA, layout switches by path
const spa = (req, res) => res.sendFile(path.join(__dirname, 'public/crm/index.html'));
app.get(['/crm', '/crm/*splat', '/app', '/app/*splat', '/admin', '/admin/*splat'], spa);

app.use('/', require('./src/routes/site'));

// Errors
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) return res.status(status).json({ error: err.message || 'Server error' });
  res.status(status).send('Something went wrong');
});

const PORT = process.env.PORT || 3000;
(async () => {
  await migrate();
  await seed();
  automations.start();
  app.listen(PORT, () => console.log(`IT Paradise running on :${PORT}`));
})().catch((e) => { console.error('Startup failed', e); process.exit(1); });
