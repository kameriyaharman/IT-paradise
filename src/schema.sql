-- IT PARADISE Business OS — schema (idempotent)
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','sales','tech')),
  categories TEXT DEFAULT '',          -- comma list of category slugs for round-robin assignment
  target NUMERIC DEFAULT 0,            -- monthly target (₹ for sales, jobs for tech)
  active BOOLEAN DEFAULT TRUE,
  last_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE, check_in TIMESTAMPTZ, check_out TIMESTAMPTZ,
  location TEXT, UNIQUE(user_id, day)
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  blurb TEXT, icon TEXT, subtypes TEXT DEFAULT '', sort INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, logo_id INT, sort INT DEFAULT 0);

CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY, filename TEXT, mime TEXT, data BYTEA, kind TEXT DEFAULT 'image',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  model TEXT,
  category_id INT REFERENCES categories(id),
  subtype TEXT,
  brand_id INT REFERENCES brands(id),
  art TEXT,                          -- built-in illustration key
  image_ids INT[] DEFAULT '{}',
  price NUMERIC DEFAULT 0,           -- sell price (excl GST); 0 = on request
  mrp NUMERIC DEFAULT 0,
  buy_price NUMERIC DEFAULT 0,
  gst_rate NUMERIC DEFAULT 18,
  hsn TEXT,
  highlights TEXT[] DEFAULT '{}',
  specs JSONB DEFAULT '[]',          -- [{k,v}]
  description TEXT,
  faq JSONB DEFAULT '[]',
  warranty_months INT DEFAULT 12,
  stock INT DEFAULT 0,
  reserved INT DEFAULT 0,
  min_stock INT DEFAULT 0,
  best_seller BOOLEAN DEFAULT FALSE,
  published BOOLEAN DEFAULT TRUE,
  serial_tracked BOOLEAN DEFAULT TRUE,
  meta_title TEXT, meta_desc TEXT,
  related INT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sectors (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon TEXT,
  headline TEXT, intro TEXT, packages JSONB DEFAULT '[]', form_fields JSONB DEFAULT '[]', sort INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS banners (id SERIAL PRIMARY KEY, title TEXT, subtitle TEXT, image_id INT, link TEXT, active BOOLEAN DEFAULT TRUE, sort INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS pages (slug TEXT PRIMARY KEY, title TEXT, body TEXT, meta_title TEXT, meta_desc TEXT, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS gallery (id SERIAL PRIMARY KEY, image_id INT, caption TEXT, sort INT DEFAULT 0);

-- CRM ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT, phone TEXT, email TEXT,
  city TEXT, address TEXT, gstin TEXT, type TEXT DEFAULT 'retail',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  name TEXT NOT NULL, company TEXT, phone TEXT, email TEXT, city TEXT,
  need TEXT, category TEXT, product_id INT REFERENCES products(id), quantity TEXT,
  budget TEXT, source TEXT NOT NULL DEFAULT 'manual', source_detail TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','demo','quotation','negotiation','won','lost')),
  priority TEXT DEFAULT 'warm' CHECK (priority IN ('hot','warm','cold')),
  score INT DEFAULT 50,
  value NUMERIC DEFAULT 0,
  owner_id INT REFERENCES users(id),
  lost_reason TEXT,
  duplicate_of INT,
  next_followup_at TIMESTAMPTZ,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS leads_owner ON leads(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS leads_ext ON leads(source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY, lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id), user_id INT REFERENCES users(id),
  type TEXT NOT NULL, -- note, call, whatsapp, visit, email, system, stage, quote, payment
  body TEXT, meta JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS act_lead ON activities(lead_id);

CREATE TABLE IF NOT EXISTS followups (
  id SERIAL PRIMARY KEY, lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id), due_at TIMESTAMPTZ NOT NULL, type TEXT DEFAULT 'call',
  note TEXT, auto_nudge BOOLEAN DEFAULT TRUE, done BOOLEAN DEFAULT FALSE, done_at TIMESTAMPTZ,
  reminded BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (  -- WhatsApp / email / social inbox
  id SERIAL PRIMARY KEY, channel TEXT NOT NULL DEFAULT 'whatsapp', lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
  phone TEXT, direction TEXT NOT NULL CHECK (direction IN ('in','out')), body TEXT,
  media_url TEXT, wa_id TEXT, status TEXT DEFAULT 'sent', user_id INT REFERENCES users(id),
  is_bot BOOLEAN DEFAULT FALSE, read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msg_phone ON messages(phone);

CREATE TABLE IF NOT EXISTS bot_sessions (phone TEXT PRIMARY KEY, step TEXT, data JSONB DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT now());

CREATE TABLE IF NOT EXISTS quotations (
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, lead_id INT REFERENCES leads(id), customer_id INT REFERENCES customers(id),
  user_id INT REFERENCES users(id), template TEXT, validity_days INT DEFAULT 7,
  payment_terms TEXT DEFAULT '50% advance', warranty TEXT DEFAULT '1 year', notes TEXT,
  subtotal NUMERIC DEFAULT 0, discount NUMERIC DEFAULT 0, gst NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0,
  margin NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','accepted','rejected','converted')),
  approved_by INT REFERENCES users(id), opened_count INT DEFAULT 0, last_opened_at TIMESTAMPTZ,
  token TEXT, version INT DEFAULT 1, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotation_items (
  id SERIAL PRIMARY KEY, quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id), description TEXT, qty NUMERIC DEFAULT 1, rate NUMERIC DEFAULT 0,
  buy_rate NUMERIC DEFAULT 0, gst_rate NUMERIC DEFAULT 18, amount NUMERIC DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quote_templates (id SERIAL PRIMARY KEY, name TEXT, items JSONB DEFAULT '[]');

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, quotation_id INT REFERENCES quotations(id), lead_id INT REFERENCES leads(id),
  customer_id INT REFERENCES customers(id), user_id INT REFERENCES users(id),
  subtotal NUMERIC DEFAULT 0, discount NUMERIC DEFAULT 0, gst NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0, margin NUMERIC DEFAULT 0,
  advance_required NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'waiting_payment' CHECK (status IN ('waiting_payment','confirmed','scheduled','partially_delivered','delivered','completed','cancelled')),
  delivery_date DATE, technician_id INT REFERENCES users(id), notes TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY, order_id INT REFERENCES orders(id) ON DELETE CASCADE, product_id INT REFERENCES products(id),
  description TEXT, qty NUMERIC, rate NUMERIC, buy_rate NUMERIC DEFAULT 0, gst_rate NUMERIC DEFAULT 18, amount NUMERIC,
  delivered_qty NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, order_id INT REFERENCES orders(id), customer_id INT REFERENCES customers(id),
  date DATE DEFAULT CURRENT_DATE, due_date DATE, subtotal NUMERIC, gst NUMERIC, total NUMERIC, paid NUMERIC DEFAULT 0,
  place_of_supply TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY, number TEXT, invoice_id INT REFERENCES invoices(id), order_id INT REFERENCES orders(id),
  customer_id INT REFERENCES customers(id), amount NUMERIC NOT NULL, mode TEXT DEFAULT 'UPI', reference TEXT,
  kind TEXT DEFAULT 'payment', user_id INT REFERENCES users(id), date DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, gstin TEXT, address TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, supplier_id INT REFERENCES suppliers(id), status TEXT DEFAULT 'draft'
  CHECK (status IN ('draft','sent','received','cancelled')), total NUMERIC DEFAULT 0, notes TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purchase_order_items (id SERIAL PRIMARY KEY, po_id INT REFERENCES purchase_orders(id) ON DELETE CASCADE, product_id INT REFERENCES products(id), qty NUMERIC, rate NUMERIC);
CREATE TABLE IF NOT EXISTS purchases (  -- purchase bill / stock-in
  id SERIAL PRIMARY KEY, number TEXT, supplier_id INT REFERENCES suppliers(id), po_id INT REFERENCES purchase_orders(id),
  bill_no TEXT, bill_date DATE DEFAULT CURRENT_DATE, subtotal NUMERIC DEFAULT 0, gst NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0,
  paid NUMERIC DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purchase_items (id SERIAL PRIMARY KEY, purchase_id INT REFERENCES purchases(id) ON DELETE CASCADE, product_id INT REFERENCES products(id), qty NUMERIC, rate NUMERIC, gst_rate NUMERIC DEFAULT 18, serials TEXT[] DEFAULT '{}');
CREATE TABLE IF NOT EXISTS supplier_payments (id SERIAL PRIMARY KEY, supplier_id INT REFERENCES suppliers(id), purchase_id INT REFERENCES purchases(id), amount NUMERIC, mode TEXT, reference TEXT, date DATE DEFAULT CURRENT_DATE);

CREATE TABLE IF NOT EXISTS stock_moves (
  id SERIAL PRIMARY KEY, product_id INT REFERENCES products(id), qty NUMERIC NOT NULL, kind TEXT NOT NULL, -- in, out, adjust
  ref TEXT, user_id INT REFERENCES users(id), note TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS serials (
  id SERIAL PRIMARY KEY, serial TEXT UNIQUE NOT NULL, product_id INT REFERENCES products(id),
  purchase_id INT REFERENCES purchases(id), order_id INT REFERENCES orders(id), customer_id INT REFERENCES customers(id),
  status TEXT DEFAULT 'in_stock', purchased_at DATE, sold_at DATE, warranty_until DATE, job_id INT
);

CREATE TABLE IF NOT EXISTS jobs (  -- installation jobs + service tickets
  id SERIAL PRIMARY KEY, number TEXT UNIQUE, kind TEXT NOT NULL CHECK (kind IN ('installation','service','preventive')),
  order_id INT REFERENCES orders(id), customer_id INT REFERENCES customers(id), amc_id INT,
  title TEXT, issue TEXT, category TEXT, coverage TEXT DEFAULT 'paid', -- warranty, amc, paid, free
  technician_id INT REFERENCES users(id), scheduled_at TIMESTAMPTZ, address TEXT, location TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','assigned','on_the_way','in_progress','completed','closed','cancelled')),
  checklist JSONB DEFAULT '[]', photos_before INT[] DEFAULT '{}', photos_after INT[] DEFAULT '{}',
  otp TEXT, otp_verified BOOLEAN DEFAULT FALSE, signature_id INT, collected NUMERIC DEFAULT 0,
  source TEXT DEFAULT 'manual', phone TEXT, notes TEXT, track_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS amcs (
  id SERIAL PRIMARY KEY, number TEXT, customer_id INT REFERENCES customers(id), title TEXT, start_date DATE, end_date DATE,
  amount NUMERIC DEFAULT 0, visits_per_year INT DEFAULT 4, status TEXT DEFAULT 'active', notes TEXT,
  reminded JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT, user_id INT REFERENCES users(id), due DATE DEFAULT CURRENT_DATE, done BOOLEAN DEFAULT FALSE, created_by INT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT, body TEXT, link TEXT, read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read);
CREATE TABLE IF NOT EXISTS automations (key TEXT PRIMARY KEY, name TEXT, description TEXT, trigger TEXT, action TEXT, enabled BOOLEAN DEFAULT TRUE, config JSONB DEFAULT '{}', runs INT DEFAULT 0, last_run TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS audit_log (id SERIAL PRIMARY KEY, user_id INT, action TEXT, entity TEXT, entity_id TEXT, detail JSONB, ip TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS outbox (id SERIAL PRIMARY KEY, channel TEXT, to_addr TEXT, template TEXT, body TEXT, status TEXT DEFAULT 'queued', error TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INT DEFAULT 0);
