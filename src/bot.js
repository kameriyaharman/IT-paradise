// WhatsApp inbound handling + lead-capture chatbot (as per CRM design screen 19)
const { q, one, getSettings, nextNumber } = require('./db');
const { sendWhatsApp, normPhone, last10, notifyUser, notifyRole } = require('./notify');
const { captureLead, addActivity } = require('./leads');

const MENU = { '1': 'CCTV', '2': 'Computer / Laptop', '3': 'Networking / Wi-Fi', '4': 'Service / Repair', '5': 'Attendance / Access', '6': 'UPS / Power' };

async function findOpenLead(phone) {
  return one(`SELECT * FROM leads WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1 ORDER BY (stage IN ('won','lost')), id DESC LIMIT 1`, [last10(phone)]);
}

async function handleIncoming({ phone, name, text, waId, referral }) {
  phone = normPhone(phone);
  if (waId) {
    const seen = await one('SELECT id FROM messages WHERE wa_id=$1', [waId]);
    if (seen) return;
  }
  let lead = await findOpenLead(phone);
  await q(`INSERT INTO messages(channel,lead_id,phone,direction,body,wa_id,status) VALUES('whatsapp',$1,$2,'in',$3,$4,'received')`, [lead ? lead.id : null, phone, text, waId || null]);

  if (lead && !['won', 'lost'].includes(lead.stage)) {
    await q('UPDATE leads SET updated_at=now() WHERE id=$1', [lead.id]);
    if (lead.owner_id) await notifyUser(lead.owner_id, `WhatsApp from ${lead.name}`, text.slice(0, 120), `/crm#/inbox/${phone}`);
    return;
  }

  const s = await getSettings();
  const botOn = s.wa_bot_enabled !== '0';
  const sourceDetail = referral ? `Click-to-WA ad${referral.headline ? ': ' + referral.headline : ''}` : 'WhatsApp chat';
  if (!botOn) {
    const r = await captureLead({ name: name || 'WhatsApp user', phone, need: text, source: 'whatsapp', source_detail: sourceDetail });
    await q('UPDATE messages SET lead_id=$1 WHERE phone=$2 AND lead_id IS NULL', [r.lead.id, phone]);
    return;
  }

  let sess = await one('SELECT * FROM bot_sessions WHERE phone=$1 AND updated_at > now() - interval \'1 day\'', [phone]);
  const reply = (t) => sendWhatsApp(phone, { text: t }, { bot: true });
  const company = s.company_name || 'IT Paradise';

  if (!sess) {
    await q(`INSERT INTO bot_sessions(phone,step,data,updated_at) VALUES($1,'need',$2,now()) ON CONFLICT(phone) DO UPDATE SET step='need',data=$2,updated_at=now()`,
      [phone, { first: text, name, sourceDetail }]);
    await reply(`🤖 Namaste! ${company} mein swagat hai. Aapko kis cheez mein madad chahiye?\n\n1️⃣ CCTV  2️⃣ Computer  3️⃣ Networking\n4️⃣ Service  5️⃣ Attendance  6️⃣ UPS / Power\n\n(Number bhejiye ya apni requirement likhiye)`);
    return;
  }
  const data = sess.data || {};
  if (sess.step === 'need') {
    const choice = MENU[text.trim()] || text.trim();
    data.need = choice;
    await q(`UPDATE bot_sessions SET step='details',data=$2,updated_at=now() WHERE phone=$1`, [phone, data]);
    if (MENU[text.trim()] === 'Service / Repair')
      await reply('🤖 Kya problem aa rahi hai? Product, problem aur aapka naam + city bata dijiye.');
    else
      await reply('🤖 Kitni quantity chahiye aur kahan lagana hai? Aapka naam aur city bhi bata dijiye.');
    return;
  }
  if (sess.step === 'details') {
    // Try to parse "…, Name, City" — last two comma parts
    const parts = text.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
    const city = parts.length >= 3 ? parts[parts.length - 1] : null;
    const pname = parts.length >= 2 ? parts[parts.length - (city ? 2 : 1)] : (data.name || name);
    const need = `${data.need}${data.first && !/^\d$/.test(data.first) ? ' — ' + data.first : ''} · ${text}`;
    await q('DELETE FROM bot_sessions WHERE phone=$1', [phone]);
    if (data.need === 'Service / Repair') {
      const cust = await one(`SELECT * FROM customers WHERE right(regexp_replace(coalesce(phone,''),'\\D','','g'),10)=$1`, [last10(phone)]);
      const number = await nextNumber('ITP-T');
      const job = await one(`INSERT INTO jobs(number,kind,customer_id,title,issue,phone,source,status) VALUES($1,'service',$2,$3,$4,$5,'whatsapp','open') RETURNING *`,
        [number, cust ? cust.id : null, `Service request — ${pname || 'WhatsApp'}`, text, phone]);
      await notifyRole('owner', `New service ticket ${number}`, text.slice(0, 100), `/crm#/service`);
      await reply(`✅ Ticket ${number} create ho gaya. Hamara technician jaldi contact karega.`);
      return job;
    }
    const r = await captureLead({ name: pname || name || 'WhatsApp user', phone, city, need, source: 'whatsapp', source_detail: data.sourceDetail });
    await q('UPDATE messages SET lead_id=$1 WHERE phone=$2 AND lead_id IS NULL', [r.lead.id, phone]);
    await addActivity(r.lead.id, 'whatsapp', 'Chatbot captured need, name & city');
    const owner = r.lead.owner_id ? await one('SELECT name FROM users WHERE id=$1', [r.lead.owner_id]) : null;
    await reply(`🙏 Dhanyavaad ${pname || ''}! ${owner ? owner.name + ' (' + company + ')' : 'Hamari team'} 30 minute mein aapko quotation ke saath reply karenge.`);
  }
}

module.exports = { handleIncoming };
