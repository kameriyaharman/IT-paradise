// Central lead capture used by every channel (website, WhatsApp, Meta, IndiaMART, Google, LinkedIn, email, calls, manual).
const { q, one } = require('./db');
const { normPhone, last10, notifyUser, notifyRole } = require('./notify');

const CAT_KEYWORDS = {
  'video-surveillance': ['cctv', 'camera', 'cam', 'nvr', 'dvr', 'ptz', 'surveillance', 'dome', 'bullet'],
  'business-computing': ['laptop', 'desktop', 'computer', 'pc', 'workstation', 'monitor', 'lab'],
  'enterprise-networking': ['wifi', 'wi-fi', 'router', 'switch', 'network', 'rack', 'cabling', 'firewall', 'lan'],
  'access-attendance': ['attendance', 'biometric', 'face', 'fingerprint', 'rfid', 'door', 'access'],
  'power-backup': ['ups', 'inverter', 'battery', 'power', 'kva'],
  'print-display': ['printer', 'projector', 'panel', 'display', 'mfp', 'print', 'tv'],
};
function detectCategory(text) {
  const t = String(text || '').toLowerCase();
  let best = null, bestN = 0;
  for (const [slug, words] of Object.entries(CAT_KEYWORDS)) {
    const n = words.filter(w => t.includes(w)).length;
    if (n > bestN) { best = slug; bestN = n; }
  }
  return best;
}

const SOURCE_LABEL = {
  website: 'Website', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', indiamart: 'IndiaMART',
  linkedin: 'LinkedIn', google: 'Google', email: 'Email', call: 'Calls', walkin: 'Walk-in', reference: 'Reference', manual: 'Manual',
};

function cleanUtm(u) {
  if (!u || typeof u !== 'object') return {};
  const o = {}; for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'landing']) if (u[k]) o[k] = String(u[k]).slice(0, 300);
  return o;
}
function scoreLead(d) {
  let s = 40;
  if (['website', 'whatsapp', 'indiamart', 'google'].includes(d.source)) s += 10;
  if (d.reference || d.source === 'reference') s += 15;
  const qty = parseInt(String(d.quantity || '').replace(/\D/g, '')) || 0;
  if (qty >= 8) s += 15; else if (qty >= 3) s += 8;
  if (d.company) s += 8;
  if (d.email) s += 4;
  if (d.budget) s += 8;
  if (/urgent|today|asap|jaldi/i.test(d.need || '')) s += 10;
  return Math.min(99, s);
}

async function autoAssignOn() {
  const a = await one(`SELECT enabled FROM automations WHERE key='auto_assign'`);
  return !a || a.enabled;
}

async function pickSalesperson(category) {
  const all = await q(`SELECT id,categories FROM users WHERE role='sales' AND active ORDER BY last_assigned_at NULLS FIRST, id`);
  if (!all.length) return null;
  const match = category ? all.filter(u => (u.categories || '').split(',').map(x => x.trim()).includes(category)) : [];
  const u = (match.length ? match : all)[0];
  await q('UPDATE users SET last_assigned_at=now() WHERE id=$1', [u.id]);
  return u.id;
}

async function addActivity(leadId, type, body, userId, meta) {
  await q('INSERT INTO activities(lead_id,user_id,type,body,meta) VALUES($1,$2,$3,$4,$5)', [leadId, userId || null, type, body, meta || {}]);
}

/**
 * captureLead(data) → { lead, duplicate }
 * data: { name, phone, email, company, city, need, quantity, budget, product_id, category, source, source_detail, external_id, owner_id, userId }
 */
async function captureLead(d) {
  const phone = normPhone(d.phone);
  const email = (d.email || '').trim().toLowerCase() || null;
  const source = d.source || 'manual';

  // Exact replay from the same channel (webhook retries) → ignore
  if (d.external_id) {
    const ex = await one('SELECT * FROM leads WHERE source=$1 AND external_id=$2', [source, String(d.external_id)]);
    if (ex) return { lead: ex, duplicate: true, replay: true };
  }

  // Duplicate detection: open lead with same mobile (last 10 digits) or email in the last 90 days
  let dup = null;
  if (phone || email) {
    dup = await one(`SELECT * FROM leads WHERE stage NOT IN ('won','lost') AND created_at > now() - interval '90 days'
      AND (($1 <> '' AND right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1) OR ($2::text IS NOT NULL AND lower(email)=$2))
      ORDER BY id DESC LIMIT 1`, [last10(phone), email]);
  }
  if (dup) {
    const note = `Repeat enquiry via ${SOURCE_LABEL[source] || source}${d.need ? ': ' + d.need : ''}`;
    await addActivity(dup.id, 'system', note, null, { source, duplicate: true });
    await q(`UPDATE leads SET updated_at=now(), need=CASE WHEN coalesce(need,'')='' THEN $2 ELSE need END,
             email=coalesce(email,$3), company=coalesce(company,$4), city=coalesce(city,$5), score=LEAST(99,score+5) WHERE id=$1`,
      [dup.id, d.need || null, email, d.company || null, d.city || null]);
    if (dup.owner_id) await notifyUser(dup.owner_id, `Repeat enquiry: ${dup.name}`, note, `/crm#/leads/${dup.id}`);
    return { lead: await one('SELECT * FROM leads WHERE id=$1', [dup.id]), duplicate: true };
  }

  // Customer link / create
  let customer = phone ? await one(`SELECT * FROM customers WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1 LIMIT 1`, [last10(phone)]) : null;
  if (!customer && email) customer = await one('SELECT * FROM customers WHERE lower(email)=$1 LIMIT 1', [email]);
  if (!customer) {
    customer = await one('INSERT INTO customers(name,company,phone,email,city) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [d.name || 'Unknown', d.company || null, phone || null, email, d.city || null]);
  }

  let category = d.category || null;
  if (!category && d.product_id) {
    const p = await one('SELECT c.slug FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=$1', [d.product_id]);
    category = p && p.slug;
  }
  if (!category) category = detectCategory(`${d.need || ''} ${d.source_detail || ''}`);

  let owner = d.owner_id || null;
  if (!owner && (await autoAssignOn())) owner = await pickSalesperson(category);

  const score = scoreLead({ ...d, source });
  const priority = score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold';
  const lead = await one(`INSERT INTO leads(customer_id,name,company,phone,email,city,need,category,product_id,quantity,budget,source,source_detail,
     owner_id,score,priority,value,external_id,next_followup_at,utm,page_url,referrer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now() + interval '30 minutes',$19,$20,$21) RETURNING *`,
    [customer.id, d.name || customer.name || 'Unknown', d.company || null, phone || null, email, d.city || null, d.need || null, category,
      d.product_id || null, d.quantity || null, d.budget || null, source, d.source_detail || null, owner, score, priority, +d.value || 0,
      d.external_id ? String(d.external_id) : null, cleanUtm(d.utm), d.page_url ? String(d.page_url).slice(0, 500) : null, d.referrer ? String(d.referrer).slice(0, 500) : null]);

  const u = cleanUtm(d.utm);
  await addActivity(lead.id, 'system', `Lead from ${SOURCE_LABEL[source] || source}${d.source_detail ? ' · ' + d.source_detail : ''}${u.utm_source ? ` · campaign: ${u.utm_source}/${u.utm_medium || '-'}/${u.utm_campaign || '-'}` : ''}${d.page_url ? ' · page: ' + String(d.page_url).replace(/^https?:\/\/[^/]+/, '') : ''}`, d.userId, { source, utm: u });
  if (owner) {
    const u = await one('SELECT name FROM users WHERE id=$1', [owner]);
    await addActivity(lead.id, 'system', d.owner_id ? `Assigned to ${u.name}` : `Auto-assigned to ${u.name} (round-robin)`);
    await q(`INSERT INTO followups(lead_id,user_id,due_at,type,note) VALUES($1,$2, now() + interval '30 minutes','call','First response — reply within 30 minutes')`, [lead.id, owner]);
    await notifyUser(owner, `New lead assigned: ${lead.name}`, `${lead.need || ''} · ${SOURCE_LABEL[source] || source}`, `/crm#/leads/${lead.id}`);
  }
  await notifyRole('owner', `New lead: ${lead.name}`, `${SOURCE_LABEL[source] || source} · ${lead.need || ''}`, `/crm#/leads/${lead.id}`);
  return { lead, duplicate: false };
}

module.exports = { captureLead, detectCategory, addActivity, SOURCE_LABEL, pickSalesperson };
