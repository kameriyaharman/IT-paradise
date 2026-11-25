// Core business workflows: quotation → order → stock → invoice → payment → installation → warranty/AMC
const crypto = require('crypto');
const { q, one, tx, nextNumber, getSettings } = require('./db');
const { sendWhatsApp, notifyUser, notifyRole } = require('./notify');
const { addActivity } = require('./leads');

const isOn = async (key) => { const a = await one('SELECT enabled FROM automations WHERE key=$1', [key]); return !a || a.enabled; };
const bump = (key) => q('UPDATE automations SET runs=runs+1,last_run=now() WHERE key=$1', [key]);
const baseUrl = async () => { const u = (await getSettings()).public_url; return (u && !/healthcheck|localhost/.test(u) ? u : '') || process.env.PUBLIC_URL || ''; };
const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');

function computeTotals(items, discount = 0) {
  const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.rate || 0), 0);
  const disc = Math.min(+discount || 0, sub);
  const f = sub ? (sub - disc) / sub : 1;
  let gst = 0, cost = 0;
  for (const i of items) {
    const amt = (+i.qty || 0) * (+i.rate || 0);
    i.amount = amt;
    gst += amt * f * ((i.gst_rate == null ? 18 : +i.gst_rate) / 100);
    cost += (+i.qty || 0) * (+i.buy_rate || 0);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return { subtotal: round(sub), discount: round(disc), gst: round(gst), total: Math.round(sub - disc + gst), margin: round(sub - disc - cost) };
}

async function saveQuotation(data, user) {
  const s = await getSettings();
  const items = (data.items || []).filter(i => i.description || i.product_id);
  for (const i of items) {
    if (i.product_id) {
      const p = await one('SELECT name,price,buy_price,gst_rate FROM products WHERE id=$1', [i.product_id]);
      if (p) { i.description = i.description || p.name; i.buy_rate = +p.buy_price || 0; if (i.gst_rate == null) i.gst_rate = +p.gst_rate; if (i.rate == null || i.rate === '') i.rate = +p.price; }
    }
  }
  const t = computeTotals(items, data.discount);
  // Discount / margin control: sales users above the limit need owner approval
  const maxDisc = +(s.max_discount_pct || 10);
  const minMargin = +(s.min_margin_pct || 8);
  const discPct = t.subtotal ? (t.discount / t.subtotal) * 100 : 0;
  const marginPct = t.subtotal ? (t.margin / (t.subtotal - t.discount || 1)) * 100 : 100;
  const needsApproval = user.role !== 'owner' && (await isOn('quote_approval')) && (discPct > maxDisc || marginPct < minMargin);
  let lead = data.lead_id ? await one('SELECT * FROM leads WHERE id=$1', [data.lead_id]) : null;
  let customerId = data.customer_id || (lead && lead.customer_id);

  return tx(async (c) => {
    let qt;
    if (data.id) {
      const old = await c.one('SELECT * FROM quotations WHERE id=$1', [data.id]);
      if (!old) throw new Error('Quotation not found');
      if (user.role === 'sales' && old.user_id !== user.id) throw Object.assign(new Error('Not your quotation'), { status: 403 });
      if (['converted'].includes(old.status)) throw new Error('Converted quotation cannot be edited');
      qt = await c.one(`UPDATE quotations SET customer_id=$2,template=$3,validity_days=$4,payment_terms=$5,warranty=$6,notes=$7,subtotal=$8,discount=$9,gst=$10,total=$11,margin=$12,
        status=$13, version=version+1 WHERE id=$1 RETURNING *`,
        [data.id, customerId, data.template, data.validity_days || 7, data.payment_terms, data.warranty, data.notes, t.subtotal, t.discount, t.gst, t.total, t.margin,
          needsApproval ? 'pending_approval' : (old.status === 'pending_approval' || old.status === 'draft' ? 'draft' : old.status)]);
      await c.q('DELETE FROM quotation_items WHERE quotation_id=$1', [qt.id]);
    } else {
      const number = await nextNumber('QT', { dated: true });
      qt = await c.one(`INSERT INTO quotations(number,lead_id,customer_id,user_id,template,validity_days,payment_terms,warranty,notes,subtotal,discount,gst,total,margin,status,token)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [number, data.lead_id || null, customerId, user.id, data.template, data.validity_days || 7, data.payment_terms || '50% advance', data.warranty || '1 year', data.notes,
          t.subtotal, t.discount, t.gst, t.total, t.margin, needsApproval ? 'pending_approval' : 'draft', crypto.randomBytes(9).toString('hex')]);
    }
    for (const i of items)
      await c.q('INSERT INTO quotation_items(quotation_id,product_id,description,qty,rate,buy_rate,gst_rate,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [qt.id, i.product_id || null, i.description, +i.qty || 1, +i.rate || 0, +i.buy_rate || 0, i.gst_rate == null ? 18 : +i.gst_rate, i.amount]);
    if (lead) {
      await c.q(`UPDATE leads SET value=$2, stage=CASE WHEN stage IN ('new','contacted','demo') THEN 'quotation' ELSE stage END, updated_at=now() WHERE id=$1`, [lead.id, t.total]);
    }
    return qt;
  }).then(async (qt) => {
    if (lead) await addActivity(lead.id, 'quote', `Quotation ${qt.number} ${data.id ? 'revised' : 'created'} (${inr(qt.total)})`, user.id, { quotation_id: qt.id });
    if (qt.status === 'pending_approval') await notifyRole('owner', `Quotation ${qt.number} needs approval`, `Discount ${discPct.toFixed(1)}% · margin ${marginPct.toFixed(1)}% · ${inr(qt.total)}`, `/crm#/quotations/${qt.id}`);
    return qt;
  });
}

async function sendQuotation(id, user, channel = 'whatsapp') {
  const qt = await one('SELECT * FROM quotations WHERE id=$1', [id]);
  if (!qt) throw new Error('Not found');
  if (qt.status === 'pending_approval') throw new Error('Waiting for owner approval');
  const c = await one('SELECT * FROM customers WHERE id=$1', [qt.customer_id]);
  const url = `${await baseUrl()}/q/${qt.token}`;
  let r = { ok: false };
  const s = await getSettings();
  if (channel === 'email') {
    const { sendEmail } = require('./notify');
    r = await sendEmail(c && c.email, `Quotation ${qt.number} — ${s.company_name || 'IT Paradise'}`, `Dear ${c ? c.name : 'Customer'},\n\nPlease find your quotation ${qt.number} for ${inr(qt.total)} here:\n${url}\n\nRegards,\n${user.name}\n${s.company_name || 'IT Paradise'}`);
  } else {
    r = await sendWhatsApp(c && c.phone, s.wa_tpl_quote ? { template: s.wa_tpl_quote, params: [c.name, qt.number, inr(qt.total), url] }
      : { text: `Namaste ${c ? c.name : ''} ji 🙏\nAapka quotation ${qt.number} (${inr(qt.total)}) yahan dekhein: ${url}\n— ${user.name}, ${s.company_name || 'IT Paradise'}` }, { leadId: qt.lead_id, userId: user.id });
  }
  await q(`UPDATE quotations SET status=CASE WHEN status IN ('draft','approved') THEN 'sent' ELSE status END WHERE id=$1`, [id]);
  if (qt.lead_id) await addActivity(qt.lead_id, 'quote', `Quotation ${qt.number} sent on ${channel}`, user.id);
  return { ...r, url };
}

async function convertToOrder(qid, user) {
  const qt = await one('SELECT * FROM quotations WHERE id=$1', [qid]);
  if (!qt) throw new Error('Quotation not found');
  if (qt.status === 'converted') { const o = await one('SELECT * FROM orders WHERE quotation_id=$1', [qid]); return o; }
  if (qt.status === 'pending_approval') throw new Error('Quotation needs owner approval first');
  const items = await q('SELECT * FROM quotation_items WHERE quotation_id=$1', [qid]);
  const pct = parseInt(String(qt.payment_terms || '').match(/(\d+)\s*%/)?.[1] || '0');
  const advance = Math.round(qt.total * pct / 100);
  const order = await tx(async (c) => {
    const number = await nextNumber('SO');
    const o = await c.one(`INSERT INTO orders(number,quotation_id,lead_id,customer_id,user_id,subtotal,discount,gst,total,margin,advance_required,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [number, qid, qt.lead_id, qt.customer_id, qt.user_id || user.id, qt.subtotal, qt.discount, qt.gst, qt.total, qt.margin, advance, advance > 0 ? 'waiting_payment' : 'confirmed']);
    for (const i of items) {
      await c.q('INSERT INTO order_items(order_id,product_id,description,qty,rate,buy_rate,gst_rate,amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [o.id, i.product_id, i.description, i.qty, i.rate, i.buy_rate, i.gst_rate, i.amount]);
      if (i.product_id) await c.q('UPDATE products SET reserved=reserved+$2 WHERE id=$1', [i.product_id, i.qty]); // stock reservation
    }
    await c.q(`UPDATE quotations SET status='converted' WHERE id=$1`, [qid]);
    if (qt.lead_id) await c.q(`UPDATE leads SET stage='won', updated_at=now() WHERE id=$1`, [qt.lead_id]);
    // GST invoice
    const invNo = await nextNumber('GST', { offset: 1000 });
    await c.q('INSERT INTO invoices(number,order_id,customer_id,due_date,subtotal,gst,total) VALUES($1,$2,$3,CURRENT_DATE + 7,$4,$5,$6)',
      [invNo, o.id, qt.customer_id, qt.subtotal - qt.discount, qt.gst, qt.total]);
    return o;
  });
  await bump('quote_to_order');
  if (qt.lead_id) await addActivity(qt.lead_id, 'stage', `Won → order ${order.number} created, stock reserved`, user.id);
  await notifyRole('owner', `New order ${order.number}`, `${inr(order.total)}`, `/crm#/orders`);
  if (advance > 0 && (await isOn('quote_to_order'))) {
    const c = await one('SELECT * FROM customers WHERE id=$1', [order.customer_id]);
    const s = await getSettings();
    await sendWhatsApp(c && c.phone, { text: `Dhanyavaad ${c ? c.name : ''} ji! Order ${order.number} confirm karne ke liye advance ${inr(advance)} pay karein: ${await payLink(order.id)} ${s.upi_id ? '\nUPI: ' + s.upi_id : ''}` }, { leadId: order.lead_id });
  } else if (advance === 0) await createInstallJob(order.id);
  return order;
}

async function payLink(orderId) {
  const inv = await one('SELECT number FROM invoices WHERE order_id=$1 ORDER BY id LIMIT 1', [orderId]);
  const s = await getSettings();
  if (s.payment_link_base) return s.payment_link_base.replace('{invoice}', inv ? inv.number : orderId);
  return `${await baseUrl()}/pay/${inv ? inv.number : orderId}`;
}

async function createInstallJob(orderId) {
  const exists = await one(`SELECT id FROM jobs WHERE order_id=$1 AND kind='installation'`, [orderId]);
  if (exists) return exists;
  if (!(await isOn('install_on_paid'))) return null;
  const o = await one('SELECT o.*, c.name cname, c.address, c.city, c.phone FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=$1', [orderId]);
  const items = await q('SELECT description, qty FROM order_items WHERE order_id=$1', [orderId]);
  const checklist = items.map(i => ({ t: `Install ${i.qty} × ${i.description}`, done: false }))
    .concat([{ t: 'Configure & test', done: false }, { t: 'Mobile app / user setup for customer', done: false }, { t: 'Photos + OTP sign-off', done: false }]);
  // Pick technician with fewest open jobs
  const tech = await one(`SELECT u.id FROM users u LEFT JOIN jobs j ON j.technician_id=u.id AND j.status NOT IN ('completed','closed','cancelled')
    WHERE u.role='tech' AND u.active GROUP BY u.id ORDER BY count(j.id), u.id LIMIT 1`);
  const number = await nextNumber('JOB');
  const job = await one(`INSERT INTO jobs(number,kind,order_id,customer_id,title,technician_id,status,checklist,address,phone,otp,track_token,coverage,scheduled_at)
    VALUES($1,'installation',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paid', now() + interval '1 day') RETURNING *`,
    [number, orderId, o.customer_id, `Install — ${o.cname}`, tech ? tech.id : null, tech ? 'assigned' : 'open', JSON.stringify(checklist),
      [o.address, o.city].filter(Boolean).join(', '), o.phone, String(Math.floor(1000 + Math.random() * 9000)), crypto.randomBytes(8).toString('hex')]);
  await q(`UPDATE orders SET status='scheduled', technician_id=$2, delivery_date=CURRENT_DATE + 1 WHERE id=$1 AND status IN ('confirmed','waiting_payment')`, [orderId, tech ? tech.id : null]);
  await bump('install_on_paid');
  if (tech) await notifyUser(tech.id, `New installation job ${number}`, job.title, `/app#/jobs/${job.id}`);
  await notifyRole('owner', `Installation job ${number} created`, job.title, `/crm#/service`);
  sendWhatsApp(o.phone, { text: `Aapka installation ${number} schedule ho gaya hai. Track karein: ${await baseUrl()}/track/${job.track_token}` }, { leadId: o.lead_id }).catch(() => {});
  return job;
}

async function recordPayment(data, user) {
  let inv = data.invoice_id ? await one('SELECT * FROM invoices WHERE id=$1', [data.invoice_id]) : null;
  if (!inv && data.order_id) inv = await one('SELECT * FROM invoices WHERE order_id=$1 ORDER BY id LIMIT 1', [data.order_id]);
  const amount = +data.amount;
  if (!(amount > 0)) throw new Error('Amount required');
  const orderId = data.order_id || (inv && inv.order_id);
  const order = orderId ? await one('SELECT * FROM orders WHERE id=$1', [orderId]) : null;
  const custId = data.customer_id || (inv && inv.customer_id) || (order && order.customer_id);
  const number = await nextNumber('RCPT');
  const p = await one(`INSERT INTO payments(number,invoice_id,order_id,customer_id,amount,mode,reference,kind,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [number, inv ? inv.id : null, orderId || null, custId, amount, data.mode || 'UPI', data.reference || null, data.kind || 'payment', user ? user.id : null]);
  if (inv) await q('UPDATE invoices SET paid=paid+$2 WHERE id=$1', [inv.id, amount]);
  if (order) {
    const paid = (await one('SELECT coalesce(sum(amount),0) s FROM payments WHERE order_id=$1', [order.id])).s;
    if (order.status === 'waiting_payment' && +paid >= +order.advance_required) {
      await q(`UPDATE orders SET status='confirmed' WHERE id=$1`, [order.id]);
      await createInstallJob(order.id);
    }
    if (order.lead_id) await addActivity(order.lead_id, 'payment', `Payment ${inr(amount)} received (${data.mode || 'UPI'})`, user && user.id);
  }
  const c = custId ? await one('SELECT * FROM customers WHERE id=$1', [custId]) : null;
  if (c && data.send_receipt !== false)
    sendWhatsApp(c.phone, { text: `🙏 ${c.name} ji, ${inr(amount)} ka payment mil gaya. Receipt: ${await baseUrl()}/r/${p.id}-${(p.number || '').slice(-4)} — ${(await getSettings()).company_name || 'IT Paradise'}` }).catch(() => {});
  await notifyRole('owner', `Payment received ${inr(amount)}`, `${c ? c.name : ''} · ${data.mode || 'UPI'}`, `/crm#/payments`);
  return p;
}

// Delivery: stock out against order, release reservation, link serials
async function deliverOrder(orderId, items, user) {
  const o = await one('SELECT * FROM orders WHERE id=$1', [orderId]);
  if (!o) throw new Error('Order not found');
  const lines = await q('SELECT * FROM order_items WHERE order_id=$1', [orderId]);
  await tx(async (c) => {
    for (const l of lines) {
      const want = items ? +((items.find(x => +x.id === l.id) || {}).qty || 0) : (+l.qty - +l.delivered_qty);
      if (!want || !l.product_id) continue;
      await c.q('UPDATE products SET stock=stock-$2, reserved=GREATEST(0,reserved-$2) WHERE id=$1', [l.product_id, want]);
      await c.q('UPDATE order_items SET delivered_qty=delivered_qty+$2 WHERE id=$1', [l.id, want]);
      await c.q(`INSERT INTO stock_moves(product_id,qty,kind,ref,user_id) VALUES($1,$2,'out',$3,$4)`, [l.product_id, -want, o.number, user && user.id]);
    }
  });
  const after = await q('SELECT qty, delivered_qty FROM order_items WHERE order_id=$1', [orderId]);
  const full = after.every(r => +r.delivered_qty >= +r.qty);
  await q(`UPDATE orders SET status=$2 WHERE id=$1 AND status NOT IN ('completed','cancelled')`, [orderId, full ? 'delivered' : 'partially_delivered']);
  return { full };
}

async function linkSerial(serial, jobId, user) {
  serial = String(serial || '').trim().toUpperCase();
  if (!serial) throw new Error('Serial required');
  const job = await one('SELECT * FROM jobs WHERE id=$1', [jobId]);
  if (!job) throw new Error('Job not found');
  let s = await one('SELECT * FROM serials WHERE upper(serial)=$1', [serial]);
  const order = job.order_id ? await one('SELECT * FROM orders WHERE id=$1', [job.order_id]) : null;
  let productId = s ? s.product_id : null;
  if (!productId && order) {
    const line = await one(`SELECT oi.product_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 AND p.serial_tracked
      ORDER BY (SELECT count(*) FROM serials x WHERE x.order_id=$1 AND x.product_id=oi.product_id) - oi.qty LIMIT 1`, [order.id]);
    productId = line && line.product_id;
  }
  const wm = productId ? ((await one('SELECT warranty_months FROM products WHERE id=$1', [productId])) || {}).warranty_months || 12 : 12;
  if (s && s.order_id && order && s.order_id !== order.id) throw new Error(`Serial already sold on another order`);
  if (s) {
    s = await one(`UPDATE serials SET order_id=$2, customer_id=$3, status='sold', sold_at=CURRENT_DATE, warranty_until=CURRENT_DATE + ($4 || ' months')::interval, job_id=$5 WHERE id=$1 RETURNING *`,
      [s.id, order && order.id, job.customer_id, wm, jobId]);
  } else {
    s = await one(`INSERT INTO serials(serial,product_id,order_id,customer_id,status,sold_at,warranty_until,job_id) VALUES($1,$2,$3,$4,'sold',CURRENT_DATE, CURRENT_DATE + ($5 || ' months')::interval,$6) RETURNING *`,
      [serial, productId, order && order.id, job.customer_id, wm, jobId]);
  }
  return s;
}

async function completeJob(jobId, data, user) {
  const job = await one('SELECT * FROM jobs WHERE id=$1', [jobId]);
  if (!job) throw new Error('Job not found');
  const s = await getSettings();
  if (s.require_otp !== '0' && job.otp && String(data.otp || '') !== String(job.otp) && !data.signature_id)
    throw Object.assign(new Error('Invalid customer OTP'), { status: 400 });
  await q(`UPDATE jobs SET status='completed', completed_at=now(), otp_verified=$2, signature_id=coalesce($3,signature_id) WHERE id=$1`, [jobId, String(data.otp || '') === String(job.otp), data.signature_id || null]);
  if (+data.collect > 0) {
    await recordPayment({ order_id: job.order_id, customer_id: job.customer_id, amount: data.collect, mode: data.mode || 'Cash', kind: 'collection' }, user);
    await q('UPDATE jobs SET collected=collected+$2 WHERE id=$1', [jobId, +data.collect]);
  }
  if (job.order_id) {
    await deliverOrder(job.order_id, null, user).catch(() => {});
    await q(`UPDATE orders SET status='completed' WHERE id=$1`, [job.order_id]);
  }
  const c = job.customer_id ? await one('SELECT * FROM customers WHERE id=$1', [job.customer_id]) : null;
  if (c) {
    await sendWhatsApp(c.phone, { text: `✅ ${c.name} ji, aapka ${job.kind === 'installation' ? 'installation' : 'service'} ${job.number} complete ho gaya hai. Dhanyavaad!` });
    if (await isOn('review_request') && s.google_review_url) {
      await sendWhatsApp(c.phone, { text: `Hamari service kaisi lagi? 1 minute mein Google review dein 🙏 ${s.google_review_url}` });
      await bump('review_request');
    }
  }
  await notifyRole('owner', `Job ${job.number} completed`, job.title || '', `/crm#/service`);
  return one('SELECT * FROM jobs WHERE id=$1', [jobId]);
}

async function stockIn({ supplier_id, po_id, bill_no, bill_date, items, paid }, user) {
  const t = computeTotals(items.map(i => ({ qty: i.qty, rate: i.rate, gst_rate: i.gst_rate == null ? 18 : i.gst_rate })));
  return tx(async (c) => {
    const number = await nextNumber('PB');
    const pb = await c.one(`INSERT INTO purchases(number,supplier_id,po_id,bill_no,bill_date,subtotal,gst,total,paid) VALUES($1,$2,$3,$4,coalesce($5,CURRENT_DATE),$6,$7,$8,$9) RETURNING *`,
      [number, supplier_id || null, po_id || null, bill_no || null, bill_date || null, t.subtotal, t.gst, t.total, +paid || 0]);
    for (const i of items) {
      const serials = (Array.isArray(i.serials) ? i.serials : String(i.serials || '').split(/[\s,]+/)).map(x => x.trim().toUpperCase()).filter(Boolean);
      await c.q('INSERT INTO purchase_items(purchase_id,product_id,qty,rate,gst_rate,serials) VALUES($1,$2,$3,$4,$5,$6)', [pb.id, i.product_id, +i.qty, +i.rate, i.gst_rate == null ? 18 : +i.gst_rate, serials]);
      await c.q('UPDATE products SET stock=stock+$2, buy_price=CASE WHEN $3>0 THEN $3 ELSE buy_price END, updated_at=now() WHERE id=$1', [i.product_id, +i.qty, +i.rate]);
      await c.q(`INSERT INTO stock_moves(product_id,qty,kind,ref,user_id) VALUES($1,$2,'in',$3,$4)`, [i.product_id, +i.qty, number, user && user.id]);
      for (const sn of serials)
        await c.q(`INSERT INTO serials(serial,product_id,purchase_id,status,purchased_at) VALUES($1,$2,$3,'in_stock',CURRENT_DATE) ON CONFLICT(serial) DO NOTHING`, [sn, i.product_id, pb.id]);
    }
    if (po_id) await c.q(`UPDATE purchase_orders SET status='received' WHERE id=$1`, [po_id]);
    if (+paid > 0) await c.q('INSERT INTO supplier_payments(supplier_id,purchase_id,amount,mode) VALUES($1,$2,$3,$4)', [supplier_id, pb.id, +paid, 'Bank']);
    return pb;
  });
}

module.exports = { computeTotals, saveQuotation, sendQuotation, convertToOrder, recordPayment, deliverOrder, createInstallJob, linkSerial, completeJob, stockIn, payLink, isOn, bump, inr, baseUrl };
