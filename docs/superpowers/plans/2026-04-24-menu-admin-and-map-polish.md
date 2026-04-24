# Menu Admin CRUD + Geocoded Pin + Map Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship (1) DB-backed menu with admin CRUD, (2) a geocoded destination pin on the tracking map, and (3) map polish (recenter button + ETA).

**Architecture:** One `menu_items` table queried by a public `GET /webhook/menu` and mutated by an admin-key-gated `POST /webhook/admin/menu`. Order intake workflow gains a non-blocking Nominatim geocode step that caches `delivery_lat/lng` on the row. Track page's existing Leaflet integration extended with a destination pin, fit-to-bounds, recenter button, and a haversine/constant-speed ETA label.

**Tech Stack:** n8n workflows (JSON, imported via public API), Postgres 16, Docker Compose on a GCP VM, Caddy, vanilla JS + Tailwind CDN frontend, Leaflet 1.9.4 + OpenStreetMap tiles, Nominatim free geocoder.

**Spec:** `docs/superpowers/specs/2026-04-24-menu-admin-and-map-polish-design.md`

---

## File Structure

**New files:**
- `workflows/06-get-menu.json` — public GET /menu
- `workflows/07-admin-menu.json` — admin POST /admin/menu (upsert/delete)

**Modified files:**
- `server/init-db.sql` — add `menu_items` table + seed, ALTER `orders` for `delivery_lat/lng`
- `workflows/01-order-intake.json` — add Geocode → Parse → Update coords branch (non-blocking)
- `workflows/02-get-order.json` — add `delivery_lat, delivery_lng` to SELECT
- `workflows/04-list-admin-orders.json` — add `delivery_lat, delivery_lng` to SELECT
- `frontend/index.html` — add `menu-loading-error` element
- `frontend/app.js` — replace hardcoded `MENU` with fetch from `/webhook/menu`
- `frontend/admin.html` — add Menu tab + section + edit modal
- `frontend/admin.js` — menu view logic (list, add, edit, delete, toggle)
- `frontend/track.html` — add recenter button + ETA label markup inside map-section
- `frontend/track.js` — destination pin, bounds fitting, recenter handler, ETA computation

**Environment expectations:**
- `PATH` includes `/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe` (for jq) when running from Windows.
- `CLOUDSDK_CORE_PROJECT=project-8a6a71ad-3ab7-4113-a3e` for `gcloud compute *` calls.
- Live n8n API at `https://n8n.34-79-23-147.sslip.io`, admin key + API key in `.env`.

---

### Task 1: Schema — add menu_items table, seed, and delivery coords columns

**Files:**
- Modify: `server/init-db.sql` (append to end, after existing trigger block)

- [ ] **Step 1: Edit `server/init-db.sql` — add the following at the end of the file**

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9, 6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9, 6);

CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    emoji VARCHAR(16) NOT NULL DEFAULT '🍽️',
    bg VARCHAR(64) NOT NULL DEFAULT 'from-stone-400 to-stone-500',
    available BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON menu_items (sort_order, name);

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO menu_items (id, name, description, price, emoji, bg, sort_order) VALUES
  ('jollof-chicken',    'Jollof Rice & Chicken',  'Smoky party jollof with grilled chicken',   3500, '🍛', 'from-rose-400 to-orange-500',   10),
  ('fried-rice-beef',   'Fried Rice & Beef',      'Veggie-loaded fried rice with tender beef', 3200, '🍚', 'from-amber-400 to-lime-500',    20),
  ('amala-ewedu',       'Amala & Ewedu',          'Yam flour swallow with ewedu and stew',     2800, '🥣', 'from-emerald-400 to-teal-500',  30),
  ('pounded-yam-egusi', 'Pounded Yam & Egusi',    'Soft pounded yam with melon seed soup',     3000, '🫕', 'from-yellow-400 to-amber-500',  40),
  ('suya-platter',      'Suya Platter',           'Spicy grilled beef, onions & yaji',         4000, '🍢', 'from-red-500 to-rose-600',      50),
  ('moi-moi',           'Moi Moi',                'Steamed beans pudding with egg & fish',     1500, '🥮', 'from-orange-400 to-red-500',    60),
  ('puff-puff',         'Puff Puff (10 pcs)',     'Soft, golden, dusted with sugar',           1000, '🍩', 'from-pink-400 to-rose-500',     70),
  ('zobo',              'Zobo Drink (500ml)',     'Hibiscus drink with ginger & pineapple',     800, '🥤', 'from-fuchsia-500 to-purple-600',80)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration by running deploy.sh's schema-sync step directly (don't full-deploy yet — workflow files will fail to import because workflows 06/07 not yet written)**

From project root:

```bash
export PATH="/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
export CLOUDSDK_CORE_PROJECT="project-8a6a71ad-3ab7-4113-a3e"
# Upload just the updated init-db.sql and apply it against the live DB
gcloud compute scp --zone=europe-west1-b --quiet server/init-db.sql n8n-server:/tmp/init-db.sql
gcloud compute ssh n8n-server --zone=europe-west1-b --quiet \
  --command='sudo mv /tmp/init-db.sql /opt/n8n/init-db.sql && sudo docker exec -i n8n-postgres-1 psql -v ON_ERROR_STOP=1 -U food -d food_app < /opt/n8n/init-db.sql' \
  < /dev/null
```

Expected tail: `INSERT 0 8` (or `INSERT 0 0` on re-runs, which is fine — `ON CONFLICT DO NOTHING`).

- [ ] **Step 3: Verify 8 seeded rows exist**

```bash
gcloud compute ssh n8n-server --zone=europe-west1-b --quiet \
  --command='sudo docker exec -i n8n-postgres-1 psql -U food -d food_app -c "SELECT count(*), bool_and(available) FROM menu_items;"' \
  < /dev/null
```

Expected: `count=8, bool_and=t`.

- [ ] **Step 4: Verify orders table has new delivery coords columns**

```bash
gcloud compute ssh n8n-server --zone=europe-west1-b --quiet \
  --command='sudo docker exec -i n8n-postgres-1 psql -U food -d food_app -c "SELECT column_name FROM information_schema.columns WHERE table_name='"'"'orders'"'"' AND column_name LIKE '"'"'delivery_l%'"'"';"' \
  < /dev/null
```

Expected: two rows — `delivery_lat` and `delivery_lng`.

- [ ] **Step 5: Commit**

```bash
git add server/init-db.sql
git commit -m "schema: add menu_items table + seed; delivery_lat/lng on orders"
```

---

### Task 2: Workflow 06 — GET /webhook/menu (public)

**Files:**
- Create: `workflows/06-get-menu.json`

- [ ] **Step 1: Create `workflows/06-get-menu.json` with exactly this content**

```json
{
  "name": "Food: Get Menu (GET /menu)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "GET",
        "path": "menu",
        "responseMode": "responseNode",
        "options": { "allowedOrigins": "https://neilthedevil.github.io" }
      },
      "id": "a01b0000-0000-4000-8000-000000000001",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [240, 300],
      "webhookId": "a01b0000-0000-4000-8000-000000000001"
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id, name, description, price, emoji, bg, available, sort_order FROM menu_items ORDER BY sort_order ASC, name ASC;",
        "options": {}
      },
      "id": "a01b0000-0000-4000-8000-000000000002",
      "name": "Fetch Items",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [460, 300],
      "alwaysOutputData": true
    },
    {
      "parameters": {
        "jsCode": "const items = $input.all().map(i => i.json).filter(o => o && o.id);\nreturn [{ json: { items } }];"
      },
      "id": "a01b0000-0000-4000-8000-000000000003",
      "name": "Wrap Items",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "respondWith": "firstIncomingItem",
        "options": {}
      },
      "id": "a01b0000-0000-4000-8000-000000000004",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [900, 300]
    }
  ],
  "connections": {
    "Webhook":      { "main": [[{ "node": "Fetch Items", "type": "main", "index": 0 }]] },
    "Fetch Items":  { "main": [[{ "node": "Wrap Items",  "type": "main", "index": 0 }]] },
    "Wrap Items":   { "main": [[{ "node": "Respond",     "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": {},
  "tags": []
}
```

- [ ] **Step 2: Run full deploy to import + activate the new workflow (Postgres credential gets wired in automatically by deploy.sh step 6)**

```bash
bash deploy.sh 2>&1 | tail -10
```

Expected: line `Food: Get Menu (GET /menu)                                  ✓ activated (id=...)`.

- [ ] **Step 3: Smoke test — GET /webhook/menu returns 8 items**

```bash
curl -sS https://food.34-79-23-147.sslip.io/webhook/menu \
  -H "Origin: https://neilthedevil.github.io" \
  | jq '{count: (.items | length), first: .items[0], available_count: ([.items[] | select(.available)] | length)}'
```

Expected JSON:
```
{ "count": 8, "first": { "id": "jollof-chicken", "name": "Jollof Rice & Chicken", "price": "3500.00", ... }, "available_count": 8 }
```

- [ ] **Step 4: Commit**

```bash
git add workflows/06-get-menu.json
git commit -m "feat(workflow): GET /webhook/menu returns menu_items"
```

---

### Task 3: Workflow 07 — POST /webhook/admin/menu (upsert/delete)

**Files:**
- Create: `workflows/07-admin-menu.json`

- [ ] **Step 1: Create `workflows/07-admin-menu.json` with exactly this content**

```json
{
  "name": "Food: Admin Menu (POST /admin/menu)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "admin/menu",
        "responseMode": "responseNode",
        "options": { "allowedOrigins": "https://neilthedevil.github.io" }
      },
      "id": "a02b0000-0000-4000-8000-000000000001",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [240, 300],
      "webhookId": "a02b0000-0000-4000-8000-000000000001"
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            {
              "id": "auth-check",
              "leftValue": "={{ $json.body.key }}",
              "rightValue": "={{ $env.ADMIN_SECRET }}",
              "operator": { "type": "string", "operation": "equals" }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "a02b0000-0000-4000-8000-000000000002",
      "name": "Check Auth",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "jsCode": "const body = $input.first().json.body || {};\nconst action = body.action;\nif (action !== 'upsert' && action !== 'delete') {\n  throw new Error('Invalid action; expected \"upsert\" or \"delete\"');\n}\nif (action === 'delete') {\n  if (!body.id) throw new Error('Missing id for delete');\n  return [{ json: { action, id: String(body.id) } }];\n}\n// upsert\nconst item = body.item || {};\nif (!item.id || !item.name || item.price == null) {\n  throw new Error('Missing required fields: id, name, price');\n}\nif (Number(item.price) < 0) throw new Error('price must be >= 0');\nreturn [{ json: { action,\n  id: String(item.id),\n  name: String(item.name),\n  description: String(item.description || ''),\n  price: Number(item.price),\n  emoji: String(item.emoji || '🍽️'),\n  bg: String(item.bg || 'from-stone-400 to-stone-500'),\n  available: item.available === false ? false : true,\n  sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 100\n} }];"
      },
      "id": "a02b0000-0000-4000-8000-000000000003",
      "name": "Validate",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [680, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            {
              "id": "is-delete",
              "leftValue": "={{ $json.action }}",
              "rightValue": "delete",
              "operator": { "type": "string", "operation": "equals" }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "a02b0000-0000-4000-8000-000000000004",
      "name": "Is Delete?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [900, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "DELETE FROM menu_items WHERE id = $1 RETURNING id;",
        "options": { "queryReplacement": "={{ $json.id }}" }
      },
      "id": "a02b0000-0000-4000-8000-000000000005",
      "name": "Delete Item",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [1120, 200]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO menu_items (id, name, description, price, emoji, bg, available, sort_order)\nVALUES ($1, $2, $3, $4::numeric, $5, $6, $7::boolean, $8::int)\nON CONFLICT (id) DO UPDATE SET\n  name = EXCLUDED.name,\n  description = EXCLUDED.description,\n  price = EXCLUDED.price,\n  emoji = EXCLUDED.emoji,\n  bg = EXCLUDED.bg,\n  available = EXCLUDED.available,\n  sort_order = EXCLUDED.sort_order\nRETURNING id, name, price, emoji, bg, available, sort_order;",
        "options": {
          "queryReplacement": "={{ $json.id }},={{ $json.name }},={{ $json.description }},={{ $json.price }},={{ $json.emoji }},={{ $json.bg }},={{ $json.available }},={{ $json.sort_order }}"
        }
      },
      "id": "a02b0000-0000-4000-8000-000000000006",
      "name": "Upsert Item",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [1120, 400]
    },
    {
      "parameters": {
        "respondWith": "firstIncomingItem",
        "options": {}
      },
      "id": "a02b0000-0000-4000-8000-000000000007",
      "name": "Respond OK",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [1340, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={ \"error\": \"Unauthorized\" }",
        "options": { "responseCode": 401 }
      },
      "id": "a02b0000-0000-4000-8000-000000000008",
      "name": "Respond 401",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [680, 500]
    }
  ],
  "connections": {
    "Webhook":     { "main": [[{ "node": "Check Auth", "type": "main", "index": 0 }]] },
    "Check Auth":  { "main": [[{ "node": "Validate", "type": "main", "index": 0 }], [{ "node": "Respond 401", "type": "main", "index": 0 }]] },
    "Validate":    { "main": [[{ "node": "Is Delete?", "type": "main", "index": 0 }]] },
    "Is Delete?":  { "main": [[{ "node": "Delete Item", "type": "main", "index": 0 }], [{ "node": "Upsert Item", "type": "main", "index": 0 }]] },
    "Delete Item": { "main": [[{ "node": "Respond OK", "type": "main", "index": 0 }]] },
    "Upsert Item": { "main": [[{ "node": "Respond OK", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": {},
  "tags": []
}
```

- [ ] **Step 2: Deploy so the new workflow is imported and activated**

```bash
bash deploy.sh 2>&1 | tail -10
```

Expected: `Food: Admin Menu (POST /admin/menu)                          ✓ activated (id=...)`.

- [ ] **Step 3: Smoke test — upsert, verify, then delete**

Set `SECRET`, `F`, `ORIGIN` for this block:

```bash
F=https://food.34-79-23-147.sslip.io
SECRET=a4afc781e30db7450755150ea086a0f7
ORIGIN="https://neilthedevil.github.io"

# Upsert a test item
curl -sS -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"action\":\"upsert\",\"key\":\"$SECRET\",\"item\":{\"id\":\"plan-test\",\"name\":\"Plan Test\",\"description\":\"temp\",\"price\":500,\"emoji\":\"🧪\",\"bg\":\"from-stone-200 to-stone-400\",\"sort_order\":999}}" | jq .

# Confirm it's in GET /menu
curl -sS "$F/webhook/menu" -H "Origin: $ORIGIN" | jq '.items[] | select(.id=="plan-test")'

# Delete it
curl -sS -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"action\":\"delete\",\"key\":\"$SECRET\",\"id\":\"plan-test\"}" | jq .

# Confirm gone
curl -sS "$F/webhook/menu" -H "Origin: $ORIGIN" | jq '.items[] | select(.id=="plan-test")'

# Auth check
curl -sS -o /dev/null -w "no-key=%{http_code}\n" -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" -d '{"action":"delete","id":"x"}'
```

Expected:
- Upsert → `{id:"plan-test", name:"Plan Test", price:"500.00", available:true, ...}`
- First GET filter → one row matching `plan-test`
- Delete → `{id:"plan-test"}`
- Second GET filter → empty output
- Auth check → `no-key=401`

- [ ] **Step 4: Commit**

```bash
git add workflows/07-admin-menu.json
git commit -m "feat(workflow): POST /webhook/admin/menu upsert+delete with admin key"
```

---

### Task 4: Customer menu page fetches from API

**Files:**
- Modify: `frontend/index.html` — add menu-loading-error element
- Modify: `frontend/app.js` — replace hardcoded MENU with fetched list

- [ ] **Step 1: In `frontend/index.html`, change the menu grid container block**

Find:

```html
        <div id="menu-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></div>
```

Replace with:

```html
        <div id="menu-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></div>
        <p id="menu-loading-error" class="hidden mt-6 text-center text-rose-600">
            Menu unavailable right now — please try again in a minute.
        </p>
```

- [ ] **Step 2: In `frontend/app.js`, replace the `MENU = [ ... ]` block and trailing `renderMenu(); renderCart();` bottom block with a fetch-first bootstrap.**

Find (starting line near the top of the `if (document.getElementById('menu-grid'))` branch):

```javascript
    const MENU = [
        { id: 'jollof-chicken',    name: 'Jollof Rice & Chicken',  desc: 'Smoky party jollof with grilled chicken', price: 3500, emoji: '🍛', bg: 'from-rose-400 to-orange-500' },
        { id: 'fried-rice-beef',   name: 'Fried Rice & Beef',      desc: 'Veggie-loaded fried rice with tender beef', price: 3200, emoji: '🍚', bg: 'from-amber-400 to-lime-500' },
        { id: 'amala-ewedu',       name: 'Amala & Ewedu',          desc: 'Yam flour swallow with ewedu and stew',    price: 2800, emoji: '🥣', bg: 'from-emerald-400 to-teal-500' },
        { id: 'pounded-yam-egusi', name: 'Pounded Yam & Egusi',    desc: 'Soft pounded yam with melon seed soup',    price: 3000, emoji: '🫕', bg: 'from-yellow-400 to-amber-500' },
        { id: 'suya-platter',      name: 'Suya Platter',           desc: 'Spicy grilled beef, onions & yaji',        price: 4000, emoji: '🍢', bg: 'from-red-500 to-rose-600' },
        { id: 'moi-moi',           name: 'Moi Moi',                desc: 'Steamed beans pudding with egg & fish',    price: 1500, emoji: '🥮', bg: 'from-orange-400 to-red-500' },
        { id: 'puff-puff',         name: 'Puff Puff (10 pcs)',     desc: 'Soft, golden, dusted with sugar',          price: 1000, emoji: '🍩', bg: 'from-pink-400 to-rose-500' },
        { id: 'zobo',              name: 'Zobo Drink (500ml)',     desc: 'Hibiscus drink with ginger & pineapple',   price: 800,  emoji: '🥤', bg: 'from-fuchsia-500 to-purple-600' },
    ];
```

Replace with:

```javascript
    let MENU = [];
```

Find at the end of the menu-grid branch (last two lines of that `if` block):

```javascript
    renderMenu();
    renderCart();
```

Replace with:

```javascript
    (async function bootstrap() {
        try {
            const data = await api('/menu');
            MENU = (data.items || [])
                .filter((it) => it.available)
                .map((it) => ({
                    id: it.id,
                    name: it.name,
                    desc: it.description || '',
                    price: Number(it.price),
                    emoji: it.emoji,
                    bg: it.bg,
                }));
            renderMenu();
            renderCart();
        } catch (err) {
            $('menu-loading-error').classList.remove('hidden');
            $('menu-loading-error').textContent = 'Menu unavailable: ' + err.message;
            renderCart();
        }
    })();
```

- [ ] **Step 3: Commit and push so GitHub Pages redeploys**

```bash
git add frontend/index.html frontend/app.js
git commit -m "feat(ui): customer menu fetched from /webhook/menu"
git push origin main
```

- [ ] **Step 4: Wait for Pages deploy, then verify in-browser**

```bash
# Poll the latest workflow run until completed
for i in $(seq 1 36); do
  status=$(curl -fsS "https://api.github.com/repos/NeilTheDevil/mamaskitchen/actions/runs?per_page=1" | jq -r '.workflow_runs[0] | "\(.status) \(.conclusion // "pending")"')
  echo "[$(date +%H:%M:%S)] $status"
  case "$status" in *"completed success"*) break ;; *"completed failure"*) echo "FAIL"; exit 1 ;; esac
  sleep 5
done

# Sanity check the deployed app.js no longer has the hardcoded MENU array
curl -sS https://neilthedevil.github.io/mamaskitchen/app.js | grep -c "jollof-chicken'"
```

Expected: final status line `completed success`. Grep count should be `0` (no hardcoded reference left).

Manual browser check: open https://neilthedevil.github.io/mamaskitchen/ → menu grid renders 8 cards → Dev Tools Network tab shows a request to `https://food.34-79-23-147.sslip.io/webhook/menu` returning 200.

---

### Task 5: Admin menu management UI

**Files:**
- Modify: `frontend/admin.html` — add tab switcher, Menu section markup, edit modal
- Modify: `frontend/admin.js` — menu loading, CRUD handlers

- [ ] **Step 1: In `frontend/admin.html`, inside the `<main>` element, add the tab switcher + wrap the existing Orders markup in a section. Replace the current `<main>` opening block down to the close of `<div id="orders-list">`**

Find (current):

```html
    <main class="max-w-7xl mx-auto px-6 py-8">
        <div id="auth-warning" class="hidden bg-rose-100 border border-rose-300 text-rose-900 p-4 rounded-lg mb-6">
```

(Read the file to find exact existing content; the replacement wraps it.) Add immediately after `<main class="...">` and before the `auth-warning` div:

```html
        <div class="flex gap-2 mb-6 border-b border-stone-300">
            <button data-tab="orders" class="tab-btn px-4 py-2 font-semibold border-b-2 border-amber-600 text-amber-700">Orders</button>
            <button data-tab="menu" class="tab-btn px-4 py-2 font-semibold border-b-2 border-transparent text-stone-500 hover:text-stone-800">Menu</button>
        </div>

        <section id="tab-orders">
```

Then find the existing closing `</div>` that closes the orders content block + the `</main>` after it, and change from:

```html
        <div id="orders-list" class="space-y-4">
            <p id="empty-state" class="text-stone-500 text-center py-12">Loading...</p>
        </div>
    </main>
```

To:

```html
        <div id="orders-list" class="space-y-4">
            <p id="empty-state" class="text-stone-500 text-center py-12">Loading...</p>
        </div>
        </section>

        <section id="tab-menu" class="hidden">
            <div class="flex items-center justify-between mb-4">
                <h2 class="brand-font text-2xl font-bold">Menu items</h2>
                <button id="menu-add-btn" class="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-lg">+ Add item</button>
            </div>
            <div id="menu-list" class="bg-white rounded-xl shadow-sm overflow-hidden">
                <p class="p-6 text-stone-500 text-center">Loading menu...</p>
            </div>
        </section>

        <div id="item-modal" class="hidden fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between p-5 border-b">
                    <h3 id="item-modal-title" class="brand-font text-2xl font-bold">Add item</h3>
                    <button id="item-modal-close" class="text-stone-500 hover:text-stone-900 text-2xl leading-none">&times;</button>
                </div>
                <form id="item-form" class="p-5 space-y-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">Id <span class="text-stone-400">(slug, lowercase-dashed)</span></label>
                        <input name="id" required pattern="[a-z0-9-]+" class="w-full border border-stone-300 rounded-lg px-3 py-2 font-mono text-sm" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Name</label>
                        <input name="name" required minlength="2" class="w-full border border-stone-300 rounded-lg px-3 py-2" />
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Description</label>
                        <textarea name="description" rows="2" class="w-full border border-stone-300 rounded-lg px-3 py-2"></textarea>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">Price (₦)</label>
                            <input name="price" type="number" min="0" step="50" required class="w-full border border-stone-300 rounded-lg px-3 py-2" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">Sort order</label>
                            <input name="sort_order" type="number" value="100" class="w-full border border-stone-300 rounded-lg px-3 py-2" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium mb-1">Emoji</label>
                            <input name="emoji" maxlength="4" placeholder="🍛" class="w-full border border-stone-300 rounded-lg px-3 py-2 text-2xl text-center" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">BG (Tailwind)</label>
                            <input name="bg" placeholder="from-rose-400 to-orange-500" class="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                    </div>
                    <label class="flex items-center gap-2">
                        <input name="available" type="checkbox" checked class="w-4 h-4" />
                        <span class="text-sm">Available to customers</span>
                    </label>
                    <button type="submit" id="item-save-btn" class="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg">Save</button>
                </form>
            </div>
        </div>
    </main>
```

- [ ] **Step 2: In `frontend/admin.js`, add menu-tab logic at the bottom of the file (after existing code)**

Append to the end of `frontend/admin.js`:

```javascript
// ─── Menu tab ─────────────────────────────────────────────────────────────
const tabs = {
    orders: document.getElementById('tab-orders'),
    menu: document.getElementById('tab-menu'),
};
document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.remove('border-amber-600', 'text-amber-700');
            b.classList.add('border-transparent', 'text-stone-500');
        });
        btn.classList.remove('border-transparent', 'text-stone-500');
        btn.classList.add('border-amber-600', 'text-amber-700');
        tabs.orders.classList.toggle('hidden', tab !== 'orders');
        tabs.menu.classList.toggle('hidden', tab !== 'menu');
        if (tab === 'menu') loadMenu();
    });
});

let menuCache = [];

async function loadMenu() {
    try {
        const data = await api('/menu');
        menuCache = data.items || [];
        renderMenuAdmin();
    } catch (err) {
        document.getElementById('menu-list').innerHTML =
            `<p class="p-6 text-rose-600 text-center">Failed to load menu: ${err.message}</p>`;
    }
}

function renderMenuAdmin() {
    const list = document.getElementById('menu-list');
    if (menuCache.length === 0) {
        list.innerHTML = '<p class="p-6 text-stone-500 text-center">No items yet.</p>';
        return;
    }
    list.innerHTML = `
        <table class="w-full text-sm">
            <thead class="bg-stone-50 text-stone-600 text-left">
                <tr>
                    <th class="px-4 py-3 w-12"></th>
                    <th class="px-4 py-3">Name</th>
                    <th class="px-4 py-3">Price</th>
                    <th class="px-4 py-3">Sort</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
                ${menuCache.map((it) => `
                    <tr class="${it.available ? '' : 'bg-stone-50 text-stone-400'}">
                        <td class="px-4 py-3 text-2xl">${it.emoji}</td>
                        <td class="px-4 py-3">
                            <p class="font-semibold">${it.name}</p>
                            <p class="text-xs text-stone-500">${it.id}</p>
                        </td>
                        <td class="px-4 py-3">${formatNaira(it.price)}</td>
                        <td class="px-4 py-3">${it.sort_order}</td>
                        <td class="px-4 py-3">
                            <button data-toggle="${it.id}"
                                class="px-2 py-1 rounded text-xs font-semibold ${it.available ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}">
                                ${it.available ? 'Available' : 'Unavailable'}
                            </button>
                        </td>
                        <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                            <button data-edit="${it.id}" class="text-amber-700 hover:underline">Edit</button>
                            <button data-delete="${it.id}" class="text-rose-600 hover:underline">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    list.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
        const id = b.getAttribute('data-toggle');
        const item = menuCache.find((x) => x.id === id);
        upsertItem({ ...item, available: !item.available });
    }));
    list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const id = b.getAttribute('data-edit');
        openItemModal(menuCache.find((x) => x.id === id));
    }));
    list.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => {
        const id = b.getAttribute('data-delete');
        if (confirm(`Delete "${id}"? Orders that already used it are not affected.`)) deleteItem(id);
    }));
}

function openItemModal(item) {
    const modal = document.getElementById('item-modal');
    const form = document.getElementById('item-form');
    const title = document.getElementById('item-modal-title');
    form.reset();
    if (item) {
        title.textContent = 'Edit item';
        form.elements.id.value = item.id;
        form.elements.id.readOnly = true;
        form.elements.name.value = item.name;
        form.elements.description.value = item.description || '';
        form.elements.price.value = Number(item.price);
        form.elements.sort_order.value = item.sort_order;
        form.elements.emoji.value = item.emoji;
        form.elements.bg.value = item.bg;
        form.elements.available.checked = !!item.available;
    } else {
        title.textContent = 'Add item';
        form.elements.id.readOnly = false;
        form.elements.sort_order.value = 100;
    }
    modal.classList.remove('hidden');
}

document.getElementById('menu-add-btn').addEventListener('click', () => openItemModal(null));
document.getElementById('item-modal-close').addEventListener('click', () => document.getElementById('item-modal').classList.add('hidden'));

document.getElementById('item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const item = {
        id: f.get('id'),
        name: f.get('name'),
        description: f.get('description') || '',
        price: Number(f.get('price')),
        emoji: f.get('emoji') || '🍽️',
        bg: f.get('bg') || 'from-stone-400 to-stone-500',
        sort_order: Number(f.get('sort_order')) || 100,
        available: f.get('available') === 'on',
    };
    await upsertItem(item);
    document.getElementById('item-modal').classList.add('hidden');
});

async function upsertItem(item) {
    if (!adminKey) { alert('Admin key missing'); return; }
    try {
        await api('/admin/menu', { method: 'POST', body: { action: 'upsert', key: adminKey, item } });
        await loadMenu();
    } catch (err) {
        alert('Save failed: ' + err.message);
    }
}
async function deleteItem(id) {
    if (!adminKey) return;
    try {
        await api('/admin/menu', { method: 'POST', body: { action: 'delete', key: adminKey, id } });
        await loadMenu();
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}
```

- [ ] **Step 3: Commit and push**

```bash
git add frontend/admin.html frontend/admin.js
git commit -m "feat(ui): admin menu tab with add/edit/delete/toggle"
git push origin main
```

- [ ] **Step 4: Wait for Pages deploy + in-browser smoke**

```bash
for i in $(seq 1 36); do
  status=$(curl -fsS "https://api.github.com/repos/NeilTheDevil/mamaskitchen/actions/runs?per_page=1" | jq -r '.workflow_runs[0] | "\(.status) \(.conclusion // "pending")"')
  echo "[$(date +%H:%M:%S)] $status"
  case "$status" in *"completed success"*) break ;; *"completed failure"*) echo "FAIL"; exit 1 ;; esac
  sleep 5
done
```

Manual browser check at `https://neilthedevil.github.io/mamaskitchen/admin.html?key=a4afc781e30db7450755150ea086a0f7`:
- Orders tab still works
- Click "Menu" tab → list of 8 rows renders
- Click "Unavailable" toggle on one → row greys out, customer menu page no longer shows that item
- Click "Edit" → modal opens with fields populated → change name → Save → row updates
- Click "+ Add item" → modal opens empty → fill in a test item → Save → new row appears
- Click "Delete" on the test item → confirms → row disappears

---

### Task 6: Geocode order address on intake (workflow 01)

**Files:**
- Modify: `workflows/01-order-intake.json` — add Geocode HTTP → Parse → Update coords nodes

- [ ] **Step 1: Read the current file to get the node layout**

```bash
cat workflows/01-order-intake.json
```

- [ ] **Step 2: Rewrite `workflows/01-order-intake.json` with the added geocode branch**

Replace the entire file with:

```json
{
  "name": "Food: Order Intake (POST /order)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "order",
        "responseMode": "responseNode",
        "options": { "allowedOrigins": "https://neilthedevil.github.io" }
      },
      "id": "dd1a2060-26e3-4e8b-a6e6-2de652713fc3",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [240, 300],
      "webhookId": "d404ec87-96db-44d0-b6e3-2b9bb1ad155f"
    },
    {
      "parameters": {
        "jsCode": "const body = $input.first().json.body || {};\n\nconst chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';\nlet suffix = '';\nfor (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];\nconst order_number = 'MK-' + suffix;\n\nconst items = Array.isArray(body.items) ? body.items : [];\nif (items.length === 0) throw new Error('Cart is empty');\n\nconst total_amount = items.reduce((sum, it) => sum + (Number(it.price) * Number(it.qty)), 0);\n\nreturn [{\n  json: {\n    order_number,\n    customer_name: String(body.customer_name || '').trim(),\n    customer_phone: String(body.customer_phone || '').trim(),\n    delivery_address: String(body.delivery_address || '').trim(),\n    notes: body.notes ? String(body.notes).trim() : null,\n    items_json: JSON.stringify(items),\n    total_amount\n  }\n}];"
      },
      "id": "188b3430-d3ee-45af-9935-bfd64577259a",
      "name": "Prepare Order",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO orders (order_number, customer_name, customer_phone, delivery_address, notes, items, total_amount)\nVALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)\nRETURNING order_number, created_at, delivery_address;",
        "options": {
          "queryReplacement": "={{ $json.order_number }},={{ $json.customer_name }},={{ $json.customer_phone }},={{ $json.delivery_address }},={{ $json.notes }},={{ $json.items_json }},={{ $json.total_amount }}"
        }
      },
      "id": "1aa032a5-4dc1-462a-8eee-b2f6bb42f14b",
      "name": "Insert Order",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [680, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={\n  \"order_number\": \"{{ $json.order_number }}\",\n  \"tracking_url\": \"/track.html?o={{ $json.order_number }}\"\n}",
        "options": {}
      },
      "id": "529f8207-6818-4278-af5d-33c34dc4c170",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [900, 300]
    },
    {
      "parameters": {
        "url": "=https://nominatim.openstreetmap.org/search",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "q", "value": "={{ $json.delivery_address }}" },
            { "name": "format", "value": "json" },
            { "name": "limit", "value": "1" },
            { "name": "countrycodes", "value": "ng" }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "User-Agent", "value": "MamasKitchen/1.0 (portfolio)" }
          ]
        },
        "options": { "timeout": 5000 }
      },
      "id": "c01c0000-0000-4000-8000-000000000001",
      "name": "Geocode",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [900, 480],
      "continueOnFail": true,
      "onError": "continueRegularOutput"
    },
    {
      "parameters": {
        "jsCode": "const insertRow = $('Insert Order').first().json;\nconst order_number = insertRow.order_number;\nconst hits = $input.all();\nconst first = hits && hits[0] && hits[0].json;\nlet lat = null, lng = null;\nif (Array.isArray(first) && first[0]) {\n  lat = Number(first[0].lat);\n  lng = Number(first[0].lon);\n} else if (first && first.lat && first.lon) {\n  lat = Number(first.lat);\n  lng = Number(first.lon);\n}\nif (!Number.isFinite(lat) || !Number.isFinite(lng)) { lat = null; lng = null; }\nreturn [{ json: { order_number, lat, lng } }];"
      },
      "id": "c01c0000-0000-4000-8000-000000000002",
      "name": "Parse Geocode",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1120, 480]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE orders\nSET delivery_lat = $2::numeric,\n    delivery_lng = $3::numeric\nWHERE order_number = $1 AND $2 IS NOT NULL AND $3 IS NOT NULL\nRETURNING order_number, delivery_lat, delivery_lng;",
        "options": {
          "queryReplacement": "={{ $json.order_number }},={{ $json.lat }},={{ $json.lng }}"
        }
      },
      "id": "c01c0000-0000-4000-8000-000000000003",
      "name": "Update Coords",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [1340, 480],
      "continueOnFail": true,
      "alwaysOutputData": true
    }
  ],
  "connections": {
    "Webhook":       { "main": [[{ "node": "Prepare Order", "type": "main", "index": 0 }]] },
    "Prepare Order": { "main": [[{ "node": "Insert Order",  "type": "main", "index": 0 }]] },
    "Insert Order":  { "main": [[{ "node": "Respond",       "type": "main", "index": 0 }, { "node": "Geocode", "type": "main", "index": 0 }]] },
    "Geocode":       { "main": [[{ "node": "Parse Geocode", "type": "main", "index": 0 }]] },
    "Parse Geocode": { "main": [[{ "node": "Update Coords", "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": {},
  "tags": []
}
```

(Key architectural choice: `Insert Order` fan-outs to BOTH `Respond` and `Geocode`. Customer gets their order number immediately; the geocode/update runs in parallel and is best-effort.)

- [ ] **Step 3: Deploy**

```bash
bash deploy.sh 2>&1 | tail -10
```

Expected: `Food: Order Intake (POST /order)                             ✓ activated (id=...)`.

- [ ] **Step 4: Smoke test — real address populates delivery_lat/lng; junk address leaves them NULL**

```bash
F=https://food.34-79-23-147.sslip.io
ORIGIN="https://neilthedevil.github.io"

# Real Lagos address
curl -sS -X POST "$F/webhook/order" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"customer_name":"Geo Test","customer_phone":"+234","delivery_address":"Tafawa Balewa Square, Lagos Island, Lagos","items":[{"id":"zobo","name":"Zobo","price":800,"qty":1}]}' \
  -o /tmp/r.json -w "code=%{http_code}\n"
GOOD=$(jq -r .order_number /tmp/r.json)
echo "GOOD=$GOOD"

# Junk address
curl -sS -X POST "$F/webhook/order" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"customer_name":"Junk","customer_phone":"+234","delivery_address":"qqqzzzxxxxxxxxxxxxxxxxxxzzz","items":[{"id":"zobo","name":"Zobo","price":800,"qty":1}]}' \
  -o /tmp/r.json -w "code=%{http_code}\n"
BAD=$(jq -r .order_number /tmp/r.json)
echo "BAD=$BAD"

# Wait a few seconds for the async geocode + update
sleep 8

# Inspect the DB
gcloud compute ssh n8n-server --zone=europe-west1-b --quiet \
  --command="sudo docker exec -i n8n-postgres-1 psql -U food -d food_app -c \"SELECT order_number, delivery_lat, delivery_lng FROM orders WHERE order_number IN ('$GOOD', '$BAD');\"" \
  < /dev/null
```

Expected:
- `GOOD` row → `delivery_lat` ≈ `6.45`, `delivery_lng` ≈ `3.39` (somewhere in Lagos Island).
- `BAD` row → both `NULL`.

- [ ] **Step 5: Commit**

```bash
git add workflows/01-order-intake.json
git commit -m "feat(workflow): geocode delivery_address via Nominatim (non-blocking)"
```

---

### Task 7: Expose delivery coords on GET /order and GET /admin/orders

**Files:**
- Modify: `workflows/02-get-order.json` — add `delivery_lat, delivery_lng` to SELECT
- Modify: `workflows/04-list-admin-orders.json` — same

- [ ] **Step 1: In `workflows/02-get-order.json`, extend the SELECT**

Find:

```json
"query": "SELECT order_number, customer_name, customer_phone, delivery_address, notes, items, total_amount, status, created_at, updated_at, rider_lat, rider_lng, rider_location_updated_at\nFROM orders\nWHERE order_number = $1\nLIMIT 1;",
```

Replace with:

```json
"query": "SELECT order_number, customer_name, customer_phone, delivery_address, notes, items, total_amount, status, created_at, updated_at, rider_lat, rider_lng, rider_location_updated_at, delivery_lat, delivery_lng\nFROM orders\nWHERE order_number = $1\nLIMIT 1;",
```

- [ ] **Step 2: In `workflows/04-list-admin-orders.json`, extend the `Fetch Orders` SELECT**

Find:

```json
"query": "SELECT order_number, customer_name, customer_phone, delivery_address, notes, items, total_amount, status, created_at, updated_at, rider_lat, rider_lng, rider_location_updated_at\nFROM orders\nORDER BY\n  CASE status\n    WHEN 'received' THEN 1\n    WHEN 'preparing' THEN 2\n    WHEN 'out_for_delivery' THEN 3\n    WHEN 'delivered' THEN 4\n    ELSE 5\n  END,\n  created_at DESC\nLIMIT 200;",
```

Replace with:

```json
"query": "SELECT order_number, customer_name, customer_phone, delivery_address, notes, items, total_amount, status, created_at, updated_at, rider_lat, rider_lng, rider_location_updated_at, delivery_lat, delivery_lng\nFROM orders\nORDER BY\n  CASE status\n    WHEN 'received' THEN 1\n    WHEN 'preparing' THEN 2\n    WHEN 'out_for_delivery' THEN 3\n    WHEN 'delivered' THEN 4\n    ELSE 5\n  END,\n  created_at DESC\nLIMIT 200;",
```

- [ ] **Step 3: Deploy**

```bash
bash deploy.sh 2>&1 | tail -10
```

Expected: both workflows re-imported + activated.

- [ ] **Step 4: Verify the coords come through the API**

Using the `GOOD` order number from Task 6 step 4:

```bash
curl -sS "https://food.34-79-23-147.sslip.io/webhook/order?o=$GOOD" \
  -H "Origin: https://neilthedevil.github.io" \
  | jq '{order_number, delivery_lat, delivery_lng}'
```

Expected: non-null `delivery_lat` and `delivery_lng` matching Task 6's DB check.

- [ ] **Step 5: Commit**

```bash
git add workflows/02-get-order.json workflows/04-list-admin-orders.json
git commit -m "feat(workflow): expose delivery_lat/lng on order read endpoints"
```

---

### Task 8: Destination pin + bounds fitting on track page

**Files:**
- Modify: `frontend/track.js` — extend `renderMap` with destination pin and bounds fit

- [ ] **Step 1: In `frontend/track.js`, declare a destination marker at the top near the other globals**

Find:

```javascript
let pollTimer = null;
let map = null;
let riderMarker = null;
```

Replace with:

```javascript
let pollTimer = null;
let map = null;
let riderMarker = null;
let destMarker = null;
```

- [ ] **Step 2: Rewrite the `renderMap` function to add destination pin + bounds fitting. Replace the entire existing `renderMap(order)` function with:**

```javascript
function renderMap(order) {
    const hasRider = order.status === 'out_for_delivery' && order.rider_lat != null && order.rider_lng != null;
    if (!hasRider) {
        $('map-section').classList.add('hidden');
        return;
    }
    $('map-section').classList.remove('hidden');
    const riderLatLng = [Number(order.rider_lat), Number(order.rider_lng)];
    const destLatLng = (order.delivery_lat != null && order.delivery_lng != null)
        ? [Number(order.delivery_lat), Number(order.delivery_lng)]
        : null;

    if (!map) {
        map = L.map('map', { zoomControl: true, attributionControl: true }).setView(riderLatLng, 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        const riderIcon = L.divIcon({
            className: 'rider-pin',
            html: '<div style="background:#d97706;color:white;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.35);border:3px solid white">🛵</div>',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
        });
        riderMarker = L.marker(riderLatLng, { icon: riderIcon }).addTo(map);
    } else {
        riderMarker.setLatLng(riderLatLng);
    }

    if (destLatLng) {
        if (!destMarker) {
            const destIcon = L.divIcon({
                className: 'dest-pin',
                html: '<div style="background:#059669;color:white;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,.35);border:3px solid white">🏠</div>',
                iconSize: [36, 36],
                iconAnchor: [18, 18],
            });
            destMarker = L.marker(destLatLng, { icon: destIcon }).addTo(map);
            const bounds = L.latLngBounds([riderLatLng, destLatLng]).pad(0.2);
            map.fitBounds(bounds);
        } else {
            destMarker.setLatLng(destLatLng);
        }
    }

    if (order.rider_location_updated_at) {
        const secs = Math.max(0, Math.floor((Date.now() - new Date(order.rider_location_updated_at).getTime()) / 1000));
        $('map-updated').textContent = secs < 60
            ? `Updated ${secs}s ago`
            : `Updated ${Math.floor(secs / 60)}m ${secs % 60}s ago`;
    }
    $('map-note').textContent = 'Live location from your rider, updated every ~15 seconds.';
}
```

- [ ] **Step 3: Commit and push**

```bash
git add frontend/track.js
git commit -m "feat(ui): destination pin + fit-to-bounds on tracking map"
git push origin main
```

- [ ] **Step 4: Wait for Pages deploy, then manual browser verification**

Poll for Pages deploy:

```bash
for i in $(seq 1 36); do
  status=$(curl -fsS "https://api.github.com/repos/NeilTheDevil/mamaskitchen/actions/runs?per_page=1" | jq -r '.workflow_runs[0] | "\(.status) \(.conclusion // "pending")"')
  echo "[$(date +%H:%M:%S)] $status"
  case "$status" in *"completed success"*) break ;; *"completed failure"*) echo "FAIL"; exit 1 ;; esac
  sleep 5
done
```

Browser check:
1. Use the `$GOOD` order from Task 6 or a fresh order placed at a real Lagos address.
2. In admin, advance the order to "Out for delivery".
3. Open `rider.html?o=$GOOD&key=$SECRET` on a phone, start tracking, let it send at least one ping.
4. Open `track.html?o=$GOOD` on another device → map appears with 🛵 rider pin and 🏠 destination pin, both visible in the viewport (bounds fit).

---

### Task 9: Recenter button + ETA label

**Files:**
- Modify: `frontend/track.html` — add recenter button + ETA span inside map-section
- Modify: `frontend/track.js` — wire recenter handler + ETA computation

- [ ] **Step 1: In `frontend/track.html`, replace the existing map-section block**

Find:

```html
            <div id="map-section" class="hidden mt-6 pt-5 border-t">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold">Rider location</h4>
                    <span id="map-updated" class="text-xs text-stone-500"></span>
                </div>
                <div id="map" class="w-full h-72 rounded-lg overflow-hidden bg-stone-100"></div>
                <p id="map-note" class="text-xs text-stone-500 mt-2"></p>
            </div>
```

Replace with:

```html
            <div id="map-section" class="hidden mt-6 pt-5 border-t">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-semibold">Rider location</h4>
                    <span id="map-eta" class="text-xs font-semibold text-emerald-700"></span>
                </div>
                <div class="relative">
                    <div id="map" class="w-full h-72 rounded-lg overflow-hidden bg-stone-100"></div>
                    <button id="map-recenter" type="button"
                        class="absolute bottom-3 right-3 bg-white text-stone-900 font-semibold text-xs px-3 py-2 rounded-lg shadow-md hover:bg-stone-50 border border-stone-200 z-[1000]">
                        📍 Recenter
                    </button>
                </div>
                <div class="flex items-center justify-between mt-2">
                    <p id="map-note" class="text-xs text-stone-500"></p>
                    <span id="map-updated" class="text-xs text-stone-500"></span>
                </div>
            </div>
```

- [ ] **Step 2: In `frontend/track.js`, add the ETA helper + recenter handler. Insert at the top of the file (before `let pollTimer`)**

```javascript
function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
function formatEta(km) {
    const speedKmh = 20; // conservative urban average
    const mins = (km / speedKmh) * 60;
    if (mins < 1) return '< 1 min away';
    return `~${Math.ceil(mins)} min away`;
}
```

- [ ] **Step 3: Inside `renderMap`, compute ETA whenever both rider and destination coords exist. Find this block near the bottom of `renderMap`:**

```javascript
    if (order.rider_location_updated_at) {
        const secs = Math.max(0, Math.floor((Date.now() - new Date(order.rider_location_updated_at).getTime()) / 1000));
        $('map-updated').textContent = secs < 60
            ? `Updated ${secs}s ago`
            : `Updated ${Math.floor(secs / 60)}m ${secs % 60}s ago`;
    }
    $('map-note').textContent = 'Live location from your rider, updated every ~15 seconds.';
```

Replace with:

```javascript
    if (order.rider_location_updated_at) {
        const secs = Math.max(0, Math.floor((Date.now() - new Date(order.rider_location_updated_at).getTime()) / 1000));
        $('map-updated').textContent = secs < 60
            ? `Updated ${secs}s ago`
            : `Updated ${Math.floor(secs / 60)}m ${secs % 60}s ago`;
    }
    if (destLatLng) {
        const km = haversineKm(riderLatLng, destLatLng);
        $('map-eta').textContent = formatEta(km);
    } else {
        $('map-eta').textContent = '';
    }
    $('map-note').textContent = 'Live location from your rider, updated every ~15 seconds.';
```

- [ ] **Step 4: Wire the recenter button. Add this at the very bottom of `track.js`, after the existing event listeners (after the `prefilled` block).**

```javascript
document.getElementById('map-recenter').addEventListener('click', () => {
    if (!map || !riderMarker) return;
    map.setView(riderMarker.getLatLng(), 15, { animate: true });
});
```

- [ ] **Step 5: Commit and push**

```bash
git add frontend/track.html frontend/track.js
git commit -m "feat(ui): recenter button + haversine ETA on tracking map"
git push origin main
```

- [ ] **Step 6: Wait for Pages deploy + browser verify**

```bash
for i in $(seq 1 36); do
  status=$(curl -fsS "https://api.github.com/repos/NeilTheDevil/mamaskitchen/actions/runs?per_page=1" | jq -r '.workflow_runs[0] | "\(.status) \(.conclusion // "pending")"')
  echo "[$(date +%H:%M:%S)] $status"
  case "$status" in *"completed success"*) break ;; *"completed failure"*) echo "FAIL"; exit 1 ;; esac
  sleep 5
done
```

Browser check:
- Open the same tracking page from Task 8.
- ETA text (e.g. `~12 min away`) appears in the header row of the map section.
- Pan/zoom the map away from the rider → tap 📍 Recenter → map snaps back to rider.

---

### Task 10: Final full-stack regression smoke

- [ ] **Step 1: Run the 10-check table from the spec end-to-end, top to bottom**

```bash
export PATH="/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
F=https://food.34-79-23-147.sslip.io
SECRET=a4afc781e30db7450755150ea086a0f7
ORIGIN="https://neilthedevil.github.io"

# 1 — menu_items seed
gcloud compute ssh n8n-server --zone=europe-west1-b --quiet \
  --command='sudo docker exec -i n8n-postgres-1 psql -U food -d food_app -c "SELECT count(*) FROM menu_items;"' < /dev/null
# 2 — GET /menu returns 8 items
curl -sS "$F/webhook/menu" -H "Origin: $ORIGIN" | jq '.items | length'
# 3 — upsert test item
curl -sS -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"action\":\"upsert\",\"key\":\"$SECRET\",\"item\":{\"id\":\"final-test\",\"name\":\"Final\",\"price\":100}}" -w "\nHTTP=%{http_code}\n"
# 4 — GET /menu includes it
curl -sS "$F/webhook/menu" -H "Origin: $ORIGIN" | jq '.items[] | select(.id=="final-test")'
# 5 — toggle unavailable
curl -sS -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"action\":\"upsert\",\"key\":\"$SECRET\",\"item\":{\"id\":\"final-test\",\"name\":\"Final\",\"price\":100,\"available\":false}}" | jq '.available'
# 6 — delete
curl -sS -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"action\":\"delete\",\"key\":\"$SECRET\",\"id\":\"final-test\"}" | jq '.id'
# 7 — admin menu without key → 401
curl -sS -o /dev/null -w "no-key=%{http_code}\n" -X POST "$F/webhook/admin/menu" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"action":"delete","id":"x"}'
# 8 — junk address order still succeeds
curl -sS -X POST "$F/webhook/order" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"customer_name":"Junk2","customer_phone":"+234","delivery_address":"qqqqqqqqqqqqqq","items":[{"id":"zobo","name":"Zobo","price":800,"qty":1}]}' | jq .
# 9 — real Lagos address populates coords (re-check after 8s)
curl -sS -X POST "$F/webhook/order" -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"customer_name":"FinalGeo","customer_phone":"+234","delivery_address":"Computer Village, Ikeja, Lagos","items":[{"id":"zobo","name":"Zobo","price":800,"qty":1}]}' \
  -o /tmp/r.json -w "code=%{http_code}\n"
ON=$(jq -r .order_number /tmp/r.json)
sleep 8
curl -sS "$F/webhook/order?o=$ON" -H "Origin: $ORIGIN" | jq '{order_number, delivery_lat, delivery_lng}'
```

Expected:
- #1 → 8 (or more if Task 5 added any)
- #2 → 8+
- #3 → HTTP=200 with the inserted row echoed
- #4 → shape `{id:"final-test", name:"Final", ...}`
- #5 → `false`
- #6 → `"final-test"`
- #7 → `no-key=401`
- #8 → 200 with an `order_number`
- #9 → `delivery_lat` and `delivery_lng` both non-null

- [ ] **Step 2: Tag the release**

```bash
git tag -a v1.1 -m "v1.1: menu admin + geocoded destination + map polish"
git push origin v1.1
```

---

## Deployment Notes

- `deploy.sh` continues to be the single entry point for VM-side changes; it is idempotent and always re-applies `init-db.sql`.
- Frontend is hosted on GitHub Pages; every push to `main` that touches `frontend/**` triggers the Pages workflow.
- Menu edits made through the admin UI are persisted to Postgres on the VM — not to the repo. `deploy.sh` only seeds; it never overwrites existing rows.
- If the VM is rebuilt from scratch, the `menu_items` table will be seeded with only the original 8 items; any admin-edited rows are lost. For a portfolio demo that's acceptable. Production would back up the DB.
