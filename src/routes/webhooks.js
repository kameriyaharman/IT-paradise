// Inbound integrations — official webhooks / APIs for every lead channel
const express = require('express');
const crypto = require('crypto');
const { q, one, getSettings } = require('../db');
const { captureLead } = require('../leads');
const { handleIncoming } = require('../bot');
const { ingestIndiaMart } = require('../automations');

const r = express.Router();

async function verifyMetaSig(req) {
  const s = await getSettings();
  if (!s.meta_app_secret) return true; // not configured → accept (set the secret in production)
  const sig = req.headers['x-hub-signature-256'] || '';
  const exp = 'sha256=' + crypto.createHmac('sha256', s.meta_app_secret).update(req.rawBody || '').digest('hex');
  return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
}
async function keyOk(req) {
  const s = await getSettings();
  const k = req.query.key || req.headers['x-api-key'] || (req.body && (req.body.google_key || req.body.key));
  return s.webhook_key && k === s.webhook_key;
}

// Meta verification handshake (WhatsApp + Page/Instagram webhooks)
const verify = async (req, res) => {
  const s = await getSettings();
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === (s.meta_verify_token || 'itparadise-verify'))
    return res.send(req.query['hub.challenge']);
  res.sendStatus(403);
};
r.get('/whatsapp', verify);
r.get('/meta', verify);

// ---- WhatsApp Cloud API -------------------------------------------------
r.post('/whatsapp', async (req, res) => {
  if (!(await verifyMetaSig(req))) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    for (const entry of req.body.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const contacts = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
      for (const m of v.messages || []) {
        const text = m.text ? m.text.body : m.button ? m.button.text : m.interactive ? JSON.stringify(m.interactive) : `[${m.type}]`;
        await handleIncoming({ phone: m.from, name: contacts[m.from], text, waId: m.id, referral: m.referral });
      }
      for (const st of v.statuses || []) await q('UPDATE messages SET status=$2 WHERE wa_id=$1', [st.id, st.status]);
    }
  } catch (e) { console.error('[wa webhook]', e.message); }
});

// ---- Facebook / Instagram (Lead Ads + Messenger/IG DMs) -----------------
async function fetchMetaLead(leadgenId) {
  const s = await getSettings();
  const token = s.meta_page_token;
  if (!token) throw new Error('meta_page_token not set');
  const resp = await fetch(`https://graph.facebook.com/v21.0/${leadgenId}?fields=field_data,created_time,ad_name,form_id,platform&access_token=${encodeURIComponent(token)}`);
  const j = await resp.json();
  if (j.error) throw new Error(j.error.message);
  const f = Object.fromEntries((j.field_data || []).map(x => [x.name.toLowerCase(), (x.values || [])[0]]));
  return { j, f };
}
r.post('/meta', async (req, res) => {
  if (!(await verifyMetaSig(req))) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const obj = req.body.object; // 'page' or 'instagram'
    for (const entry of req.body.entry || []) {
      for (const ch of entry.changes || []) {
        if (ch.field === 'leadgen') {
          const { j, f } = await fetchMetaLead(ch.value.leadgen_id);
          const platform = (j.platform || '').toLowerCase() === 'ig' ? 'instagram' : 'facebook';
          const extra = Object.entries(f).filter(([k]) => !/name|phone|email|city/.test(k)).map(([k, v]) => `${k}: ${v}`).join('; ');
          await captureLead({ name: f.full_name || f.name || [f.first_name, f.last_name].filter(Boolean).join(' '), phone: f.phone_number || f.phone, email: f.email,
            city: f.city, company: f.company_name, need: extra || j.ad_name, source: platform, source_detail: `Lead Ad${j.ad_name ? ': ' + j.ad_name : ''}`, external_id: ch.value.leadgen_id });
        }
      }
      // Messenger / Instagram Direct messages
      for (const m of entry.messaging || []) {
        if (!m.message || m.message.is_echo) continue;
        await captureLead({ name: `${obj === 'instagram' ? 'Instagram' : 'Facebook'} user ${String(m.sender.id).slice(-4)}`, need: m.message.text,
          source: obj === 'instagram' ? 'instagram' : 'facebook', source_detail: 'Direct message', external_id: m.message.mid });
      }
    }
  } catch (e) { console.error('[meta webhook]', e.message); }
});

// ---- IndiaMART Push API -------------------------------------------------
r.post('/indiamart', async (req, res) => {
  if (!(await keyOk(req))) return res.status(401).json({ CODE: 401, STATUS: 'Unauthorized' });
  try {
    const body = req.body.RESPONSE || req.body;
    const list = Array.isArray(body) ? body : [body];
    for (const x of list) await ingestIndiaMart(x);
    res.json({ CODE: 200, STATUS: 'SUCCESS' });
  } catch (e) { res.status(500).json({ CODE: 500, STATUS: e.message }); }
});

// ---- Google Ads lead form extension webhook -----------------------------
r.post('/google-ads', async (req, res) => {
  if (!(await keyOk(req))) return res.sendStatus(401);
  const cols = Object.fromEntries((req.body.user_column_data || []).map(c => [c.column_id, c.string_value]));
  await captureLead({ name: cols.FULL_NAME || [cols.FIRST_NAME, cols.LAST_NAME].filter(Boolean).join(' '), phone: cols.PHONE_NUMBER, email: cols.EMAIL,
    city: cols.CITY, company: cols.COMPANY_NAME, need: Object.entries(cols).filter(([k]) => !/NAME|PHONE|EMAIL|CITY/.test(k)).map(([k, v]) => `${k}: ${v}`).join('; ') || 'Google Ads lead form',
    source: 'google', source_detail: `Google Ads${req.body.campaign_id ? ' · campaign ' + req.body.campaign_id : ''}`, external_id: req.body.lead_id });
  res.json({});
});

// ---- Missed call / IVR (Exotel, Knowlarity, MyOperator, etc.) -----------
r.all('/call', async (req, res) => {
  if (!(await keyOk(req))) return res.sendStatus(401);
  const b = { ...req.query, ...req.body };
  const from = b.CallFrom || b.caller || b.from || b.From || b.caller_number || b.customer_number;
  if (!from) return res.status(400).json({ error: 'caller number missing' });
  await captureLead({ name: b.name || 'Caller ' + String(from).slice(-4), phone: from, need: b.missed === 'false' ? 'Inbound call' : 'Missed call — call back',
    source: 'call', source_detail: b.provider || 'IVR / missed call', external_id: b.CallSid || b.call_id || undefined });
  res.json({ ok: true });
});

// ---- Generic (LinkedIn via Zapier/Make, Google Business Profile, Justdial, any form) ----
r.post('/lead', async (req, res) => {
  if (!(await keyOk(req))) return res.sendStatus(401);
  const b = req.body;
  const result = await captureLead({ name: b.name || b.full_name || [b.first_name, b.last_name].filter(Boolean).join(' '), phone: b.phone || b.mobile, email: b.email,
    company: b.company, city: b.city, need: b.need || b.message || b.requirement, quantity: b.quantity, budget: b.budget,
    source: ['linkedin', 'google', 'facebook', 'instagram', 'email', 'call', 'website', 'indiamart', 'walkin', 'reference'].includes(b.source) ? b.source : 'manual',
    source_detail: b.source_detail || b.campaign || b.form, external_id: b.id || b.external_id });
  res.json({ ok: true, lead_id: result.lead.id, duplicate: result.duplicate });
});

module.exports = r;
