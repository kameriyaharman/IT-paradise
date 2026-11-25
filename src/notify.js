// Outbound communication: WhatsApp Cloud API, email (SMTP), in-app notifications.
const { q, one, getSettings } = require('./db');

function normPhone(p) {
  if (!p) return '';
  let d = String(p).replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

async function waConfigured() {
  const s = await getSettings();
  return !!(s.wa_token && s.wa_phone_id);
}

async function graph(pathname, body) {
  const s = await getSettings();
  const r = await fetch(`https://graph.facebook.com/v21.0/${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.wa_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `WhatsApp API ${r.status}`);
  return j;
}

/**
 * Send a WhatsApp message. opts: { text } | { template, lang, params } | { document: url, filename, caption }
 * Logs into messages table (inbox history). If API isn't configured, the message is stored with
 * status 'not_configured' so nothing is silently lost.
 */
async function sendWhatsApp(phone, opts, ctx = {}) {
  const to = normPhone(phone);
  if (!to) return { ok: false, error: 'No phone' };
  const s = await getSettings();
  let body = opts.text || opts.caption || (opts.template ? `[template:${opts.template}] ${(opts.params || []).join(' | ')}` : '');
  if (opts.document) body = `${opts.caption || ''}\n📎 ${opts.filename || 'document'}: ${opts.document}`.trim();
  let status = 'not_configured', waId = null, error = null;
  if (s.wa_token && s.wa_phone_id) {
    try {
      let payload;
      if (opts.template) {
        payload = { messaging_product: 'whatsapp', to, type: 'template', template: { name: opts.template, language: { code: opts.lang || 'en' },
          components: opts.params && opts.params.length ? [{ type: 'body', parameters: opts.params.map(t => ({ type: 'text', text: String(t) })) }] : [] } };
      } else if (opts.document) {
        payload = { messaging_product: 'whatsapp', to, type: 'document', document: { link: opts.document, filename: opts.filename, caption: opts.caption } };
      } else {
        payload = { messaging_product: 'whatsapp', to, type: 'text', text: { body: opts.text, preview_url: true } };
      }
      const j = await graph(`${s.wa_phone_id}/messages`, payload);
      waId = j.messages && j.messages[0] && j.messages[0].id; status = 'sent';
    } catch (e) { status = 'failed'; error = e.message; }
  }
  await q(`INSERT INTO messages(channel,lead_id,phone,direction,body,wa_id,status,user_id,is_bot) VALUES('whatsapp',$1,$2,'out',$3,$4,$5,$6,$7)`,
    [ctx.leadId || null, to, body, waId, status, ctx.userId || null, !!ctx.bot]);
  if (status !== 'sent') await q('INSERT INTO outbox(channel,to_addr,template,body,status,error) VALUES($1,$2,$3,$4,$5,$6)', ['whatsapp', to, opts.template || null, body, status, error]);
  return { ok: status === 'sent', status, error, waLink: `https://wa.me/${to}?text=${encodeURIComponent(body.slice(0, 1500))}` };
}

let transporter = null;
async function sendEmail(to, subject, text, attachments) {
  const s = await getSettings();
  if (!s.smtp_host || !to) {
    await q('INSERT INTO outbox(channel,to_addr,body,status) VALUES($1,$2,$3,$4)', ['email', to, subject + '\n' + text, 'not_configured']);
    return { ok: false, status: 'not_configured' };
  }
  try {
    const nodemailer = require('nodemailer');
    if (!transporter || transporter._host !== s.smtp_host) {
      transporter = nodemailer.createTransport({ host: s.smtp_host, port: +s.smtp_port || 587, secure: +s.smtp_port === 465, auth: { user: s.smtp_user, pass: s.smtp_pass } });
      transporter._host = s.smtp_host;
    }
    await transporter.sendMail({ from: s.smtp_from || s.smtp_user, to, subject, text, attachments });
    return { ok: true };
  } catch (e) {
    await q('INSERT INTO outbox(channel,to_addr,body,status,error) VALUES($1,$2,$3,$4,$5)', ['email', to, subject, 'failed', e.message]);
    return { ok: false, error: e.message };
  }
}

async function notifyUser(userId, title, body, link) {
  if (!userId) return;
  await q('INSERT INTO notifications(user_id,title,body,link) VALUES($1,$2,$3,$4)', [userId, title, body || '', link || '']);
  // Optional: WhatsApp alert to staff member if enabled
  const s = await getSettings();
  if (s.staff_wa_alerts === '1') {
    const u = await one('SELECT phone FROM users WHERE id=$1', [userId]);
    if (u && u.phone) sendWhatsApp(u.phone, { text: `🔔 ${title}\n${body || ''}` }).catch(() => {});
  }
}
async function notifyRole(role, title, body, link) {
  const users = await q('SELECT id FROM users WHERE role=$1 AND active', [role]);
  for (const u of users) await notifyUser(u.id, title, body, link);
}

module.exports = { sendWhatsApp, sendEmail, notifyUser, notifyRole, normPhone, last10, waConfigured };
