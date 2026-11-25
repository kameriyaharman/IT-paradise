// First-run seed: website content (from itparadise.in + design), users, and optional demo CRM data
const { q, one, getSettings, setSetting, nextNumber } = require('./db');
const { hash } = require('./auth');
const { seedAutomations } = require('./automations');

const CATEGORIES = [
  ['business-computing', 'Business computing', 'Laptops, desktops, workstations, monitors', 'laptop', 'Laptops,Desktops,Workstations,Monitors,Accessories', 1],
  ['video-surveillance', 'Video surveillance', 'CCTV, IP cameras, NVR/DVR, PTZ', 'camera', 'IP cameras,Analog / HD,PTZ,Wi-Fi / 4G,NVR / DVR,HDD', 2],
  ['enterprise-networking', 'Enterprise networking', 'Switches, routers, Wi-Fi, racks, cabling', 'wifi', 'Switches,Routers,Wi-Fi,Racks,Cabling', 3],
  ['access-attendance', 'Access & attendance', 'Biometric, face, card, door locks', 'fingerprint', 'Face / biometric,RFID / card,Door access,Video door phone', 4],
  ['power-backup', 'Power backup', 'Online UPS, inverters, batteries', 'bolt', 'Online UPS,Line-interactive UPS,Inverters,Batteries', 5],
  ['print-display', 'Print & display', 'Printers, projectors, interactive panels', 'printer', 'Printers,MFP,Projectors,Interactive panels', 6],
];

const P = (name, cat, subtype, art, price, mrp, buy, extra = {}) => ({ name, cat, subtype, art, price, mrp, buy, ...extra });
const PRODUCTS = [
  P('Business Laptop 14″ i5 · 16 GB · 512 GB SSD', 'business-computing', 'Laptops', 'laptop', 54900, 62000, 47200, { best: 1, stock: 6, min: 8, hl: ['Intel Core i5', '16 GB RAM', '512 GB NVMe SSD', '14″ Full HD', 'Windows 11 Pro'], specs: [['Processor', 'Intel Core i5 (13th gen)'], ['Memory', '16 GB DDR4'], ['Storage', '512 GB NVMe SSD'], ['Display', '14″ FHD IPS anti-glare'], ['OS', 'Windows 11 Pro'], ['Warranty', '1 year onsite']], sku: 'ITP-BC-0114' }),
  P('Office Desktop i5 · 8 GB · 512 GB + 22″', 'business-computing', 'Desktops', 'desktop', 42500, 48000, 36100, { best: 1, stock: 12, min: 5, hl: ['Intel Core i5', '8 GB RAM', '512 GB SSD', '22″ monitor', 'Keyboard + mouse'], specs: [['Processor', 'Intel Core i5'], ['Memory', '8 GB DDR4 (expandable)'], ['Storage', '512 GB SSD'], ['Monitor', '22″ Full HD LED'], ['Warranty', '3 years']], sku: 'ITP-BC-0208' }),
  P('Workstation Xeon · 32 GB · RTX', 'business-computing', 'Workstations', 'workstation', 148000, 165000, 128000, { stock: 2, min: 1, hl: ['Intel Xeon', '32 GB ECC', 'NVIDIA RTX graphics', '1 TB SSD'], specs: [['Processor', 'Intel Xeon W'], ['Memory', '32 GB ECC'], ['Graphics', 'NVIDIA RTX'], ['Storage', '1 TB NVMe SSD'], ['Warranty', '3 years onsite']], sku: 'ITP-BC-0332' }),
  P('24″ IPS Full HD Monitor', 'business-computing', 'Monitors', 'monitor', 9800, 12500, 8100, { stock: 18, min: 6, hl: ['24″ IPS', 'Full HD 75 Hz', 'HDMI + VGA', 'Eye care'], specs: [['Size', '24″'], ['Panel', 'IPS'], ['Resolution', '1920 × 1080'], ['Ports', 'HDMI, VGA'], ['Warranty', '3 years']], sku: 'ITP-BC-0424' }),
  P('4 MP IP Dome Camera with Audio', 'video-surveillance', 'IP cameras', 'dome', 3150, 4200, 2380, { best: 1, stock: 46, min: 20, hl: ['4 MP clarity', 'Colour night vision 30 m', 'Built-in mic', 'PoE', 'IP67', 'H.265+'], specs: [['Resolution', '4 MP (2560 × 1440)'], ['Lens', '2.8 mm fixed'], ['IR range', '30 m · colour night'], ['Audio', 'Built-in microphone'], ['Power', 'PoE / 12V DC'], ['Protection', 'IP67'], ['Compression', 'H.265+ / H.264'], ['Warranty', '1 year']], sku: 'ITP-CC-0412', related: ['16-Ch NVR with 4 TB', '24-Port Gigabit PoE Switch', 'Cat6 Cable Box 305 m'] }),
  P('5 MP Colour Night Bullet Camera', 'video-surveillance', 'IP cameras', 'bullet', 4200, 5400, 3150, { best: 1, stock: 22, min: 10, hl: ['5 MP', 'Full-colour night', 'Outdoor IP67', 'PoE'], specs: [['Resolution', '5 MP'], ['Night vision', 'Full colour, 40 m'], ['Protection', 'IP67'], ['Power', 'PoE / 12V DC'], ['Warranty', '1 year']], sku: 'ITP-CC-0513' }),
  P('4 MP PTZ 25× Auto-tracking', 'video-surveillance', 'PTZ', 'ptz', 18500, 23000, 15200, { stock: 4, min: 2, hl: ['25× optical zoom', 'Auto-tracking', '150 m IR', '360° pan'], specs: [['Resolution', '4 MP'], ['Zoom', '25× optical'], ['IR', '150 m'], ['Pan / tilt', '360° endless / 90°'], ['Warranty', '1 year']], sku: 'ITP-CC-0625' }),
  P('16-Ch NVR with 4 TB', 'video-surveillance', 'NVR / DVR', 'nvr', 21400, 26000, 17800, { best: 1, stock: 7, min: 5, hl: ['16 channels', '4 TB HDD included', '4K output', 'Mobile view'], specs: [['Channels', '16 IP'], ['Storage', '4 TB surveillance HDD'], ['Output', 'HDMI 4K / VGA'], ['Remote', 'Mobile app & web'], ['Warranty', '1 year']], sku: 'ITP-CC-0716' }),
  P('Solar 4G Camera', 'video-surveillance', 'Wi-Fi / 4G', 'solar', 12900, 15900, 10400, { best: 1, stock: 8, min: 3, hl: ['Solar powered', '4G SIM', 'No wiring needed', 'PIR detection'], specs: [['Connectivity', '4G LTE SIM'], ['Power', 'Solar panel + battery'], ['Resolution', '3 MP'], ['Storage', 'SD card + cloud'], ['Warranty', '1 year']], sku: 'ITP-CC-0804' }),
  P('Wi-Fi Smart Camera 2-way talk', 'video-surveillance', 'Wi-Fi / 4G', 'wificam', 2900, 3800, 2150, { stock: 30, min: 10, hl: ['Wi-Fi', '2-way talk', '360° view', 'SD card'], specs: [['Connectivity', '2.4 GHz Wi-Fi'], ['Audio', '2-way talk'], ['View', '360° pan / tilt'], ['Storage', 'micro SD up to 256 GB'], ['Warranty', '1 year']], sku: 'ITP-CC-0902' }),
  P('2 MP HD Dome (Analog)', 'video-surveillance', 'Analog / HD', 'dome', 1450, 1900, 1050, { stock: 40, min: 15, hl: ['2 MP HD', '20 m IR', 'Indoor'], specs: [['Resolution', '2 MP'], ['Type', 'HD analog'], ['IR', '20 m']], sku: 'ITP-CC-1002' }),
  P('2 MP HD Bullet (Analog)', 'video-surveillance', 'Analog / HD', 'bullet', 1650, 2100, 1200, { stock: 36, min: 15, hl: ['2 MP HD', '30 m IR', 'Outdoor IP66'], specs: [['Resolution', '2 MP'], ['Type', 'HD analog'], ['IR', '30 m'], ['Protection', 'IP66']], sku: 'ITP-CC-1102' }),
  P('8-Ch NVR', 'video-surveillance', 'NVR / DVR', 'nvr', 6800, 8200, 5400, { stock: 10, min: 4, hl: ['8 channels', '1 SATA bay', 'H.265+'], specs: [['Channels', '8 IP'], ['HDD bays', '1 × SATA up to 10 TB']], sku: 'ITP-CC-1208' }),
  P('8 MP 4K Bullet', 'video-surveillance', 'IP cameras', 'bullet', 7900, 9800, 6300, { stock: 6, min: 3, hl: ['8 MP 4K', '50 m IR', 'Smart detection'], specs: [['Resolution', '8 MP (4K)'], ['IR', '50 m']], sku: 'ITP-CC-1308' }),
  P('4 TB Surveillance HDD', 'video-surveillance', 'HDD', 'hdd', 9400, 11000, 8100, { stock: 9, min: 4, hl: ['4 TB', '24×7 rated', 'Surveillance grade'], specs: [['Capacity', '4 TB'], ['Workload', '24×7 surveillance']], sku: 'ITP-CC-1404' }),
  P('Fisheye 360° Camera', 'video-surveillance', 'IP cameras', 'fisheye', 11200, 13900, 9100, { stock: 3, min: 2, hl: ['360° panoramic', '12 MP', 'De-warping'], specs: [['Resolution', '12 MP'], ['View', '360° fisheye']], sku: 'ITP-CC-1512' }),
  P('24-Port Gigabit PoE Switch', 'enterprise-networking', 'Switches', 'switch', 18900, 23500, 15600, { stock: 5, min: 3, hl: ['24 × Gigabit PoE', '370 W budget', '2 SFP uplinks', 'Rack-mount'], specs: [['Ports', '24 × 10/100/1000 PoE+'], ['Uplink', '2 × SFP'], ['PoE budget', '370 W'], ['Warranty', '3 years']], sku: 'ITP-NW-0124' }),
  P('Dual-band Enterprise Wi-Fi AP', 'enterprise-networking', 'Wi-Fi', 'ap', 7400, 9200, 5600, { best: 1, stock: 18, min: 10, hl: ['Dual-band Wi-Fi 6', 'Ceiling mount', 'PoE powered', 'Cloud managed'], specs: [['Standard', 'Wi-Fi 6 (802.11ax)'], ['Bands', '2.4 + 5 GHz'], ['Power', 'PoE'], ['Management', 'Cloud / controller']], sku: 'ITP-NW-0206' }),
  P('42U Server Rack + Cabling', 'enterprise-networking', 'Racks', 'rack', 0, 0, 0, { stock: 0, min: 0, hl: ['42U floor-standing', 'Structured cabling', 'Patch panels', 'Site survey'], specs: [['Size', '42U'], ['Scope', 'Rack + structured cabling (quoted per site)']], sku: 'ITP-NW-0342' }),
  P('Cat6 Cable Box 305 m', 'enterprise-networking', 'Cabling', 'cable', 5600, 6800, 4500, { stock: 25, min: 10, hl: ['Cat6 UTP', '305 m box', 'Pure copper'], specs: [['Type', 'Cat6 UTP 23 AWG'], ['Length', '305 m']], sku: 'ITP-NW-0406' }),
  P('Face + Fingerprint Attendance', 'access-attendance', 'Face / biometric', 'attendance', 8900, 11500, 6900, { best: 1, stock: 9, min: 10, hl: ['Face + finger + card', '3,000 faces', 'Wi-Fi + LAN', 'Cloud reports'], specs: [['Recognition', 'Face, fingerprint, RFID card'], ['Capacity', '3,000 faces / 5,000 fingers'], ['Connectivity', 'Wi-Fi, LAN, USB'], ['Software', 'Cloud attendance + payroll export']], sku: 'ITP-AA-0108' }),
  P('RFID Door Access Controller', 'access-attendance', 'Door access', 'rfid', 6500, 7900, 5100, { stock: 7, min: 3, hl: ['RFID card + PIN', 'Electro-magnetic lock ready', 'Exit button'], specs: [['Mode', 'Card / PIN'], ['Users', '10,000 cards']], sku: 'ITP-AA-0206' }),
  P('7″ Video Door Phone', 'access-attendance', 'Video door phone', 'doorphone', 9200, 11200, 7400, { stock: 5, min: 2, hl: ['7″ colour screen', 'Night vision', 'Door release'], specs: [['Screen', '7″ TFT'], ['Camera', 'HD with IR']], sku: 'ITP-AA-0307' }),
  P('3 kVA Online UPS', 'power-backup', 'Online UPS', 'ups', 38500, 44000, 31000, { best: 1, stock: 3, min: 4, hl: ['3 kVA true online', 'Pure sine wave', 'LCD display', 'External battery bank'], specs: [['Capacity', '3 kVA / 2.7 kW'], ['Topology', 'Double conversion online'], ['Output', 'Pure sine wave 230V'], ['Warranty', '2 years']], sku: 'ITP-PW-0103' }),
  P('1 kVA Line-interactive UPS', 'power-backup', 'Line-interactive UPS', 'upssmall', 5900, 7200, 4700, { stock: 14, min: 6, hl: ['1 kVA', 'AVR', '15–20 min backup (1 PC)'], specs: [['Capacity', '1 kVA / 600 W'], ['Topology', 'Line-interactive']], sku: 'ITP-PW-0201' }),
  P('Mono Laser Printer · Wi-Fi', 'print-display', 'Printers', 'printer', 13400, 15900, 11200, { stock: 6, min: 3, hl: ['Mono laser', 'Wi-Fi + mobile print', 'Auto duplex'], specs: [['Type', 'Monochrome laser'], ['Speed', '30 ppm'], ['Connectivity', 'Wi-Fi, USB']], sku: 'ITP-PD-0130' }),
  P('Full HD Classroom Projector', 'print-display', 'Projectors', 'projector', 46000, 54000, 39500, { stock: 4, min: 2, hl: ['Full HD', '4,000 lumens', 'HDMI ×2'], specs: [['Resolution', '1920 × 1080'], ['Brightness', '4,000 lumens']], sku: 'ITP-PD-0240' }),
  P('65″ Interactive Flat Panel', 'print-display', 'Interactive panels', 'panel', 135000, 160000, 112000, { best: 1, stock: 3, min: 2, hl: ['65″ 4K touch', '20-point touch', 'Android + Windows OPS', 'Classroom software'], specs: [['Size', '65″ 4K UHD'], ['Touch', '20-point IR'], ['OS', 'Android 13 (+ optional OPS)'], ['Warranty', '3 years']], sku: 'ITP-PD-0365' }),
  P('Colour Ink-tank MFP', 'print-display', 'MFP', 'mfp', 17800, 20500, 14900, { best: 1, stock: 4, min: 5, hl: ['Print · scan · copy', 'Ink-tank low cost', 'Wi-Fi', 'ADF'], specs: [['Functions', 'Print, scan, copy, fax'], ['Technology', 'Ink-tank colour'], ['Connectivity', 'Wi-Fi, LAN, USB']], sku: 'ITP-PD-0418' }),
];

const SECTORS = [
  ['homes', 'Homes', 'home', 'Smarter, safer homes', 'Wi-Fi cameras, video door phones, home Wi-Fi and power backup — installed neatly and supported by one partner.',
    [['Home CCTV', 'Wi-Fi / IP cameras with mobile view', 'dome'], ['Video door phone', 'See and talk to visitors', 'doorphone'], ['Whole-home Wi-Fi', 'Mesh access points, no dead zones', 'ap'], ['Power backup', 'Line-interactive UPS & inverters', 'upssmall'], ['Home office', 'Laptops, printers and monitors', 'laptop'], ['Smart camera', '2-way talk, 360° view', 'wificam']]],
  ['offices', 'Offices & corporates', 'building', 'Connected, secure workplaces', 'Business computing, networks, attendance, surveillance and power for offices of every size — one point of contact.',
    [['Office IT setup', 'Desktops, laptops, monitors', 'desktop'], ['Office network', 'PoE switches, firewalls, Wi-Fi', 'switch'], ['Office CCTV', 'IP cameras with NVR & mobile view', 'dome'], ['Attendance & access', 'Face / card attendance, door access', 'attendance'], ['Print & display', 'MFPs, meeting-room displays', 'mfp'], ['Server & power', 'Racks, online UPS', 'ups']]],
  ['schools', 'Schools & education', 'cap', 'Smart, safe campuses', 'Classroom computing, CCTV, attendance, Wi-Fi, interactive panels and power backup — one partner, one support desk.',
    [['Smart classrooms', 'Interactive panels, projectors, sound', 'panel'], ['Computer labs', 'Desktops, networking, UPS', 'desktop'], ['Campus CCTV', 'Gates, corridors, buses — mobile view', 'dome'], ['Staff & student attendance', 'Face / RFID with SMS to parents', 'attendance'], ['Campus Wi-Fi', 'Managed access points & firewall', 'ap'], ['Power backup', 'Online UPS for labs & server', 'ups']]],
  ['factories', 'Factories & industry', 'factory', 'Rugged tech for the shop floor', 'Perimeter CCTV, PTZ monitoring, industrial networking, attendance for large workforces and reliable power.',
    [['Perimeter CCTV', 'Bullet & PTZ cameras, long-range IR', 'ptz'], ['Workforce attendance', 'Face attendance for shifts', 'attendance'], ['Plant networking', 'Switches, fibre, Wi-Fi', 'switch'], ['Gate access', 'RFID / boom barrier integration', 'rfid'], ['Power protection', 'Online UPS for control systems', 'ups'], ['Office IT', 'Desktops & printers', 'desktop']]],
  ['hospitals', 'Hospitals & healthcare', 'plus', 'Reliable systems for patient care', 'Always-on CCTV, Wi-Fi, access control, attendance and online UPS for clinics and hospitals.',
    [['Hospital CCTV', 'Wards, OPD, pharmacy, parking', 'dome'], ['Access control', 'ICU / store room restricted entry', 'rfid'], ['Staff attendance', 'Face recognition, touch-free', 'attendance'], ['Clinic IT', 'Billing PCs, printers', 'desktop'], ['Hospital Wi-Fi', 'Staff & guest networks', 'ap'], ['Critical power', 'Online UPS for equipment', 'ups']]],
  ['retail', 'Retail & businesses', 'store', 'Run your shop smarter', 'Billing systems, CCTV with mobile view, Wi-Fi and power backup for shops, showrooms and chains.',
    [['Billing counter', 'PC, printer, barcode, UPS', 'desktop'], ['Shop CCTV', 'Colour night cameras, mobile view', 'bullet'], ['Showroom Wi-Fi', 'Customer & staff Wi-Fi', 'ap'], ['Staff attendance', 'Face / finger attendance', 'attendance'], ['Display', 'Digital signage & panels', 'panel'], ['Power backup', 'UPS for counters', 'upssmall']]],
];

const BRANDS = ['Hikvision', 'CP Plus', 'Dahua', 'Dell', 'HP', 'Lenovo', 'TP-Link', 'D-Link', 'eSSL', 'Luminous', 'Epson', 'Canon'];

async function seed() {
  await seedAutomations();
  const s = await getSettings(true);
  if (s.seeded === '1') return;
  console.log('[seed] first run — seeding');
  const defaults = {
    company_name: 'IT PARADISE', tagline: 'Technology, integrated. Since 2006.', city: 'Bhilwara, Rajasthan', address: 'Bhilwara, Rajasthan',
    phone_sales: '', phone_whatsapp: '', phone_service: '', email: 'info@itparadise.in', timings: 'Mon–Sat · 10 AM – 8 PM',
    map_query: 'IT Paradise Bhilwara Rajasthan', gstin: '', upi_id: '', bank_details: '', google_review_url: '',
    stat_years: '2006', stat_products: '400+', stat_installs: '5,000+', stat_sectors: '6',
    max_discount_pct: '10', min_margin_pct: '8', wa_bot_enabled: '1', require_otp: '1', staff_wa_alerts: '0',
    meta_verify_token: 'itparadise-verify', webhook_key: require('crypto').randomBytes(12).toString('hex'),
    quick_replies: JSON.stringify(['Price list', 'Catalogue PDF', 'Location', 'Payment link', 'Thank you']),
    about_text: 'IT Paradise is a technology, security and system-integration partner for homes and businesses in Bhilwara, Rajasthan. We bring computing, surveillance, networking, attendance, power and display together as one connected ecosystem — with one point of contact.\n\nSince 2006, we have helped people and organisations in Bhilwara bring technology together through practical advice, integration and support. Understand. Integrate. Support. — one point of contact from identifying needs to keeping systems working. Solutions, not just boxes: computing, connectivity, security and productivity planned as one connected ecosystem.',
    ga_id: '', gsc_verification: '',
  };
  for (const [k, v] of Object.entries(defaults)) if (s[k] == null) await setSetting(k, v);

  for (const c of CATEGORIES) await q('INSERT INTO categories(slug,name,blurb,icon,subtypes,sort) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(slug) DO NOTHING', c);
  for (const [i, b] of BRANDS.entries()) await q('INSERT INTO brands(name,sort) VALUES($1,$2) ON CONFLICT(name) DO NOTHING', [b, i]);
  const cats = Object.fromEntries((await q('SELECT id,slug FROM categories')).map(c => [c.slug, c.id]));
  const slug = (s) => s.toLowerCase().replace(/[″"']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const p of PRODUCTS) {
    const desc = `${p.name} from IT Paradise, Bhilwara — supplied, installed and supported by our own team. ${p.hl.join(', ')}. Ask for bulk / project pricing with installation.`;
    await q(`INSERT INTO products(slug,name,sku,model,category_id,subtype,art,price,mrp,buy_price,highlights,specs,description,stock,min_stock,best_seller,hsn,faq,meta_title,meta_desc)
      VALUES($1,$2,$3,'[Brand model no.]',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) ON CONFLICT(slug) DO NOTHING`,
      [slug(p.name), p.name, p.sku, cats[p.cat], p.subtype, p.art, p.price, p.mrp, p.buy, p.hl, JSON.stringify(p.specs.map(([k, v]) => ({ k, v }))), desc, p.stock || 0, p.min || 0, !!p.best,
        p.cat === 'video-surveillance' ? '8525' : p.cat === 'business-computing' ? '8471' : p.cat === 'enterprise-networking' ? '8517' : p.cat === 'power-backup' ? '8504' : p.cat === 'print-display' ? '8443' : '8543',
        JSON.stringify([{ q: 'Do you provide installation?', a: 'Yes — our own technicians install and configure everything in Bhilwara and nearby areas.' }, { q: 'Is bulk / project pricing available?', a: 'Yes. For 8+ units or a full setup, request a custom quote — we reply on WhatsApp within 30 minutes.' }, { q: 'What about warranty and service?', a: 'Manufacturer warranty plus local service from our support desk. AMC plans are available.' }]),
        `${p.name} | IT Paradise Bhilwara`, `Buy ${p.name} in Bhilwara with installation & support from IT Paradise. ${p.hl.slice(0, 3).join(', ')}.`]);
  }
  for (const p of PRODUCTS.filter(x => x.related)) {
    const ids = (await q('SELECT id FROM products WHERE name = ANY($1)', [p.related])).map(r => r.id);
    await q('UPDATE products SET related=$2 WHERE slug=$1', [slug(p.name), ids]);
  }
  for (const [i, s2] of SECTORS.entries())
    await q('INSERT INTO sectors(slug,name,icon,headline,intro,packages,sort) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(slug) DO NOTHING',
      [s2[0], s2[1], s2[2], s2[3], s2[4], JSON.stringify(s2[5].map(([t, d, art]) => ({ t, d, art }))), i]);
  const pages = [['privacy', 'Privacy policy', 'We collect only the details you share through our enquiry forms, WhatsApp or calls (name, mobile, email, requirement) to respond to your enquiry and provide service. We do not sell your data. Contact us to update or delete your information.'],
    ['terms', 'Terms', 'Prices are exclusive of GST unless stated. Quotations are valid for 7 days. Installation charges are extra unless included in a package. Warranty is as per manufacturer terms.'],
    ['warranty', 'Warranty & returns', 'All products carry manufacturer warranty. Our support desk handles warranty claims end-to-end — raise a service request and we will take care of the rest.'],
    ['amc-plans', 'AMC plans', 'Annual Maintenance Contracts for CCTV, computers, networking, attendance and UPS systems — preventive visits, priority support and discounted spares. Ask for a quote.']];
  for (const [sl, t, b] of pages) await q('INSERT INTO pages(slug,title,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [sl, t, b]);
  await q(`INSERT INTO quote_templates(name,items) VALUES('CCTV package (8 cameras)',$1),('Computer lab (10 PCs)',$2) ON CONFLICT DO NOTHING`, [
    JSON.stringify([{ sku: 'ITP-CC-0412', qty: 4 }, { sku: 'ITP-CC-0513', qty: 4 }, { sku: 'ITP-CC-1208', qty: 1 }, { description: 'PoE switch, cable, connectors', qty: 1, rate: 9400 }, { description: 'Installation & mobile setup', qty: 1, rate: 4000, gst_rate: 18 }]),
    JSON.stringify([{ sku: 'ITP-BC-0208', qty: 10 }, { sku: 'ITP-NW-0124', qty: 1 }, { sku: 'ITP-PW-0103', qty: 1 }, { description: 'Lab networking & installation', qty: 1, rate: 12000 }])]);

  // Users — default passwords must be changed after first login
  const pw = process.env.DEFAULT_PASSWORD || 'Paradise@2026';
  const users = [['Owner', 'owner@itparadise.in', 'owner', '', 0], ['Rahul', 'rahul@itparadise.in', 'sales', 'video-surveillance,access-attendance', 1200000],
    ['Pooja', 'pooja@itparadise.in', 'sales', 'business-computing,print-display,power-backup', 1200000], ['Neeraj', 'neeraj@itparadise.in', 'sales', 'enterprise-networking', 1500000],
    ['Vikram', 'vikram@itparadise.in', 'tech', '', 24], ['Sonu', 'sonu@itparadise.in', 'tech', '', 24]];
  for (const [n, e, r, c, t] of users)
    await q('INSERT INTO users(name,email,password_hash,role,categories,target) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(email) DO NOTHING', [n, e, await hash(pw), r, c, t]);

  if (process.env.SEED_DEMO !== '0') await seedDemo();
  await setSetting('seeded', '1');
}

async function seedDemo() {
  const { captureLead } = require('./leads');
  const W = require('./workflows');
  const U = Object.fromEntries((await q('SELECT id,name FROM users')).map(u => [u.name, u]));
  const P = Object.fromEntries((await q('SELECT id,sku FROM products')).map(p => [p.sku, p.id]));
  const owner = { ...U.Owner, role: 'owner' };
  const L = async (d, stage, extra = {}) => {
    const { lead } = await captureLead({ ...d, owner_id: d.owner_id || U.Rahul.id });
    await q('UPDATE leads SET stage=$2, priority=coalesce($3,priority), score=coalesce($4,score), value=coalesce($5,value), created_at=now()-($6 || \' hours\')::interval WHERE id=$1',
      [lead.id, stage, extra.priority || null, extra.score || null, extra.value || null, String(extra.ago || 2)]);
    if (['won', 'lost'].includes(stage)) await q('UPDATE followups SET done=true, done_at=now() WHERE lead_id=$1', [lead.id]);
    return lead;
  };
  const ramesh = await L({ name: 'Ramesh Jain', company: 'Jain Textiles', phone: '9829033410', city: 'Bhilwara', need: '8 IP cameras + NVR (4 indoor / 4 outdoor)', budget: '₹55–65 k', quantity: '8', source: 'whatsapp', source_detail: 'Click-to-WA ad' }, 'quotation', { priority: 'hot', score: 82, value: 62000 });
  const sunrise = await L({ name: 'Principal, Sunrise School', company: 'Sunrise School', phone: '9414011205', city: 'Bhilwara', need: 'Lab 30 PCs + projector', quantity: '30', source: 'website', owner_id: U.Neeraj.id }, 'negotiation', { value: 1480000 });
  await L({ name: 'Amit Sharma', phone: '9772022014', city: 'Bhilwara', need: 'Wi-Fi camera ×2', quantity: '2', source: 'instagram', source_detail: 'Lead Ad' }, 'new', { value: 6200 });
  await L({ name: 'Dr. Kothari', company: 'Kothari Hospital', phone: '9460088123', city: 'Bhilwara', need: 'Face attendance ×3', quantity: '3', source: 'call' }, 'demo', { value: 31000 });
  await L({ name: 'Gupta Clinic', phone: '9887012345', city: 'Bhilwara', need: 'CCTV 6 + attendance', source: 'call' }, 'contacted', { value: 48000 });
  await L({ name: 'Laxmi Traders', phone: '9928055501', city: 'Bhilwara', need: 'Billing PC + printer', source: 'walkin', owner_id: U.Pooja.id }, 'won', { value: 68000 });
  await L({ name: 'Mehta Mills', phone: '9351071002', city: 'Bhilwara', need: '3 kVA UPS ×4', source: 'indiamart', owner_id: U.Pooja.id }, 'quotation', { value: 160000 });
  await L({ name: 'Suresh Agarwal', phone: '9799022014', city: 'Mandal', need: 'Laptop i5', source: 'whatsapp', owner_id: U.Pooja.id }, 'new', { value: 55000 });
  await L({ name: 'Kavita Enterprises', phone: '9636044110', city: 'Bhilwara', need: 'Office Wi-Fi + 16 port switch', source: 'linkedin', owner_id: U.Neeraj.id }, 'contacted', { value: 42000 });
  await L({ name: 'Rajesh Kumar', phone: '9413322110', city: 'Shahpura', need: 'Solar 4G camera for farm', source: 'facebook' }, 'lost', { value: 12900 });

  // Quotation for Ramesh (matches design QT · ₹62,410 style)
  const qt = await W.saveQuotation({ lead_id: ramesh.id, template: 'CCTV package', payment_terms: '50% advance', items: [
    { product_id: P['ITP-CC-0412'], qty: 4 }, { product_id: P['ITP-CC-0513'], qty: 4 }, { description: '8-Ch NVR + 2 TB HDD', qty: 1, rate: 12200, buy_rate: 9800 },
    { description: 'PoE switch, cable, connectors', qty: 1, rate: 9400, buy_rate: 7200 }, { description: 'Installation & mobile setup', qty: 1, rate: 4000 }] }, { ...U.Rahul, role: 'sales' });
  await q(`UPDATE quotations SET status='sent', opened_count=2, last_opened_at=now()-interval '1 hour' WHERE id=$1`, [qt.id]);
  await q(`INSERT INTO followups(lead_id,user_id,due_at,type,note) VALUES($1,$2,now()+interval '20 hours','call','Confirm brand & installation date')`, [ramesh.id, U.Rahul.id]);
  await q(`INSERT INTO messages(channel,lead_id,phone,direction,body,created_at) VALUES
    ('whatsapp',$1,'919829033410','in','Hello, office ke liye 8 CCTV camera ka rate bhejo', now()-interval '3 hours'),
    ('whatsapp',$1,'919829033410','out','🤖 Namaste! IT Paradise mein swagat hai. Aapko kis cheez mein madad chahiye?', now()-interval '3 hours'),
    ('whatsapp',$1,'919829033410','in','8 camera, 4 andar 4 bahar. Ramesh Jain, Bhilwara', now()-interval '170 minutes')`, [ramesh.id]);

  // Orders: Laxmi Traders completed, Sunrise partially, Mehta waiting payment
  const laxmi = await one(`SELECT id FROM leads WHERE name='Laxmi Traders'`);
  const q2 = await W.saveQuotation({ lead_id: laxmi.id, payment_terms: '100% advance', items: [{ product_id: P['ITP-BC-0208'], qty: 1 }, { product_id: P['ITP-PD-0418'], qty: 1 }, { product_id: P['ITP-PW-0201'], qty: 1 }] }, owner);
  const o2 = await W.convertToOrder(q2.id, owner);
  await W.recordPayment({ order_id: o2.id, amount: o2.total, mode: 'UPI', send_receipt: false }, owner);
  const mehta = await one(`SELECT id FROM leads WHERE name='Mehta Mills'`);
  const q3 = await W.saveQuotation({ lead_id: mehta.id, payment_terms: '50% advance', items: [{ product_id: P['ITP-PW-0103'], qty: 4 }] }, owner);
  await W.convertToOrder(q3.id, owner);
  await q(`UPDATE invoices SET due_date=CURRENT_DATE-10 WHERE order_id=(SELECT id FROM orders WHERE quotation_id=$1)`, [q3.id]);

  // Service tickets + AMC
  const gupta = await one(`SELECT customer_id FROM leads WHERE name='Gupta Clinic'`);
  await q(`INSERT INTO amcs(number,customer_id,title,start_date,end_date,amount,visits_per_year) VALUES('AMC-0001',$1,'CCTV AMC — 6 cameras',CURRENT_DATE-340,CURRENT_DATE+25,6000,4)`, [gupta.customer_id]);
  await q(`INSERT INTO jobs(number,kind,customer_id,title,issue,coverage,technician_id,status,otp,track_token,checklist) VALUES
    ('ITP-T-2241','service',$1,'Gupta Clinic','3 cameras not showing','amc',$2,'on_the_way','4821',md5(random()::text),'[{"t":"Check power & cabling","done":false},{"t":"Check NVR channels","done":false},{"t":"Test with customer","done":false}]'),
    ('ITP-T-2238','service',(SELECT customer_id FROM leads WHERE name='Mehta Mills'),'Mehta Mills','UPS beeping','warranty',$3,'in_progress','1934',md5(random()::text),'[]'),
    ('ITP-T-2235','service',(SELECT customer_id FROM leads WHERE name='Principal, Sunrise School'),'Sunrise School','Projector lamp','paid',NULL,'open','7720',md5(random()::text),'[]')`,
    [gupta.customer_id, U.Sonu.id, U.Vikram.id]);
  await q(`INSERT INTO counters(name,value) VALUES('ITP-T',2241) ON CONFLICT(name) DO UPDATE SET value=GREATEST(counters.value,2241)`);
  const sup = await one(`INSERT INTO suppliers(name,phone) VALUES('[Distributor name]','') RETURNING id`);
  await q(`INSERT INTO tasks(title,user_id) VALUES('Install 8 cameras — Jain Textiles',$1),('Deliver 10 PCs — Sunrise School',$2),('Call 12 overdue follow-ups',$3),('Send PO — laptops',$4)`, [U.Vikram.id, U.Neeraj.id, U.Rahul.id, U.Owner.id]);
  await setSetting('demo_data', '1');
}

async function clearDemo() {
  for (const t of ['activities', 'followups', 'messages', 'bot_sessions', 'quotation_items', 'quotations', 'payments', 'invoices', 'order_items', 'serials', 'jobs', 'orders', 'amcs', 'leads', 'customers', 'tasks', 'notifications', 'stock_moves', 'purchase_items', 'purchases', 'purchase_order_items', 'purchase_orders', 'supplier_payments', 'suppliers', 'outbox', 'attendance'])
    await q(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
  await q('UPDATE products SET reserved=0');
  await q(`DELETE FROM counters`);
  await setSetting('demo_data', '0');
}

module.exports = { seed, seedDemo, clearDemo };
