# IT Paradise — API & Webhook reference

Base URL: your server (e.g. `https://web-production-2c508107.up.railway.app`). JSON in / JSON out.

## Auth
`POST /api/auth/login` `{email, password, role?}` → `{token, user}` · send `Authorization: Bearer <token>` on every call. Token valid 30 days.
`GET /api/me` · `POST /api/me/password {password}` · `POST /api/attendance/in|out {location}`

Roles: `owner`, `sales`, `tech`. 403 = role not permitted.

## CRM
| Method & path | Roles | Notes |
|---|---|---|
| GET /api/dashboard | all | role-aware KPIs |
| GET /api/search?q= | all | leads, customers, quotes, invoices, serials |
| GET/POST /api/leads | owner, sales | filters: stage, category, source, owner, q |
| GET/PATCH /api/leads/:id | owner, sales(own) | owner may set owner_id (transfer) |
| POST /api/leads/:id/activity | owner, sales | type: call/whatsapp/visit/note/email |
| POST /api/leads/:id/followups · GET /api/followups · PATCH /api/followups/:id | owner, sales | |
| GET /api/inbox · GET/POST /api/inbox/:phone | owner, sales | WhatsApp conversations |
| GET/POST/PATCH /api/customers[/:id] | owner, sales | detail includes ledger, serials, AMCs |
| GET /api/products | all | live stock |
| GET/POST /api/quotations · GET/PUT /api/quotations/:id | owner, sales(own) | auto GST, discount/margin approval |
| POST /api/quotations/:id/approve | owner | |
| POST /api/quotations/:id/send `{channel: whatsapp|email}` | owner, sales | |
| POST /api/quotations/:id/status `{accepted|rejected}` · /convert | owner, sales | convert = order + GST invoice + stock reservation |
| GET /api/quotations/:id/pdf | owner, sales | |
| GET/POST /api/orders · GET/PATCH /api/orders/:id · POST /deliver · /install-job | owner, sales | |
| GET /api/invoices/:id/pdf | all (tech: own jobs) | |
| GET /api/payments/dues · GET/POST /api/payments · POST /api/payments/remind/:invoiceId · GET /api/payments/:id/receipt | | tech may POST only for own jobs |
| GET /api/stock · POST /api/stock/adjust · GET /api/stock/moves | owner (read: sales) | |
| /api/suppliers, /api/purchases, /api/purchase-orders (+ /pdf, /send) | owner | purchase = stock-in with serials |
| GET /api/serials/:serial | all | purchase, sale, warranty, service history |
| GET/POST /api/jobs · GET/PATCH /api/jobs/:id | all (tech: own) | installation / service / preventive |
| POST /api/jobs/:id/photos?when=before|after|signature (multipart `photos`) | | |
| POST /api/jobs/:id/serial `{serial}` · /otp · /complete `{otp|signature_id, collect, mode}` · /close | | |
| GET/POST/PATCH /api/amcs | owner, sales | `{renew:true}` extends 1 year |
| /api/users, /api/team, /api/tasks, /api/activity-log | owner (tasks: own) | |
| GET /api/reports/:type?from&to[&format=csv&part=] | owner | sales, leads, products, payments, stock, service, team, summary |
| GET/PATCH /api/automations[/:key] · POST /api/automations/:key/run · GET /api/outbox | owner | |
| GET /api/export/:table (CSV) · GET /api/backup · POST /api/restore | owner | |
| /api/cms/* (products, categories, brands, sectors, banners, pages, gallery, settings, media) | owner | website admin |

## Public (website)
`POST /api/public/enquiry` `{name, mobile, product_id?, quantity?, need?, city?, mode?, form?}` → lead (source = website)
`POST /api/public/service` `{category, problem, mobile, name?}` → service ticket `{ticket, track}`

## Webhooks (lead channels)
Key = Settings → Lead channels (`?key=` or `x-api-key` header).
| URL | Source |
|---|---|
| GET/POST /webhooks/whatsapp | WhatsApp Cloud API (verify token + X-Hub-Signature-256 with app secret) |
| GET/POST /webhooks/meta | Facebook/Instagram Lead Ads (`leadgen`) + Messenger / Instagram DMs |
| POST /webhooks/indiamart?key= | IndiaMART Push API (pull API runs every 10 min with CRM key) |
| POST /webhooks/google-ads | Google Ads lead form webhook (`google_key`) |
| GET/POST /webhooks/call?key= | IVR / missed call (`CallFrom` / `caller` / `from`) |
| POST /webhooks/lead?key= | Generic JSON `{name, phone, email, company, city, need, source, id}` — LinkedIn via Zapier/Make, Justdial, GBP, any form |

All channels: duplicate detection (same mobile/email in 90 days → added to existing lead), source tracking, category detection, round-robin assignment, 30-minute first follow-up, owner + salesperson alerts.
