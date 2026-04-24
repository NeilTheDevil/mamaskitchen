# Home Page V1 Dark — Adaptation Design

**Date:** 2026-04-24
**Status:** Approved (verbal, before writing-plans)
**Source spec:** `c:/Users/HP/Downloads/Mamas-Kitchen-Handoff (1).md` (external handoff file; the authoritative source for all visual/content decisions)
**Scope:** Recreate the V1 Dark home page from the handoff, adapted to this codebase's stack.

## Goals

Ship a pixel-faithful recreation of the V1 Dark "returning-user home" design as the new landing page at `/`. Sections (in order):

1. Top bar — address switcher + cart button
2. Search input
3. "Order it again?" hero card (conditional — hidden when no last order)
4. Cuisines horizontal rail
5. Filter chips horizontal row
6. "Near you tonight" restaurant list
7. Bottom tab bar (mobile) / top nav (desktop)

Colors, typography, spacing, radii, copy, and imagery URLs are **locked by the handoff** — no alterations.

## Stack adaptation

The handoff assumes a framework'd environment (React/Vue/SvelteKit). This codebase is **plain HTML + Tailwind CDN + vanilla JS, no build step**. Adaptation rules:

| Handoff concept | Our implementation |
|---|---|
| React component | Plain `<section>` block in `home.html` |
| Inline styles | CSS custom properties in `<style>` block + Tailwind utilities for layout |
| `Photo` primitive | `.photo` CSS class (background-image cover-fit) |
| `Icon.*` JSX components | Lucide icons via CDN (`<i data-lucide="search">`) |
| `StatusBar` / `HomeBar` | **Omitted** — those are iOS chrome for the phone-artboard presentation only; not for web per spec ("Status bar (hidden on desktop)", "Home indicator — iOS native — omit on web") |
| Static `categories`/`featured` arrays | Static arrays in `home.js` with spec copy verbatim |
| `FOOD` map of Wikimedia URLs | Inline `const FOOD = {...}` in `home.js`, same URLs via `Special:FilePath` pattern |

Tailwind is used for layout (flex/grid/responsive breakpoints/spacing). A short `<style>` block handles: CSS custom properties (the design tokens), the `.photo`, `.serif`, `.mono`, `.pill` primitives. Tailwind can't express OKLCH tokens cleanly without config, and we have no config file — raw CSS is the cleanest path.

## Routing (decision: A)

- **Before:** `https://neilthedevil.github.io/mamaskitchen/` → `index.html` (menu grid).
- **After:** `https://neilthedevil.github.io/mamaskitchen/` → `home.html` (V1 Dark). The existing menu page moves to `menu.html`.

Concretely:
1. `frontend/index.html` (current menu page) → renamed to `frontend/menu.html`.
2. New `frontend/home.html` becomes the landing page.
3. GitHub Pages serves `home.html` at the root path — Pages treats `index.html` as the default, so we'll **also** create a tiny new `frontend/index.html` that's just a redirect to `home.html` (two-line meta refresh). Simpler than fighting Pages' default-file behavior, and means Caddy on the VM keeps working without any server config changes.

Links updated across the app:
- Hero "Reorder" button and all 4 restaurant cards on `home.html` link to `menu.html`.
- Success-modal "Track your order" link on `menu.html` still links to `track.html` (unchanged).
- Any existing back-to-home links in `track.html` or `admin.html` (`href="./"`) continue to resolve to the new home.

## File structure

**New:**
- `frontend/home.html` — the V1 Dark page. Uses Tailwind CDN + inline `<style>` for tokens + Lucide CDN.
- `frontend/home.js` — static arrays (`CATEGORIES`, `RESTAURANTS`, `FOOD`), render functions for the three repeating sections (cuisines rail, filter chips, restaurant list), last-order lookup from localStorage, cart badge wiring.
- `frontend/index.html` — **replaced** with a 5-line redirect shim: `<meta http-equiv="refresh" content="0; url=home.html">`.

**Renamed:**
- `frontend/index.html` (menu page) → `frontend/menu.html`. Internal hrefs/links inside it that currently reference `track.html?o=…` stay unchanged (relative paths).

**Unchanged:**
- `frontend/app.js` (still the menu/cart logic, imported by `menu.html`).
- `frontend/track.js`, `track.html`, `admin.*`, `rider.*`.
- All workflow JSONs and server configs.

## Token setup (verbatim from handoff)

Injected into `home.html`'s `<style>`:

```css
:root {
  --bg:          oklch(18% 0.018 45);
  --surface:     oklch(24% 0.022 45);
  --surface-2:  oklch(30% 0.020 45);
  --rule:        oklch(32% 0.020 45);
  --ink:         oklch(93% 0.020 80);
  --ink-2:       oklch(80% 0.020 75);
  --ink-3:       oklch(60% 0.020 75);
  --accent:      oklch(72% 0.16 45);
  --accent-ink:  #ffffff;
}
```

Fonts loaded from Google Fonts (identical to handoff's `<link>`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Body base: `font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;` Utility classes `.serif` (Instrument Serif) and `.mono` (Geist Mono).

## Icons — Lucide via CDN

```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons()</script>  <!-- called once after DOM render -->
```

Icon names used (all standard Lucide): `map-pin`, `chevron-down`, `search`, `clock`, `sliders-horizontal` (the "filter" hamburger-ish icon the handoff shows), `leaf`, `flame`, `star`, `shopping-bag`, `home`, `compass`, `heart`, `user`.

`sliders-horizontal` is Lucide's closest match to the handoff's 3-line filter icon; both have the staggered-lines look.

## Sections — fidelity notes

All spacing, font sizes, radii, borders, and copy come verbatim from the handoff. Key decisions for our stack:

**Photo primitive (`.photo`):**
```css
.photo { background-size: cover; background-position: center; background-color: #2a2520; }
```
Inline `style="background-image: url('…')"` on each element. Matches handoff's behavior without needing a React component.

**Top bar** — single flex row, `px-5 py-2 pb-3.5`:
- Left: two-line stack — "DELIVER TO" (mono, uppercase, 10px, `--ink-3`) over address + chevron.
- Right: 40×40 circular button with `shopping-bag` icon and badge when `cartCount > 0`.

**Hero "Order it again?"** — conditional render:
- If `localStorage['mk-last-order']` exists → render the card.
- Otherwise → render nothing (no empty state, per handoff).
- Last-order is populated from the existing success-modal flow in `menu.html` — minor addition to `app.js` to write `mk-last-order = { order_number, items, total, timestamp, restaurant: 'Iya Bisi Kitchen' }` after a successful order. For now (portfolio placeholder), when no real last order exists, the card is hidden.

**Cuisines rail** — horizontal flex, `overflow-x: auto`, hide scrollbar. 72×72 tiles.

**Filter chips** — horizontal flex, `overflow-x: auto`. First chip has inverse style (`--ink` bg, `--bg` text). Chips are non-interactive for now (click handlers are placeholders that `console.log`; real filtering is out of scope for this spec).

**Restaurant list** — mobile: flex column with 18px gap. Tablet (≥640): 2-col grid. Desktop (≥1024): 3-col grid. Image is 150px tall on mobile, scales to container on larger screens.

**Bottom tab bar** (mobile only, ≤640px) / **top nav** (≥640):
- Mobile: `position: fixed; bottom: 0`, 5-column grid, `Home` active.
- Tablet+: transforms into a top nav row — logo "Mama's Kitchen" (Instrument Serif) left, tab labels center, address switcher + cart right.
- `Home` tab is active; the other 4 (`Explore`, `Orders`, `Saved`, `Me`) are visual placeholders — click handlers `console.log`; routes don't exist yet (deferred, not in scope).

## Responsive behavior (tailwind breakpoint map)

- `< sm` (640px): mobile — match handoff 390px layout. Bottom tab bar visible.
- `sm` → `lg` (640–1023px): `max-w-[720px] mx-auto`. Restaurant list → 2-col grid. Top nav replaces tab bar.
- `≥ lg` (1024px): `max-w-[1200px] mx-auto`. Restaurant list → 3-col grid. Cuisines rail still horizontal but visible at full spread. Hero card caps at `max-w-[720px]`.

## Data sources

**Static (in `home.js`), matching handoff exactly:**
- `FOOD` map — Wikimedia `Special:FilePath` URLs for 14 images.
- `CATEGORIES` — 7 entries: Jollof, Suya, Egusi, Pounded Yam, Small Chops, Pepper Soup, Plantain.
- `RESTAURANTS` — 4 entries: Iya Bisi Kitchen, Mama Put, Suya Spot 87, Beans & Dodo. All fields (rating, ETA, fee, tag, src) verbatim from spec.
- `FILTERS` — 5 entries: Filters, Under 30 min, Spicy, Vegetarian, Free delivery.

**Dynamic (localStorage):**
- `cartCount` = sum of quantities in `mk-cart-v1` (existing key from `app.js`).
- `lastOrder` = `mk-last-order` — new key. Written by a small addition to `app.js`'s checkout-success handler. Empty = hide hero card.
- `address` = `mk-profile-v1.delivery_address` (existing key) if present; fallback to default "14 Admiralty Way, Lekki" from the handoff.

**TODO comment** at the top of `home.js`:
```js
// TODO: licensing/attribution — images are CC-BY-SA on Wikimedia Commons.
// Replace with owned photography before commercial use, or display attribution
// per https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
```

## Interactions — what's wired vs. placeholder

**Wired:**
- Cart button → navigate to `menu.html` (we don't have a separate cart view, so the menu's sidebar cart is the right destination).
- Cart badge → reflects `mk-cart-v1` content.
- Hero "Reorder" button → visible only if `mk-last-order` exists; clicking it (a) replays `mk-last-order.items` into `mk-cart-v1` and (b) navigates to `menu.html` with `?checkout=1` hash that `app.js` can read to auto-open the checkout modal. Small addition to `app.js`: if `location.search.includes('checkout=1')`, programmatically click the checkout button on load.
- Restaurant cards → navigate to `menu.html` (one menu, one effective restaurant; all cards land there for the portfolio demo).
- Address text → clicking opens a `prompt()` dialog to let the user enter a new address string, stored under `mk-profile-v1.delivery_address`. Simple, zero-dependency placeholder for the "address sheet" described in the spec.

**Placeholder (non-wired, spec-reserved):**
- Search input → `console.log('search opened')`, no real search UX.
- "See all" link on Cuisines → no-op.
- Individual cuisine tiles → no-op (real filtering would need a per-restaurant menu system we don't have).
- Filter chips (except visuals) → no-op.
- Bottom tab bar / top nav tabs other than Home → no-op.

## Non-goals (out of scope)

- **Real search page.**
- **Filter sheet / actual filtering logic.**
- **Real "Explore / Orders / Saved / Me" routes.**
- **Per-restaurant menus** — all restaurant cards link to the single existing menu.
- **Address-picker sheet with autocomplete** — using a `prompt()` instead.
- **Hero-card click-to-open order summary** — only the Reorder button is wired; card click is no-op.
- **Hover lift / press scale animations** — skipping; Tailwind's default transition is fine for now.
- **Download Wikimedia images to our CDN / add attribution captions** — deferred per spec "either/or" option (we're using option 1: inline URLs, with a TODO).

## Testing plan

Smoke tests (no automated framework — visual check + browser devtools):

| # | Check | Verification |
|---|---|---|
| 1 | `frontend/home.html` serves at `https://neilthedevil.github.io/mamaskitchen/home.html` | `curl -I .../home.html` → 200 |
| 2 | `frontend/index.html` redirects to `home.html` | `curl -I .../` returns 200 with meta refresh to `home.html` |
| 3 | Menu still reachable at `/menu.html` | `curl -I .../menu.html` → 200 |
| 4 | Fonts load from Google Fonts | Check `home.html` response → link tags present |
| 5 | Lucide icons render | Browser check: search, pin, bag, star icons all visible |
| 6 | Mobile layout (390px) matches prototype | Chrome DevTools device toolbar at 390×844 — visual diff against prototype |
| 7 | Tablet layout (720px) — 2-col restaurant grid, top nav | DevTools 720×1024 |
| 8 | Desktop layout (1280px) — 3-col, capped width | DevTools 1280×800 |
| 9 | Cart badge reflects existing localStorage cart | Add item on `/menu.html`, return to `/home.html`, badge shows count |
| 10 | Hero card hidden when no last order | Clear `mk-last-order` in localStorage, reload — card absent |
| 11 | Hero "Reorder" → adds items to cart + redirects to menu with auto-checkout | Manual browser test |
| 12 | All restaurant cards navigate to `menu.html` | Click test |
| 13 | GitHub Pages deploy succeeds | Pages workflow green; commit SHA visible in the deployed HTML |

## Deploy

- Unchanged server/workflow deploy flow. `deploy.sh` already bundles the whole `frontend/` directory and uploads via scp.
- GitHub Pages workflow triggers on pushes to `main` that touch `frontend/**` (existing config) — no workflow edits needed.

## Risk log

- **Lucide CDN availability** — if unpkg goes down, icons don't render. Mitigation: SVG fallback for the 13 icons could be inlined later; for now the CDN is reliable enough for a portfolio demo.
- **OKLCH browser support** — Safari ≥15.4, Chrome ≥111, Firefox ≥113. All current major browsers support it. No fallback needed.
- **Wikimedia image latency** — Wikimedia's `Special:FilePath` redirect + thumbnailer can occasionally be slow (500ms–2s first hit). If this hurts the demo, step-2 of "Replace with real brand/partner photography" from the handoff becomes urgent. Out of scope for this spec.
- **Existing in-progress admin-menu branch** — work on this branch is paused at Task 5 (admin menu UI committed, not yet reviewed). When the home-page branch merges to main, the admin-menu branch will need a rebase. Minor conflict expected only in `frontend/index.html` (which we're replacing with a redirect stub) and `frontend/menu.html` (formerly `index.html`). Resolution plan: rebase the admin-menu branch onto main post-home-page-merge, re-apply the Task 4/5 patches to `menu.html` instead of `index.html`.

## Implementation order (will translate to task list in writing-plans)

1. Create new feature branch (done: `feature/home-page-v1-dark`).
2. Rename `frontend/index.html` → `frontend/menu.html`. Update any internal references.
3. Create `frontend/index.html` as a 5-line redirect shim to `home.html`.
4. Create `frontend/home.html` shell — `<head>` with fonts + Lucide + Tailwind CDN + token `<style>` block, `<body>` with empty section scaffolding.
5. Build top bar section (HTML + JS wiring for cart badge + address prompt).
6. Build search input (visual only).
7. Build hero "Order it again?" card (conditional render via JS based on `mk-last-order`).
8. Build cuisines rail (JS template render from `CATEGORIES` array).
9. Build filter chips (static HTML + inverse-style first chip).
10. Build "Near you tonight" list (JS template render from `RESTAURANTS`, with responsive grid).
11. Build bottom tab bar + top nav toggle via media query/Tailwind `sm:hidden` + `hidden sm:flex`.
12. Update `app.js` to: (a) persist `mk-last-order` on checkout success, (b) auto-open checkout if `?checkout=1` on load.
13. Deploy + Pages rebuild + full smoke checklist.
14. Commit + push + merge to main.
