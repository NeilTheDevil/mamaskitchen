# Mama's Kitchen — Food Ordering + Delivery Tracking

A portfolio demo: lightweight food-ordering site where customers browse a menu, place orders, and track delivery status. Backend is **100% n8n workflows** talking to a **Postgres** database. Frontend is plain HTML + Tailwind CDN — no build step.

## Stack at a glance

```
Browser
  │
  ▼
Caddy (on GCP VM, Let's Encrypt TLS)
  ├─ food.<ip>.sslip.io/*        → static HTML (menu, track, admin)
  └─ food.<ip>.sslip.io/webhook/* → n8n webhooks
                                     │
                                     ▼
                              n8n (4 workflows)
                                     │
                                     ▼
                            Postgres (orders table)
```

Everything runs in one `docker-compose.yml` on the e2-small GCP VM.

## Project layout

```
.
├── .env                   secrets (git-ignored)
├── .env.example           template
├── .mcp.json              Claude Code MCP config (references .env)
├── deploy.sh              one-command deploy → infra + frontend + workflow import
├── frontend/              static HTML/JS served by Caddy
│   ├── index.html         menu + cart + checkout
│   ├── track.html         customer order-tracking page
│   ├── admin.html         kitchen dashboard
│   ├── app.js             shared helpers + menu/cart logic
│   ├── track.js           tracking page logic
│   └── admin.js           admin dashboard logic
├── server/                infra config → /opt/n8n/ on VM
│   ├── docker-compose.yml Caddy + n8n + Postgres
│   ├── Caddyfile          routes n8n + food subdomain + static files
│   └── init-db.sql        creates `orders` table on first Postgres boot
└── workflows/             n8n workflow JSONs (auto-imported by deploy.sh)
    ├── 01-order-intake.json       POST /webhook/order
    ├── 02-get-order.json          GET  /webhook/order?o=<order_number>
    ├── 03-update-order-status.json POST /webhook/order-status?o=<order_number>
    └── 04-list-admin-orders.json  GET  /webhook/admin/orders?key=<ADMIN_SECRET>
```

## Deploy

### Prerequisite: one-time Cloud Shell setup

The `deploy.sh` script runs from GCP Cloud Shell (it already has `gcloud`, `jq`, `curl`, `tar`).

1. In GCP Console, click the **Cloud Shell icon** (top-right, `>_`) to open a terminal.
2. Upload this project folder. Easiest way: Cloud Shell menu (three dots) → **Upload** → pick `n8n setup and mcp in ClaudeCode` as a zipped folder, or click **Open Editor** and drag the folder in.
3. In the terminal, `cd` into the project folder.

### Run it

```bash
bash deploy.sh
```

That's it. The script will:

1. Bundle server configs + frontend
2. Upload to the VM via `gcloud compute scp`
3. Rewrite `/opt/n8n/docker-compose.yml` + `.env` and restart the stack (this adds Postgres alongside existing Caddy + n8n)
4. Create a `Food App Postgres` credential in n8n via its API
5. Import and activate all 4 workflows, with the credential already wired in

On success it prints the live URLs. First boot may take ~2 min for Caddy to get a TLS cert for the new `food.*` subdomain.

### Re-running

`deploy.sh` is idempotent for workflows (existing ones are deleted and recreated). **Exception:** the Postgres credential. If it already exists, delete it in n8n UI (Credentials tab) before re-running, or the credential-creation step errors out.

## Test it

1. Open `https://food.<ip>.sslip.io` (URL printed at end of deploy).
2. Add items to cart → checkout → fill in fake delivery details → place order. You'll get an order number like `MK-X7K2P9`.
3. Click **Track your order** → see status timeline.
4. In a second tab, open the admin URL (has `?key=<ADMIN_SECRET>` baked in). Advance the order through "Preparing → Out for delivery → Delivered" — each click updates the tracking page within ~15 seconds (the tracking page auto-polls).

## Customize

- **Menu items:** `frontend/app.js`, top of the file — edit the `MENU` array. Each item needs `id`, `name`, `desc`, `price`, `emoji`, `bg` (Tailwind gradient classes).
- **Branding:** `frontend/index.html` header block — change "Mama's Kitchen" and the hero copy.
- **Status labels:** `frontend/track.js` → `STATUS_COPY` object.
- **Admin secret:** rotate by regenerating `ADMIN_SECRET` in `.env` then `bash deploy.sh` again.

## How the auth model works

- **Customer endpoints** (`/webhook/order`, `/webhook/order/:id`) are public — anyone can place an order or look up an order by number. That's fine: order numbers are random 6-char IDs (~1 billion combinations), and no sensitive data is stored beyond name/phone/address.
- **Admin endpoints** (`/webhook/order/:id/status`, `/webhook/admin/orders`) require `key=$ADMIN_SECRET` in the query string or body. The workflows check it server-side before hitting the DB.

## Limitations (portfolio-grade, not commercial-grade)

- No auth for customers (orders found by order number only).
- No real-time map tracking — status updates are manual (Received → Preparing → Out for delivery → Delivered) and polled every 15s.
- No payment integration (explicitly out of scope for this build).
- Admin "auth" is a shared URL secret — fine for a demo, rotate regularly in real use.
- No rate limiting on webhooks.

## Next steps if extending

- **WhatsApp status updates:** add an `HTTP Request` node after each Postgres update to call Meta's Cloud API.
- **Email confirmation:** n8n's Email Send node in the Order Intake workflow.
- **Real menu management:** move `MENU` from `app.js` into a `menu_items` Postgres table; add a `/webhook/menu` GET endpoint.
- **Payment:** add a Paystack initialize call between order creation and confirmation; add a webhook for payment confirmation to flip status to "paid."
