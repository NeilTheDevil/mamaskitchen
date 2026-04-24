# Menu Admin CRUD + Geocoded Destination Pin + Map Polish — Design

**Date:** 2026-04-24
**Status:** Approved (verbal, before writing-plans)
**Scope:** Three incremental features on the existing Mama's Kitchen stack.

## Goals

1. **Menu admin CRUD** — move the menu from hardcoded `app.js` into a `menu_items` DB table, with admin UI to add/edit/delete items and toggle availability.
2. **Geocoded destination pin** — show the customer's delivery address as a pin on the tracking map alongside the live rider pin.
3. **Map polish** — add a "recenter on rider" button and a rough ETA estimate.

## Non-goals (out of scope)

- Drag-and-drop menu reordering (use numeric `sort_order` field instead)
- Menu item images / image upload (keeps emoji + Tailwind gradient as-is)
- Re-geocoding on address edits (orders are immutable post-create)
- Direction-of-travel arrow on rider pin (rejected: GPS jitter + 15s ping interval makes it unreliable)
- Retry queue for failed geocodes (fail-open: order succeeds without the pin)
- Route polyline between rider and destination (haversine straight-line is enough for portfolio)

## Feature 1 — Menu Admin CRUD

### Schema

Add to `server/init-db.sql` (idempotent — `CREATE TABLE IF NOT EXISTS`, `INSERT ON CONFLICT DO NOTHING`):

```sql
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

-- Seed the 8 existing items (idempotent via ON CONFLICT DO NOTHING)
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

### Backend — new workflows

**Workflow 06 — `GET /webhook/menu` (public):**
- Returns `{ items: [...] }` sorted by `sort_order, name`. **Returns all items, including `available = false`** — each row carries an `available` bool and clients filter as needed.
- Rationale: admin UI needs to list unavailable items to toggle them back to available. Keeping one endpoint avoids duplicating the query and a separate auth'd read-only endpoint for the admin.
- Customer (`app.js`) filters to `available = true` before rendering the menu grid.
- Admin renders everything, with an "unavailable" pill on non-available rows.
- CORS: `https://neilthedevil.github.io`.
- No auth — public endpoint, same trust model as `POST /order`. (An attacker seeing that "puff-puff is sold out today" is a non-issue.)

**Workflow 07 — `POST /webhook/admin/menu` (admin-key gated):**
- Body shape: `{ action: "upsert" | "delete", key: ADMIN_SECRET, item?: {...}, id?: string }`.
- `action: "upsert"` — full-row insert-or-update. Uses `INSERT ... ON CONFLICT (id) DO UPDATE`. Validates required fields (`id`, `name`, `price`). Rejects negative price.
- `action: "delete"` — hard delete by id.
- 401 if key mismatches. 400 if action unknown or validation fails.

Deliberately no separate "toggle available" action — `upsert` with `available: false` is enough. One verb, one code path.

### Frontend

**`frontend/app.js`:**
- `index.html` script calls `GET /webhook/menu` on load, populates `MENU` array with only `available=true` rows, then calls `renderMenu()` as today.
- Removes the hardcoded `MENU` array.
- If the fetch fails, shows an error state ("Menu unavailable — try again in a minute") instead of crashing.

**`frontend/admin.html` + `admin.js`:**
- Top of admin page: two tab buttons — **Orders** (current view) / **Menu** (new view). Simple client-side swap between two `<section>` elements, no routing.
- **Menu view:**
  - Table of items with: name, price, emoji/bg preview, available toggle, sort_order, edit button, delete button.
  - "Add item" button opens a modal with the full edit form.
  - Edit reuses the same modal.
  - Delete uses `confirm()` prompt.
  - Reloads from `/webhook/menu` after every successful mutation.
- Auth: same `ADMIN_SECRET` from URL `?key=` param.

### Interaction with existing `orders`

Historical orders embed `{id, name, price, qty}` in their `items` JSONB snapshot — not a FK to `menu_items`. So deleting or editing a menu item has **no effect on past orders**. Safe by design.

## Feature 2 — Geocoded Destination Pin

### Schema addition (to `init-db.sql`)

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9, 6);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9, 6);
```

### Workflow 01 change (order intake)

Insert a new node after **Insert Order**, before **Respond**:

- **HTTP Request — Geocode** (node type `n8n-nodes-base.httpRequest`):
  - GET `https://nominatim.openstreetmap.org/search?q=<address>&format=json&limit=1&countrycodes=ng`
  - Headers: `User-Agent: MamasKitchen/1.0 (portfolio)` (Nominatim requires a distinguishing UA)
  - Timeout: 5s
  - `continueOnFail: true` — order succeeds even if geocode fails
- **Code — Parse Geocode**: extracts `lat/lng` from first result, falls back to nulls on missing/error.
- **Postgres — Update Coords**: `UPDATE orders SET delivery_lat=$2, delivery_lng=$3 WHERE order_number=$1` (non-blocking; failures logged only).

Respond node still uses the **Insert Order** output for `order_number` — geocode never blocks the user response.

Rate limit: Nominatim asks for max 1 req/sec. We won't hit this at portfolio traffic; no extra throttling needed.

### Workflow 02 / 04 change

Add `delivery_lat, delivery_lng` to the SELECT lists (both `GET /order` and `GET /admin/orders`).

### Frontend (track.js)

- `renderMap(order)`:
  - Compute `bounds = L.latLngBounds()`. Add rider coords if present. Add `[delivery_lat, delivery_lng]` if both set. Fit map to bounds.
  - Delivery pin: 🏠 emoji in a green divIcon to distinguish from the 🛵 rider pin.
  - If `delivery_lat` missing, behave exactly as today (rider-only pin centered).

## Feature 3 — Map Polish

### Recenter button

- Floating button (bottom-right of map div) labelled "📍 Recenter".
- Click → `map.setView([rider_lat, rider_lng], 15)`.
- Hidden when rider coords absent.

### ETA estimate

- Shown next to "Updated Ns ago" when both rider and destination coords exist.
- Computation: haversine distance (km) between rider and destination ÷ **20 km/h** (urban assumption) → minutes, rounded up.
- Text: `"~N min away"` if ≥1 min, `"< 1 min away"` if closer, nothing if data missing.
- Pure client-side JS, no new endpoints.

## Deploy / migration

`deploy.sh` already re-applies `init-db.sql` on every deploy (the schema-sync step added in 04-23). New `CREATE TABLE`, `ALTER TABLE`, and `INSERT ON CONFLICT` statements are idempotent — they roll forward on existing DBs without wiping the volume.

Workflow imports in deploy.sh step 6 are glob-based (`workflows/*.json`) — new 06/07 files are picked up automatically.

No docker-compose or Caddy changes.

## Testing plan

Run after deploy on the live VM, from the shell:

| # | Check | Command |
|---|-------|---------|
| 1 | Menu table exists + seeded | `psql ... SELECT count(*) FROM menu_items` → 8 |
| 2 | `GET /menu` returns 8 items | `curl .../webhook/menu \| jq '.items \| length'` → 8 |
| 3 | Admin upsert creates item | POST with `action:upsert, item:{id:"test",name:"T",price:100,...}` → 200 |
| 4 | New item in `GET /menu` | `curl .../menu \| jq '.items[] \| select(.id=="test")'` → present |
| 5 | Toggle available=false hides from customer menu but API still returns it | upsert `available:false`, `GET /menu` → item still present with `available:false`; customer page load → item not in grid |
| 6 | Admin delete removes from table | `action:delete, id:"test"` → 200; `GET /menu` → absent |
| 7 | Admin without key → 401 | `POST /admin/menu` without `key` |
| 8 | Order intake still succeeds with geocode failure | break address (random gibberish) → order returns 200, `delivery_lat` is NULL |
| 9 | Order intake populates coords for known Lagos address | real address → `delivery_lat/lng` set within 30s |
| 10 | Track page shows both pins + ETA | seed order with geocode + rider ping → browser check |

## Implementation order (for the plan)

1. Schema + seed migration
2. Workflow 06 (GET menu) + activate
3. Workflow 07 (admin menu) + activate
4. Frontend: switch index.html menu to API-driven
5. Frontend: add Menu tab to admin.html
6. Workflow 01: inject Geocode → Parse → Update nodes
7. Workflows 02/04: add `delivery_lat/lng` to SELECTs
8. track.js: destination pin + bounds fitting
9. track.js: recenter button + ETA
10. Redeploy + full test checklist
11. Commit + push (GitHub Actions redeploys Pages)

## Risk log

- **Nominatim returning poor results for vague Nigerian addresses** — acceptable; if geocode returns a far-off match the pin is slightly wrong but the app doesn't break. Customer still has text address; rider still tracks in real time.
- **Nominatim 503/timeout** — `continueOnFail: true` means order succeeds. Pin just missing.
- **Stale seed vs edited items** — seed uses `ON CONFLICT DO NOTHING`, so re-deploy never overwrites an admin's edits. Adding a new row via seed only works if id doesn't exist.
- **Leaflet integrity hashes** — already pinned from previous work, no change.
