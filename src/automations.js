// Automation & notification engine (scheduled triggers). Event triggers live in leads.js / workflows.js.
const cron = require('node-cron');
const { q, one, getSettings } = require('./db');
const { sendWhatsApp, notifyUser, notifyRole } = require('./notify');
const { captureLead } = require('./leads');
const { isOn, bump, payLink, inr, baseUrl } = require('./workflows');

const DEFAULTS = [
  ['wa_lead_capture', 'WhatsApp → lead', 'Every new chat / ad click becomes a lead; chatbot captures need, name, city', 'Incoming WhatsApp message from unknown number', 'Chatbot → create lead → assign'],
  ['auto_assign', 'Auto-assign', 'Round-robin by category (set categories per salesperson in Team)', 'New lead from any channel', 'Assign salesperson + alert + first follow-up in 30 min'],
  ['new_lead_notify', 'New lead alert', 'Owner and assigned salesperson notified instantly', 'New lead', 'In-app + optional WhatsApp alert'],
  ['followup_reminders', 'Follow-up reminders', 'Salesperson reminded; customer gets WA nudge if no reply in 24 h', 'Follow-up due / overdue', 'Notify salesperson; nudge customer after 24 h overdue'],
  ['quote_approval', 'Quotation approval', 'Discount above limit or margin below minimum needs owner approval', 'Quotation saved by sales', 'Status → pending approval, owner alerted'],
  ['pending_quote_alert', 'Pending quotation', 'Quotes sent 48 h ago without response are flagged', 'Quotation sent, no acceptance in 48 h', 'Notify salesperson + owner'],
  ['quote_to_order', 'Quote → order', 'Accepted quote creates order, reserves stock, sends advance link', 'Quotation accepted / converted', 'Create order + GST invoice, reserve stock, WhatsApp advance link'],
  ['payment_reminders', 'Payment reminders', 'Due date, +3, +7 days with payment link; receipt on payment', 'Invoice due / overdue', 'WhatsApp reminder with payment link'],
  ['low_stock', 'Low stock', 'Below minimum → purchase order suggested to admin', 'Available stock < minimum', 'Owner alert + PO suggestion'],
  ['install_on_paid', 'Install & service', 'Order paid → installation job for technician; customer tracking link', 'Advance received / order confirmed', 'Create job, assign technician, send tracking link'],
  ['service_ticket_alert', 'Pending service ticket', 'Unassigned or open tickets older than 4 h alert the owner', 'Ticket open > 4 h', 'Owner alert'],
  ['amc_reminders', 'AMC & warranty', 'Renewals and warranty-end AMC offers sent automatically', 'AMC ends in 30/15/3 days · warranty ends in 30 days', 'WhatsApp renewal reminder / AMC offer + follow-up lead'],
  ['daily_summary', 'Daily summary', 'Owner gets 9 PM WhatsApp: leads, sales, collection, stock alerts', 'Every day 9 PM', 'WhatsApp summary to owner'],
  ['review_request', 'Review request', 'After installation, ask for Google review', 'Job completed', 'WhatsApp Google review link'],
  ['indiamart_pull', 'IndiaMART sync', 'Pulls IndiaMART enquiries every 10 minutes (needs CRM key)', 'Every 10 min', 'Create leads from IndiaMART'],
  ['email_pull', 'Email enquiries', 'Reads the enquiry inbox via IMAP every 5 minutes', 'Every 5 min', 'Create leads from new emails'],
];

async function seedAutomations() {
  for (const [key, name, description, trigger, action] of DEFAULTS)
    await q(`INSERT INTO automations(key,name,description,trigger,action) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(key) DO UPDATE SET name=$2, description=$3, trigger=$4, action=$5`, [key, name, description, trigger, action]);
}

const safe = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`[automation ${name}]`, e.message); } };

async function followupReminders() {
  if (!(await isOn('followup_reminders'))) return;
  const due = await q(`SELECT f.*, l.name lname, l.phone FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE NOT f.done AND NOT f.reminded AND f.due_at <= now() + interval '10 minutes'`);
  for (const f of due) {
    await notifyUser(f.user_id, `Follow-up due: ${f.lname}`, `${f.type} · ${f.note || ''}`, `/crm#/leads/${f.lead_id}`);
    await q('UPDATE followups SET reminded=true WHERE id=$1', [f.id]);
  }
  // Customer nudge: follow-up overdue by 24 h, no inbound message since
  const s = await getSettings();
  const nudge = await q(`SELECT f.id, l.id lid, l.name, l.phone FROM followups f JOIN leads l ON l.id=f.lead_id
    WHERE NOT f.done AND f.auto_nudge AND f.due_at < now() - interval '24 hours' AND l.stage NOT IN ('won','lost')
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.lead_id=l.id AND m.direction='in' AND m.created_at > f.due_at)`);
  for (const n of nudge) {
    await sendWhatsApp(n.phone, s.wa_tpl_nudge ? { template: s.wa_tpl_nudge, params: [n.name] }
      : { text: `Namaste ${n.name} ji 🙏 aapki requirement ke baare mein koi sawaal ho toh reply karein — ${s.company_name || 'IT Paradise'}` }, { leadId: n.lid, bot: true });
    await q('UPDATE followups SET auto_nudge=false WHERE id=$1', [n.id]);
  }
  if (due.length || nudge.length) await bump('followup_reminders');
}

async function pendingQuotes() {
  if (!(await isOn('pending_quote_alert'))) return;
  const rows = await q(`SELECT qt.*, c.name cname FROM quotations qt LEFT JOIN customers c ON c.id=qt.customer_id
    WHERE qt.status='sent' AND qt.created_at < now() - interval '48 hours' AND NOT EXISTS
    (SELECT 1 FROM notifications n WHERE n.link = '/crm#/quotations/' || qt.id AND n.title LIKE 'Pending quotation%')`);
  for (const r of rows) {
    await notifyUser(r.user_id, `Pending quotation ${r.number}`, `${r.cname} · ${inr(r.total)} — no response in 48 h`, `/crm#/quotations/${r.id}`);
    await notifyRole('owner', `Pending quotation ${r.number}`, `${r.cname} · ${inr(r.total)}`, `/crm#/quotations/${r.id}`);
  }
  if (rows.length) await bump('pending_quote_alert');
}

async function pendingTickets() {
  if (!(await isOn('service_ticket_alert'))) return;
  const rows = await q(`SELECT * FROM jobs WHERE kind='service' AND status IN ('open','assigned') AND created_at < now() - interval '4 hours'
    AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.title = 'Pending ticket ' || jobs.number)`);
  for (const r of rows) await notifyRole('owner', `Pending ticket ${r.number}`, r.issue || r.title || '', '/crm#/service');
  if (rows.length) await bump('service_ticket_alert');
}

async function paymentReminders() {
  if (!(await isOn('payment_reminders'))) return;
  const s = await getSettings();
  const rows = await q(`SELECT i.*, c.name cname, c.phone, (CURRENT_DATE - i.due_date) od FROM invoices i JOIN customers c ON c.id=i.customer_id
    WHERE i.total - i.paid > 1 AND (CURRENT_DATE - i.due_date) IN (0,3,7,15,30)`);
  for (const r of rows) {
    const due = r.total - r.paid;
    const link = await payLink(r.order_id);
    const text = r.od === 0
      ? `🙏 Namaste ${r.cname} ji, invoice ${r.number} ka ${inr(due)} aaj due hai. Pay karein: ${link} (UPI / card / netbanking) — ${s.company_name || 'IT Paradise'}`
      : `🙏 Namaste ${r.cname} ji, invoice ${r.number} ka ${inr(due)} ${r.od} din se pending hai. Pay karein: ${link} (UPI / card / netbanking) — ${s.company_name || 'IT Paradise'}`;
    await sendWhatsApp(r.phone, s.wa_tpl_payment ? { template: s.wa_tpl_payment, params: [r.cname, r.number, inr(due), link] } : { text });
  }
  if (rows.length) await bump('payment_reminders');
}

async function lowStock() {
  if (!(await isOn('low_stock'))) return;
  const rows = await q(`SELECT name, stock - reserved avail, min_stock FROM products WHERE min_stock > 0 AND stock - reserved < min_stock`);
  if (rows.length) {
    await notifyRole('owner', `${rows.length} items below minimum stock`, rows.slice(0, 5).map(r => `${r.name} (${r.avail}/${r.min_stock})`).join(', '), '/crm#/stock');
    await bump('low_stock');
  }
}

async function amcReminders() {
  if (!(await isOn('amc_reminders'))) return;
  const s = await getSettings();
  const amcs = await q(`SELECT a.*, c.name cname, c.phone, (a.end_date - CURRENT_DATE) left_days FROM amcs a JOIN customers c ON c.id=a.customer_id
    WHERE a.status='active' AND (a.end_date - CURRENT_DATE) IN (30,15,3)`);
  for (const a of amcs) {
    await sendWhatsApp(a.phone, s.wa_tpl_amc ? { template: s.wa_tpl_amc, params: [a.cname, a.title, String(a.left_days)] }
      : { text: `🙏 ${a.cname} ji, aapka AMC (${a.title}) ${a.left_days} din mein expire ho raha hai. Renew karne ke liye reply karein — ${s.company_name || 'IT Paradise'}` });
    if (a.left_days === 30) await captureLead({ name: a.cname, phone: a.phone, need: `AMC renewal — ${a.title}`, source: 'reference', source_detail: 'AMC renewal', value: a.amount });
  }
  await q(`UPDATE amcs SET status='expired' WHERE status='active' AND end_date < CURRENT_DATE`);
  // Warranty ending in 30 days → AMC offer
  const w = await q(`SELECT DISTINCT c.id, c.name, c.phone FROM serials s JOIN customers c ON c.id=s.customer_id WHERE s.warranty_until = CURRENT_DATE + 30`);
  for (const c of w) await sendWhatsApp(c.phone, { text: `${c.name} ji, aapke products ki warranty 30 din mein khatam ho rahi hai. Tension-free service ke liye hamara AMC plan lein — reply "AMC" — ${s.company_name || 'IT Paradise'}` });
  // Preventive visits: create a job per active AMC per quarter if none in last (365/visits) days
  const prev = await q(`SELECT a.* FROM amcs a WHERE a.status='active' AND a.visits_per_year > 0 AND NOT EXISTS
    (SELECT 1 FROM jobs j WHERE j.amc_id=a.id AND j.created_at > now() - (365 / a.visits_per_year || ' days')::interval)`);
  const { nextNumber } = require('./db');
  for (const a of prev) await q(`INSERT INTO jobs(number,kind,customer_id,amc_id,title,coverage,status) VALUES($1,'preventive',$2,$3,$4,'amc','open')`,
    [await nextNumber('ITP-T'), a.customer_id, a.id, `Preventive visit — ${a.title}`]);
  if (amcs.length || w.length || prev.length) await bump('amc_reminders');
}

async function dailySummary() {
  if (!(await isOn('daily_summary'))) return;
  const s = await getSettings();
  const t = await one(`SELECT
    (SELECT count(*) FROM leads WHERE created_at::date=CURRENT_DATE) leads,
    (SELECT count(*) FROM leads WHERE stage='won' AND updated_at::date=CURRENT_DATE) won,
    (SELECT coalesce(sum(total),0) FROM orders WHERE created_at::date=CURRENT_DATE) sales,
    (SELECT coalesce(sum(amount),0) FROM payments WHERE date=CURRENT_DATE) coll,
    (SELECT count(*) FROM followups WHERE NOT done AND due_at < now()) overdue,
    (SELECT count(*) FROM products WHERE min_stock>0 AND stock-reserved<min_stock) low,
    (SELECT count(*) FROM jobs WHERE status NOT IN ('completed','closed','cancelled')) jobs`);
  const text = `📊 ${s.company_name || 'IT Paradise'} — aaj ka summary\nLeads: ${t.leads} · Won: ${t.won}\nSales: ${inr(t.sales)} · Collection: ${inr(t.coll)}\nOverdue follow-ups: ${t.overdue}\nOpen jobs: ${t.jobs} · Low stock: ${t.low}`;
  const owners = await q(`SELECT id, phone FROM users WHERE role='owner' AND active`);
  for (const o of owners) { await notifyUser(o.id, 'Daily summary', text, '/crm#/'); if (o.phone) await sendWhatsApp(o.phone, { text }); }
  await bump('daily_summary');
}

// ---- Channel pulls -------------------------------------------------------
function imDate(d) { // IndiaMART format: 25-Nov-2026 11:00:00
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n) => String(n).padStart(2, '0');
  const ist = new Date(d.getTime() + 330 * 60000);
  return `${p(ist.getUTCDate())}-${m[ist.getUTCMonth()]}-${ist.getUTCFullYear()}${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}
async function ingestIndiaMart(r) {
  return captureLead({
    name: r.SENDER_NAME || 'IndiaMART buyer', phone: r.SENDER_MOBILE, email: r.SENDER_EMAIL, company: r.SENDER_COMPANY, city: r.SENDER_CITY,
    need: [r.QUERY_PRODUCT_NAME, r.SUBJECT, r.QUERY_MESSAGE].filter(Boolean).join(' — ').slice(0, 1000),
    source: 'indiamart', source_detail: r.QUERY_TYPE === 'B' ? 'Buy-lead' : r.QUERY_TYPE === 'P' ? 'Call (PNS)' : 'Direct enquiry', external_id: r.UNIQUE_QUERY_ID,
  });
}
async function indiamartPull() {
  const s = await getSettings();
  if (!s.indiamart_key || !(await isOn('indiamart_pull'))) return;
  const end = new Date(); const start = new Date(end.getTime() - 30 * 60000);
  const url = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(s.indiamart_key)}&start_time=${imDate(start)}&end_time=${imDate(end)}`;
  const r = await fetch(url); const j = await r.json().catch(() => ({}));
  if (j.STATUS === 'SUCCESS' && Array.isArray(j.RESPONSE)) { for (const x of j.RESPONSE) await ingestIndiaMart(x); if (j.RESPONSE.length) await bump('indiamart_pull'); }
}

let imapBusy = false;
async function emailPull() {
  const s = await getSettings();
  if (!s.imap_host || !s.imap_user || imapBusy || !(await isOn('email_pull'))) return;
  imapBusy = true;
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const client = new ImapFlow({ host: s.imap_host, port: +s.imap_port || 993, secure: true, auth: { user: s.imap_user, pass: s.imap_pass }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false });
      for (const uid of (uids || []).slice(0, 25)) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: false });
        const m = await simpleParser(msg.source);
        const from = (m.from && m.from.value && m.from.value[0]) || {};
        const body = (m.text || '').slice(0, 2000);
        const phone = (body.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/) || [])[0];
        await captureLead({ name: from.name || from.address, email: from.address, phone, need: `${m.subject || ''} — ${body.slice(0, 400)}`, source: 'email', source_detail: m.subject, external_id: m.messageId });
        await client.messageFlagsAdd(uid, ['\\Seen']);
      }
      if (uids && uids.length) await bump('email_pull');
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { console.error('[imap]', e.message); } finally { imapBusy = false; }
}

function start() {
  const tz = { timezone: 'Asia/Kolkata' };
  cron.schedule('*/5 * * * *', safe('followups', followupReminders), tz);
  cron.schedule('*/5 * * * *', safe('email', emailPull), tz);
  cron.schedule('*/10 * * * *', safe('indiamart', indiamartPull), tz);
  cron.schedule('15 * * * *', safe('pendingQuotes', pendingQuotes), tz);
  cron.schedule('30 * * * *', safe('pendingTickets', pendingTickets), tz);
  cron.schedule('0 10 * * *', safe('payments', paymentReminders), tz);
  cron.schedule('5 10 * * *', safe('amc', amcReminders), tz);
  cron.schedule('0 11 * * *', safe('lowStock', lowStock), tz);
  cron.schedule('0 21 * * *', safe('daily', dailySummary), tz);
}

module.exports = { start, seedAutomations, ingestIndiaMart, jobs: { followupReminders, pendingQuotes, pendingTickets, paymentReminders, lowStock, amcReminders, dailySummary, indiamartPull, emailPull } };
