// Branded PDF generation: quotations, GST invoices, payment receipts, purchase orders
const PDFDocument = require('pdfkit');
const path = require('path');
const { q, one, getSettings } = require('./db');

const F = (n) => path.join(__dirname, 'fonts', `Poppins-${n}.ttf`);
const NAVY = '#0B1F44', BLUE = '#1E9BE0', GREY = '#5B6B82', LINE = '#E3E9F2';
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

function words(num) { // Indian numbering amount in words
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = (n) => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let out = '';
  const cr = Math.floor(num / 1e7); num %= 1e7;
  const lk = Math.floor(num / 1e5); num %= 1e5;
  const th = Math.floor(num / 1000); num %= 1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lk) out += two(lk) + ' Lakh ';
  if (th) out += two(th) + ' Thousand ';
  if (num) out += three(num);
  return out.trim();
}

function header(doc, s, title, meta) {
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  doc.roundedRect(40, 26, 44, 44, 9).fill(BLUE);
  doc.fillColor('#fff').font(F('Bold')).fontSize(20).text('Y', 40, 34, { width: 44, align: 'center' });
  doc.fillColor('#fff').font(F('Bold')).fontSize(18).text(s.company_name || 'IT PARADISE', 96, 28);
  doc.fillColor('#7CC8F2').font(F('Medium')).fontSize(7.5).text('TECHNOLOGY. INTEGRATED.', 97, 52, { characterSpacing: 1.5 });
  doc.fillColor('#C8D6EA').font(F('Regular')).fontSize(7.5)
    .text([s.address || 'Bhilwara, Rajasthan', s.phone_sales && ('Ph: ' + s.phone_sales), s.email, s.gstin && ('GSTIN: ' + s.gstin)].filter(Boolean).join('  ·  '), 97, 66, { width: 300 });
  doc.fillColor('#fff').font(F('Bold')).fontSize(16).text(title, 360, 28, { width: 195, align: 'right' });
  doc.font(F('Regular')).fontSize(8.5).fillColor('#C8D6EA');
  meta.forEach((m, i) => doc.text(m, 360, 52 + i * 12, { width: 195, align: 'right' }));
  doc.fillColor(NAVY);
}

function party(doc, y, label, c) {
  doc.font(F('Medium')).fontSize(7.5).fillColor(BLUE).text(label, 40, y, { characterSpacing: 1 });
  doc.font(F('Bold')).fontSize(11).fillColor(NAVY).text(c.name || '-', 40, y + 12);
  doc.font(F('Regular')).fontSize(8.5).fillColor(GREY)
    .text([c.company, c.address, c.city, c.phone && ('Ph: ' + c.phone), c.email, c.gstin && ('GSTIN: ' + c.gstin)].filter(Boolean).join('\n'), 40, y + 28, { width: 260 });
}

function itemsTable(doc, y, items) {
  const cols = [{ k: '#', w: 24 }, { k: 'Item', w: 225 }, { k: 'HSN', w: 50 }, { k: 'Qty', w: 36, r: 1 }, { k: 'Rate', w: 70, r: 1 }, { k: 'GST', w: 36, r: 1 }, { k: 'Amount', w: 74, r: 1 }];
  let x = 40;
  doc.rect(40, y, 515, 22).fill('#EEF5FC');
  doc.font(F('Medium')).fontSize(8).fillColor(NAVY);
  cols.forEach(c => { doc.text(c.k, x + 4, y + 7, { width: c.w - 8, align: c.r ? 'right' : 'left' }); x += c.w; });
  y += 26;
  doc.font(F('Regular')).fontSize(8.5);
  items.forEach((it, i) => {
    const h = Math.max(18, doc.heightOfString(it.description || '', { width: 217 }) + 8);
    if (y + h > 740) { doc.addPage(); y = 50; }
    x = 40;
    const vals = [i + 1, it.description, it.hsn || '', +it.qty, inr(it.rate), (+it.gst_rate || 0) + '%', inr(it.amount)];
    cols.forEach((c, j) => { doc.fillColor(j === 1 ? NAVY : GREY).text(String(vals[j]), x + 4, y + 3, { width: c.w - 8, align: c.r ? 'right' : 'left' }); x += c.w; });
    y += h;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(LINE).lineWidth(0.5).stroke();
  });
  return y + 8;
}

function totals(doc, y, t, interstate) {
  const row = (label, val, bold) => {
    doc.font(F(bold ? 'Bold' : 'Regular')).fontSize(bold ? 11 : 9).fillColor(bold ? NAVY : GREY).text(label, 360, y, { width: 110 });
    doc.text(val, 470, y, { width: 85, align: 'right' }); y += bold ? 20 : 15;
  };
  row('Sub total', inr(t.subtotal));
  if (+t.discount) row('Discount', '- ' + inr(t.discount));
  if (interstate) row('IGST', inr(t.gst));
  else { row('CGST', inr(t.gst / 2)); row('SGST', inr(t.gst / 2)); }
  doc.rect(360, y - 2, 195, 26).fill(NAVY);
  doc.font(F('Bold')).fontSize(11).fillColor('#fff').text('Grand total', 368, y + 5); doc.text(inr(t.total), 470, y + 5, { width: 78, align: 'right' });
  y += 34;
  doc.font(F('Regular')).fontSize(8).fillColor(GREY).text(`Amount in words: Rupees ${words(t.total)} Only`, 40, y, { width: 515 });
  return y + 18;
}

function footer(doc, s, lines) {
  let y = Math.max(doc.y + 10, 640);
  if (y > 700) { doc.addPage(); y = 60; }
  doc.font(F('Medium')).fontSize(8).fillColor(BLUE).text('TERMS', 40, y, { characterSpacing: 1 });
  doc.font(F('Regular')).fontSize(8).fillColor(GREY).text(lines.filter(Boolean).join('\n'), 40, y + 12, { width: 300 });
  if (s.bank_details) doc.text('Bank: ' + s.bank_details, 40, doc.y + 4, { width: 300 });
  doc.font(F('Medium')).fontSize(8.5).fillColor(NAVY).text(`For ${s.company_name || 'IT PARADISE'}`, 380, y + 12, { width: 175, align: 'right' });
  doc.font(F('Regular')).fontSize(7.5).fillColor(GREY).text('Authorised signatory', 380, y + 50, { width: 175, align: 'right' });
}

function stream(res, filename, build) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
  build(doc);
  doc.end();
}

async function quotationPdf(res, id) {
  const s = await getSettings();
  const qt = await one('SELECT * FROM quotations WHERE id=$1', [id]);
  if (!qt) return res.status(404).send('Not found');
  const items = await q('SELECT qi.*, p.hsn FROM quotation_items qi LEFT JOIN products p ON p.id=qi.product_id WHERE quotation_id=$1 ORDER BY qi.id', [id]);
  const c = (await one('SELECT * FROM customers WHERE id=$1', [qt.customer_id])) || {};
  const u = qt.user_id ? await one('SELECT name,phone FROM users WHERE id=$1', [qt.user_id]) : null;
  const d = new Date(qt.created_at); const valid = new Date(d.getTime() + qt.validity_days * 864e5);
  stream(res, `${qt.number}.pdf`, (doc) => {
    header(doc, s, 'QUOTATION', [qt.number + (qt.version > 1 ? ` (v${qt.version})` : ''), 'Date: ' + d.toLocaleDateString('en-IN'), 'Valid till: ' + valid.toLocaleDateString('en-IN')]);
    party(doc, 116, 'QUOTATION FOR', c);
    if (u) { doc.font(F('Medium')).fontSize(7.5).fillColor(BLUE).text('YOUR CONTACT', 380, 116, { width: 175, align: 'right', characterSpacing: 1 });
      doc.font(F('Bold')).fontSize(10).fillColor(NAVY).text(u.name, 380, 128, { width: 175, align: 'right' });
      doc.font(F('Regular')).fontSize(8.5).fillColor(GREY).text(u.phone || '', 380, 143, { width: 175, align: 'right' }); }
    let y = itemsTable(doc, 210, items);
    y = totals(doc, y, qt, false);
    doc.y = y;
    footer(doc, s, [`Payment: ${qt.payment_terms}`, `Warranty: ${qt.warranty}`, `Validity: ${qt.validity_days} days`, 'Prices in INR. GST as applicable.', qt.notes]);
  });
}

async function invoicePdf(res, id) {
  const s = await getSettings();
  const inv = await one('SELECT * FROM invoices WHERE id=$1', [id]);
  if (!inv) return res.status(404).send('Not found');
  const order = await one('SELECT * FROM orders WHERE id=$1', [inv.order_id]);
  const items = await q('SELECT oi.*, p.hsn FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE order_id=$1 ORDER BY oi.id', [inv.order_id]);
  const c = (await one('SELECT * FROM customers WHERE id=$1', [inv.customer_id])) || {};
  const serials = await q('SELECT s.serial, p.name FROM serials s JOIN products p ON p.id=s.product_id WHERE s.order_id=$1', [inv.order_id]);
  const interstate = c.gstin && s.gstin && c.gstin.slice(0, 2) !== s.gstin.slice(0, 2);
  stream(res, `${inv.number}.pdf`, (doc) => {
    header(doc, s, 'TAX INVOICE', [inv.number, 'Date: ' + new Date(inv.date).toLocaleDateString('en-IN'), 'Order: ' + (order ? order.number : '-')]);
    party(doc, 116, 'BILL TO', c);
    let y = itemsTable(doc, 210, items);
    y = totals(doc, y, { subtotal: order ? order.subtotal : inv.subtotal, discount: order ? order.discount : 0, gst: inv.gst, total: inv.total }, interstate);
    doc.font(F('Medium')).fontSize(9).fillColor(NAVY).text(`Paid: ${inr(inv.paid)}    Balance: ${inr(inv.total - inv.paid)}`, 40, y);
    if (serials.length) {
      doc.font(F('Regular')).fontSize(7.5).fillColor(GREY).text('Serial nos: ' + serials.map(x => `${x.serial}`).join(', '), 40, y + 16, { width: 515 });
    }
    doc.y = y + 40;
    footer(doc, s, ['Goods once sold will not be taken back.', 'Warranty as per manufacturer terms.', s.upi_id && `UPI: ${s.upi_id}`, 'Subject to Bhilwara jurisdiction.']);
  });
}

async function receiptPdf(res, id) {
  const s = await getSettings();
  const p = await one('SELECT * FROM payments WHERE id=$1', [id]);
  if (!p) return res.status(404).send('Not found');
  const c = (await one('SELECT * FROM customers WHERE id=$1', [p.customer_id])) || {};
  const inv = p.invoice_id ? await one('SELECT number,total,paid FROM invoices WHERE id=$1', [p.invoice_id]) : null;
  stream(res, `receipt-${p.id}.pdf`, (doc) => {
    header(doc, s, 'PAYMENT RECEIPT', [p.number || ('RCPT-' + p.id), 'Date: ' + new Date(p.date).toLocaleDateString('en-IN')]);
    party(doc, 116, 'RECEIVED FROM', c);
    doc.font(F('Bold')).fontSize(26).fillColor(NAVY).text(inr(p.amount), 40, 220);
    doc.font(F('Regular')).fontSize(9).fillColor(GREY).text(`Rupees ${words(p.amount)} Only`, 40, 256);
    doc.text(`Mode: ${p.mode}${p.reference ? ' · Ref: ' + p.reference : ''}`, 40, 272);
    if (inv) doc.text(`Against invoice ${inv.number} · Balance due: ${inr(inv.total - inv.paid)}`, 40, 286);
    doc.y = 330; footer(doc, s, ['Thank you for your business.']);
  });
}

async function poPdf(res, id) {
  const s = await getSettings();
  const po = await one('SELECT * FROM purchase_orders WHERE id=$1', [id]);
  if (!po) return res.status(404).send('Not found');
  const sup = (await one('SELECT * FROM suppliers WHERE id=$1', [po.supplier_id])) || {};
  const items = await q('SELECT i.*, p.name AS description, p.hsn FROM purchase_order_items i JOIN products p ON p.id=i.product_id WHERE po_id=$1', [id]);
  stream(res, `${po.number}.pdf`, (doc) => {
    header(doc, s, 'PURCHASE ORDER', [po.number, 'Date: ' + new Date(po.created_at).toLocaleDateString('en-IN')]);
    party(doc, 116, 'SUPPLIER', sup);
    const y = itemsTable(doc, 210, items.map(i => ({ ...i, gst_rate: 18, amount: i.qty * i.rate })));
    doc.font(F('Bold')).fontSize(11).fillColor(NAVY).text('Total (excl. GST): ' + inr(po.total), 300, y + 6, { width: 255, align: 'right' });
    doc.y = y + 40; footer(doc, s, [po.notes || 'Please deliver at the earliest.']);
  });
}

module.exports = { quotationPdf, invoicePdf, receiptPdf, poPdf, inr, words };
