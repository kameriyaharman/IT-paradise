# IT PARADISE — Business Automation System

Website + Admin panel + Business CRM + Staff Android app on **one backend and one PostgreSQL database**.

Lead generation → Lead management → Follow-ups → Quotation → Sales order → Purchase → Inventory → Billing → Payment collection → Delivery → Installation → Service → AMC renewal.

| Part | URL | Who |
|---|---|---|
| Website (SEO, server-rendered) | `/` | Public |
| Business CRM + website admin panel | `/crm` | Owner (full), Sales (own leads/quotes/orders) |
| Staff app (mobile web + Android APK) | `/app` · APK: `/download/app` | Owner / Sales / Technician |
| REST API | `/api/*` — see `public/API.md` | App + integrations |
| Webhooks | `/webhooks/*` | WhatsApp, Meta, IndiaMART, Google Ads, IVR, Zapier/Make |

## Default logins (change after first login — Team → edit member, or My account)

| Role | Email | Password |
|---|---|---|
| Owner | owner@itparadise.in | Paradise@2026 |
| Sales | rahul@ / pooja@ / neeraj@itparadise.in | Paradise@2026 |
| Technician | vikram@ / sonu@itparadise.in | Paradise@2026 |

Demo leads/quotes/orders are pre-loaded for training. Remove with **Settings → Backup & data → Clear demo data** before go-live.

## Tech stack
* Node.js 20+ / Express 5, PostgreSQL (`pg`), EJS (website), Preact + htm (CRM SPA, no build step), PDFKit (quotation / GST invoice / receipt / PO PDFs), node-cron (automation engine).
* Android: Capacitor 8 shell (`mobile/`) loading `/app`, built by GitHub Actions (`.github/workflows/android.yml`).

## Run locally
```bash
npm install
DATABASE_URL=postgres://user:pass@localhost:5432/itparadise JWT_SECRET=change-me node server.js
```
Schema is created/migrated automatically on start (`src/schema.sql`, idempotent) and first-run seed fills website content, products, sectors, users and automations.

## Environment variables
| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Login token signing secret (long random string) |
| `PUBLIC_URL` | Public base URL used in WhatsApp links |
| `SEED_DEMO=0` | Skip demo CRM data on first run |
| `DEFAULT_PASSWORD` | Initial password for seeded users |

All business settings (contact numbers, GSTIN, UPI, WhatsApp API, Meta, IndiaMART, SMTP/IMAP, discount rules…) are edited in **CRM → Settings & integrations** and stored in the `settings` table.

## Project layout
```
server.js              app entry: routes, static, startup (migrate → seed → automations)
src/schema.sql         complete database schema
src/routes/site.js     website pages (SEO URLs, sitemap.xml, robots.txt, /q /pay /track /r public docs)
src/routes/public.js   website forms → CRM (enquiry, quote, service ticket)
src/routes/api.js      CRM REST API with role checks on every route
src/routes/cms.js      website admin API (owner only)
src/routes/webhooks.js lead channels: WhatsApp, Facebook/Instagram, IndiaMART, Google Ads, IVR, generic
src/leads.js           central lead capture: dedupe, category detect, scoring, round-robin assignment
src/bot.js             WhatsApp chatbot (need → name/city → lead or service ticket)
src/workflows.js       quote → order → stock reservation → invoice → payment → install job → serial/warranty
src/automations.js     scheduled triggers (follow-ups, payment/AMC reminders, low stock, daily summary, IndiaMART/IMAP pulls)
src/pdf.js             branded PDFs
views/                 website templates (EJS)
public/crm/            CRM + staff app SPA
mobile/                Android (Capacitor) project
```

## Roles & permissions (enforced in the API, not just the UI)
* **Owner** — everything, incl. reports, automations, website admin, settings, team, backups, approvals, stock adjustments, buy prices & margins.
* **Sales** — only leads assigned to them, own quotations/orders, customers linked to them, payments entry, inbox chats of own leads; cannot see buy price/margin; discounts above limit go to owner approval.
* **Technician** — only jobs assigned to them; checklist, photos, serial scan, OTP / signature sign-off, payment collection against own jobs. Customer OTP is never sent to the technician’s screen.

## Backup / restore / export
* Railway Postgres automated backups + **Settings → Backup & data**: full JSON backup, restore, CSV export of every table.
* Audit trail: `audit_log` table (Team → Activity log).

## Deploy (Railway)
Service `web` deploys from this repo (start: `node server.js`, healthcheck `/health`), Postgres plugin provides `DATABASE_URL`.
Custom domain: Railway → web → Settings → Networking → add `itparadise.in` / `crm.itparadise.in`, then update `mobile/capacitor.config.json` and push to rebuild the APK.

Staff Android app download: `/download/app` (also GitHub Release `apk-latest`).
