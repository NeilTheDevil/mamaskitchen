# Home Page V1 Dark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pixel-faithful recreation of the V1 Dark dark-espresso home page as the new landing URL for Mama's Kitchen, with the existing menu page moved to `menu.html`.

**Architecture:** Plain HTML + Tailwind CDN + a `<style>` block carrying the OKLCH design tokens + Lucide via CDN + vanilla JS for dynamic section rendering from static arrays. Zero framework additions, zero build step. The current `index.html` (menu) is renamed to `menu.html`; the new `index.html` is a 5-line meta-refresh redirect shim to `home.html` so GitHub Pages' default-file behavior keeps working unchanged.

**Tech Stack:** HTML5, Tailwind CDN, Google Fonts (Instrument Serif / Geist / Geist Mono), Lucide icons via unpkg CDN, vanilla JS, OKLCH CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-04-24-home-page-v1-dark-design.md`
**Handoff (source of all design decisions):** `c:/Users/HP/Downloads/Mamas-Kitchen-Handoff (1).md`

---

## File Structure

**Created:**
- `frontend/home.html` — the V1 Dark home page (built up incrementally across tasks)
- `frontend/home.js` — static arrays + section render functions + interaction wiring
- `frontend/index.html` — new 5-line redirect shim to `home.html` (created AFTER the rename in Task 1)

**Renamed:**
- `frontend/index.html` → `frontend/menu.html` (existing menu page; contents unchanged)

**Modified:**
- `frontend/app.js` — add `mk-last-order` localStorage write on checkout success + auto-open checkout on `?checkout=1` query param

**Unchanged:** `track.html`, `track.js`, `admin.html`, `admin.js`, `rider.html`, `rider.js`, all workflow JSONs, all server configs.

**Environment expectations:**
- Working directory: `c:/Users/HP/Desktop/n8n setup and mcp in ClaudeCode`
- Git Bash on Windows. Current branch: `feature/home-page-v1-dark` (already created off `feature/menu-admin-and-map-polish`).
- No test framework — verification is `grep`/`curl`/browser-DevTools smoke tests.
- GitHub Pages deploy workflow (`.github/workflows/pages.yml`) triggers on push to `main`, path-filtered to `frontend/**`. Feature-branch pushes do NOT trigger Pages. Live browser smoke will happen after merge in Task 13.

---

### Task 1: Rename index.html → menu.html, create redirect-shim index.html

**Files:**
- Rename: `frontend/index.html` → `frontend/menu.html`
- Create: `frontend/index.html` (new, 5 lines)

- [ ] **Step 1: Rename the menu page with `git mv` so history follows**

```bash
cd "c:/Users/HP/Desktop/n8n setup and mcp in ClaudeCode"
git mv frontend/index.html frontend/menu.html
```

- [ ] **Step 2: Create the new redirect-shim `frontend/index.html`**

Write this exact content to `frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=home.html">
<title>Mama's Kitchen</title>
<link rel="canonical" href="home.html">
</head>
<body>
<p>Redirecting to <a href="home.html">home</a>…</p>
</body>
</html>
```

- [ ] **Step 3: Verify file state**

```bash
ls -la frontend/index.html frontend/menu.html
grep -c "menu-grid" frontend/menu.html        # expect 1 (inherited from old index.html)
grep -c 'refresh.*home.html' frontend/index.html   # expect 1
```

Expected: both files exist, `menu.html` has the old menu markup, `index.html` is the 10-line shim.

- [ ] **Step 4: Check nothing else references `/index.html` or absolute paths**

```bash
grep -rn 'href="index.html"\|href="/index.html"' frontend/ | grep -v "frontend/index.html:"
```

Expected: no output (the redirect shim is the only place `index.html` is mentioned). If anything else references `index.html`, update those to `menu.html` — but a quick audit of the existing files shows only the header "← Back to menu" link in `track.html` uses `href="./"`, which will resolve to the new `home.html` via the redirect shim. That's fine.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(routing): rename index.html to menu.html + add redirect shim"
```

---

### Task 2: Create home.html skeleton (tokens, fonts, Lucide, empty main)

**Files:**
- Create: `frontend/home.html`

- [ ] **Step 1: Create `frontend/home.html` with the full skeleton below**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mama's Kitchen — Home</title>
    <meta name="description" content="Nigerian home-cooked meals, delivered fast." />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />

    <script src="https://cdn.tailwindcss.com"></script>

    <style>
        :root {
            --bg:          oklch(18% 0.018 45);
            --surface:     oklch(24% 0.022 45);
            --surface-2:   oklch(30% 0.020 45);
            --rule:        oklch(32% 0.020 45);
            --ink:         oklch(93% 0.020 80);
            --ink-2:       oklch(80% 0.020 75);
            --ink-3:       oklch(60% 0.020 75);
            --accent:      oklch(72% 0.16 45);
            --accent-ink:  #ffffff;
        }
        html, body {
            margin: 0; padding: 0;
            background: var(--bg); color: var(--ink);
            font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        .serif { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; letter-spacing: -0.01em; }
        .mono  { font-family: 'Geist Mono', ui-monospace, monospace; }
        .photo {
            background-size: cover;
            background-position: center;
            background-color: #2a2520;
        }
        .pill {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 7px 12px; border-radius: 999px;
            font-size: 12px; font-weight: 500;
            white-space: nowrap;
            border: 1px solid transparent;
        }
        .scroll-x { overflow-x: auto; scrollbar-width: none; }
        .scroll-x::-webkit-scrollbar { display: none; }
        /* Lucide icons inherit current color by default */
        .lucide { flex-shrink: 0; }
    </style>
</head>
<body>
    <div id="home-root" class="min-h-screen flex flex-col">
        <!-- Top bar (task 4) -->
        <header id="top-bar"></header>

        <main class="flex-1 pb-24 sm:pb-8">
            <!-- Sections rendered in order:
                 - Search (task 5)
                 - Hero "Order it again?" (task 6)
                 - Cuisines rail (task 7)
                 - Filter chips (task 8)
                 - Near you tonight (task 9) -->
            <section id="search-section"></section>
            <section id="hero-section"></section>
            <section id="cuisines-section"></section>
            <section id="filters-section"></section>
            <section id="restaurants-section"></section>
        </main>

        <!-- Bottom tab bar mobile / top nav desktop (task 10) -->
        <nav id="bottom-nav"></nav>
    </div>

    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
    <script src="home.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify file loads and parses**

```bash
grep -c "oklch" frontend/home.html                        # expect >=9 (each token)
grep -c "Instrument+Serif" frontend/home.html             # expect 1
grep -c "lucide@latest" frontend/home.html                # expect 1
grep -c 'src="home.js"' frontend/home.html                # expect 1
grep -c 'id="top-bar"\|id="search-section"\|id="hero-section"\|id="cuisines-section"\|id="filters-section"\|id="restaurants-section"\|id="bottom-nav"' frontend/home.html
# expect 7
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.html
git commit -m "feat(home): skeleton with OKLCH tokens, fonts, Lucide CDN"
```

---

### Task 3: Create home.js with static data + init stub

**Files:**
- Create: `frontend/home.js`

- [ ] **Step 1: Create `frontend/home.js` with this exact content**

```javascript
// Mama's Kitchen home page (V1 Dark).
//
// TODO: licensing/attribution — all imagery is CC-BY-SA from Wikimedia Commons.
// Replace with owned photography before commercial use, or display attribution
// per https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia

const wm = (name, w = 800) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${w}`;

const FOOD = {
    jollof:        wm('Jollof_rice_and_Dodo.jpg'),
    jollofVeg:     wm('Jollof_rice_with_vegetable.jpg'),
    egusi:         wm('Eba_and_Egusi_soup.JPG'),
    egusiBowl:     wm('EGUSI_SOUP.JPG'),
    suya:          wm('Steak_Suya.jpg'),
    suyaOnions:    wm('Nigerian_home_made_suya_and_sliced_onions.png'),
    poundedYam:    wm('Plates_of_Egusi_Soup_with_vegetables_and_wrapped_Pounded_Yam.jpg'),
    puffPuff:      wm('Puff_puff_1.jpg'),
    pepperSoup:    wm('Catfish_Pepper_Soup.jpg'),
    plantain:      wm('Fried_plantain.jpg'),
    beansPlantain: wm('Beans_and_plantain.jpg'),
};

const CATEGORIES = [
    { label: 'Jollof',      src: FOOD.jollof },
    { label: 'Suya',        src: FOOD.suya },
    { label: 'Egusi',       src: FOOD.egusiBowl },
    { label: 'Pounded Yam', src: FOOD.poundedYam },
    { label: 'Small Chops', src: FOOD.puffPuff },
    { label: 'Pepper Soup', src: FOOD.pepperSoup },
    { label: 'Plantain',    src: FOOD.plantain },
];

const RESTAURANTS = [
    { name: 'Iya Bisi Kitchen', tag: 'Jollof · Homestyle',     rating: '4.8', eta: '25–35 min', fee: '$2.99', src: FOOD.jollof },
    { name: 'Mama Put',         tag: 'Soup bar · Egusi & Eba', rating: '4.7', eta: '20–30 min', fee: 'Free',  src: FOOD.egusi },
    { name: 'Suya Spot 87',     tag: 'Grills · Late night',    rating: '4.9', eta: '30–40 min', fee: '$1.49', src: FOOD.suyaOnions },
    { name: 'Beans & Dodo',     tag: 'Breakfast · All day',    rating: '4.6', eta: '15–25 min', fee: '$0.99', src: FOOD.beansPlantain },
];

const FILTERS = [
    { label: 'Filters',        icon: 'sliders-horizontal', primary: true },
    { label: 'Under 30 min',   icon: 'clock' },
    { label: 'Spicy',          icon: 'flame' },
    { label: 'Vegetarian',     icon: 'leaf' },
    { label: 'Free delivery' },
];

const DEFAULT_ADDRESS = '14 Admiralty Way, Lekki';

// Helpers
const $ = (id) => document.getElementById(id);
const getCart = () => { try { return JSON.parse(localStorage.getItem('mk-cart-v1')) || {}; } catch { return {}; } };
const getCartCount = () => Object.values(getCart()).reduce((s, q) => s + Number(q || 0), 0);
const getLastOrder = () => { try { return JSON.parse(localStorage.getItem('mk-last-order')) || null; } catch { return null; } };
const getProfile = () => { try { return JSON.parse(localStorage.getItem('mk-profile-v1')) || {}; } catch { return {}; } };
const saveProfile = (p) => localStorage.setItem('mk-profile-v1', JSON.stringify(p));
const formatNaira = (n) => '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 });

// Renderers (filled in later tasks).
function renderTopBar() {}
function renderSearch() {}
function renderHero() {}
function renderCuisines() {}
function renderFilters() {}
function renderRestaurants() {}
function renderBottomNav() {}

function initHome() {
    renderTopBar();
    renderSearch();
    renderHero();
    renderCuisines();
    renderFilters();
    renderRestaurants();
    renderBottomNav();
    if (window.lucide) lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHome);
} else {
    initHome();
}
```

- [ ] **Step 2: Verify file shape**

```bash
grep -c "const FOOD = {" frontend/home.js               # expect 1
grep -c "const CATEGORIES = \[" frontend/home.js        # expect 1
grep -c "const RESTAURANTS = \[" frontend/home.js       # expect 1
grep -c "Iya Bisi Kitchen" frontend/home.js             # expect 1
grep -c "function render" frontend/home.js              # expect 7
grep -c "initHome" frontend/home.js                     # expect 2 (definition + caller/s)
```

Count note: `initHome` appears in 3 places — the `function initHome()` declaration, the `DOMContentLoaded` listener, and the `else` branch. Accept ≥2.

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): static data arrays + render stubs + DOM init"
```

---

### Task 4: Top bar (address switcher + cart button)

**Files:**
- Modify: `frontend/home.js` — fill `renderTopBar()`

- [ ] **Step 1: Replace the empty `function renderTopBar() {}` in `frontend/home.js` with this**

```javascript
function renderTopBar() {
    const profile = getProfile();
    const address = profile.delivery_address || DEFAULT_ADDRESS;
    const count = getCartCount();

    $('top-bar').innerHTML = `
        <div class="max-w-[1200px] mx-auto px-5 pt-1.5 pb-3.5 flex items-center justify-between">
            <button id="address-btn" type="button" class="text-left hover:opacity-80 transition-opacity">
                <div class="mono uppercase tracking-[0.12em] text-[10px]" style="color: var(--ink-3)">Deliver to</div>
                <div class="flex items-center gap-1.5 text-base font-semibold mt-0.5" style="color: var(--ink)">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                    <span id="address-text">${address}</span>
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
                </div>
            </button>
            <a id="cart-btn" href="menu.html" class="relative w-10 h-10 rounded-full flex items-center justify-center"
                style="background: var(--surface); border: 1px solid var(--rule); color: var(--ink)">
                <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                ${count > 0 ? `
                    <span class="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center"
                        style="background: var(--accent); color: var(--accent-ink)">${count}</span>
                ` : ''}
            </a>
        </div>
    `;

    $('address-btn').addEventListener('click', () => {
        const next = prompt('Delivery address', address);
        if (next && next.trim() && next.trim() !== address) {
            const p = getProfile();
            p.delivery_address = next.trim();
            saveProfile(p);
            $('address-text').textContent = next.trim();
        }
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "Deliver to" frontend/home.js                   # expect 1
grep -c "address-btn\|cart-btn" frontend/home.js        # expect 4 (2 ids in HTML + 2 click binds)
grep -c "map-pin\|shopping-bag" frontend/home.js        # expect 2
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): top bar with address switcher + cart badge"
```

---

### Task 5: Search input

**Files:**
- Modify: `frontend/home.js` — fill `renderSearch()`

- [ ] **Step 1: Replace the empty `function renderSearch() {}` in `frontend/home.js` with this**

```javascript
function renderSearch() {
    $('search-section').innerHTML = `
        <div class="max-w-[1200px] mx-auto px-5 pb-[18px]">
            <button id="search-btn" type="button"
                class="w-full flex items-center gap-2.5 px-4 py-3.5 rounded-[14px] text-left hover:opacity-95 transition-opacity"
                style="background: var(--surface); border: 1px solid var(--rule); color: var(--ink-3); font-size: 14px;">
                <i data-lucide="search" class="w-[18px] h-[18px]"></i>
                <span>Search jollof, suya, egusi…</span>
            </button>
        </div>
    `;
    $('search-btn').addEventListener('click', () => {
        console.log('search opened (placeholder — not wired to a search page)');
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "Search jollof, suya, egusi" frontend/home.js   # expect 1
grep -c "search-btn" frontend/home.js                   # expect 2
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): search input (visual placeholder)"
```

---

### Task 6: Hero "Order it again?" card (conditional)

**Files:**
- Modify: `frontend/home.js` — fill `renderHero()`

- [ ] **Step 1: Replace the empty `function renderHero() {}` in `frontend/home.js` with this**

```javascript
function renderHero() {
    const last = getLastOrder();
    if (!last) {
        $('hero-section').innerHTML = '';
        return;
    }
    // Last order shape (written by app.js after checkout):
    //   { order_number, items: [...], total, timestamp, restaurant, summary, tracking_url }
    const summary = last.summary || (last.items && last.items[0] ? last.items[0].name : 'your last order');
    const restaurant = last.restaurant || 'Mama\'s Kitchen';
    const total = formatNaira(last.total || 0);
    const when = last.timestamp ? new Date(last.timestamp) : null;
    const whenLabel = when
        ? when.toLocaleDateString('en-NG', { weekday: 'short' }) + ' ' +
          when.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '')
        : '';
    const heroImg = FOOD.jollof;

    $('hero-section').innerHTML = `
        <div class="max-w-[720px] mx-auto px-5 pb-6">
            <div class="flex items-center justify-between mb-2.5">
                <h2 class="serif text-2xl leading-none" style="color: var(--ink)">Order it again?</h2>
                ${whenLabel ? `<span class="mono text-[11px]" style="color: var(--ink-3)">${whenLabel}</span>` : ''}
            </div>
            <div class="rounded-[18px] overflow-hidden flex" style="background: var(--surface); border: 1px solid var(--rule);">
                <div class="photo w-[120px] flex-shrink-0" style="background-image: url('${heroImg}')"></div>
                <div class="flex-1 p-3.5 pl-4 flex flex-col justify-between min-w-0">
                    <div>
                        <div class="text-[15px] font-semibold truncate" style="color: var(--ink)">${summary}</div>
                        <div class="text-xs mt-0.5" style="color: var(--ink-3)">from ${restaurant}</div>
                        <div class="flex items-center gap-1.5 mt-2 text-[11px]" style="color: var(--ink-2)">
                            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                            <span>Arrives in 28 min</span>
                        </div>
                    </div>
                    <button id="reorder-btn" type="button"
                        class="mt-2.5 self-start rounded-full px-4 py-2 text-[13px] font-semibold hover:opacity-90 transition-opacity"
                        style="background: var(--accent); color: var(--accent-ink); border: none;">
                        Reorder · ${total}
                    </button>
                </div>
            </div>
        </div>
    `;

    $('reorder-btn').addEventListener('click', () => {
        const items = Array.isArray(last.items) ? last.items : [];
        const cart = getCart();
        for (const it of items) {
            if (!it || !it.id) continue;
            const q = Number(it.qty) || 1;
            cart[it.id] = (cart[it.id] || 0) + q;
        }
        localStorage.setItem('mk-cart-v1', JSON.stringify(cart));
        location.href = 'menu.html?checkout=1';
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "Order it again" frontend/home.js               # expect 1
grep -c "getLastOrder" frontend/home.js                 # expect >=2 (definition + call)
grep -c "reorder-btn" frontend/home.js                  # expect 2
grep -c "menu.html?checkout=1" frontend/home.js         # expect 1
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): hero reorder card (conditional on mk-last-order)"
```

---

### Task 7: Cuisines horizontal rail

**Files:**
- Modify: `frontend/home.js` — fill `renderCuisines()`

- [ ] **Step 1: Replace the empty `function renderCuisines() {}` in `frontend/home.js` with this**

```javascript
function renderCuisines() {
    $('cuisines-section').innerHTML = `
        <div class="max-w-[1200px] mx-auto pb-6">
            <div class="px-5 pb-3 flex items-baseline justify-between">
                <h2 class="serif text-[22px]" style="color: var(--ink)">Cuisines</h2>
                <span class="text-xs" style="color: var(--ink-3)">See all</span>
            </div>
            <div class="scroll-x flex gap-3 px-5">
                ${CATEGORIES.map((c) => `
                    <button data-cuisine="${c.label}" type="button" class="flex-shrink-0 text-center w-[72px] hover:opacity-90 transition-opacity">
                        <div class="photo w-[72px] h-[72px] rounded-2xl mb-1.5"
                            style="background-image: url('${c.src}'); border: 1px solid var(--rule);"></div>
                        <div class="text-xs font-medium" style="color: var(--ink)">${c.label}</div>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    document.querySelectorAll('[data-cuisine]').forEach((b) => {
        b.addEventListener('click', () => {
            console.log('cuisine filter:', b.getAttribute('data-cuisine'), '(placeholder — no filter page yet)');
        });
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "renderCuisines" frontend/home.js               # expect >=2
grep -c "data-cuisine" frontend/home.js                 # expect 3 (1 template + 2 selectors)
grep -c "See all" frontend/home.js                      # expect 1
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): cuisines rail with 7 tiles"
```

---

### Task 8: Filter chips

**Files:**
- Modify: `frontend/home.js` — fill `renderFilters()`

- [ ] **Step 1: Replace the empty `function renderFilters() {}` in `frontend/home.js` with this**

```javascript
function renderFilters() {
    $('filters-section').innerHTML = `
        <div class="max-w-[1200px] mx-auto pb-4">
            <div class="scroll-x flex gap-2 px-5">
                ${FILTERS.map((f, idx) => {
                    const primary = f.primary;
                    const style = primary
                        ? 'background: var(--ink); color: var(--bg); border-color: var(--ink);'
                        : 'background: var(--surface); border-color: var(--rule); color: var(--ink-2);';
                    return `
                        <button data-filter-idx="${idx}" type="button" class="pill hover:opacity-90 transition-opacity" style="${style}">
                            ${f.icon ? `<i data-lucide="${f.icon}" class="w-3.5 h-3.5"></i>` : ''}
                            <span>${f.label}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    document.querySelectorAll('[data-filter-idx]').forEach((b) => {
        b.addEventListener('click', () => {
            const idx = Number(b.getAttribute('data-filter-idx'));
            console.log('filter toggled:', FILTERS[idx].label, '(placeholder — no active filter state yet)');
        });
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "renderFilters" frontend/home.js                # expect >=2
grep -c "data-filter-idx" frontend/home.js              # expect 3
grep -c "Free delivery\|Vegetarian\|Spicy\|Under 30 min" frontend/home.js
# expect 0 — those strings live in FILTERS array (not inlined here)
grep -c "FILTERS\[idx\]" frontend/home.js               # expect 1
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): filter chips row (non-functional, visual)"
```

---

### Task 9: "Near you tonight" restaurant list

**Files:**
- Modify: `frontend/home.js` — fill `renderRestaurants()`

- [ ] **Step 1: Replace the empty `function renderRestaurants() {}` in `frontend/home.js` with this**

```javascript
function renderRestaurants() {
    $('restaurants-section').innerHTML = `
        <div class="max-w-[1200px] mx-auto px-5 pb-6">
            <h2 class="serif text-[22px] mb-3" style="color: var(--ink)">Near you tonight</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
                ${RESTAURANTS.map((r) => `
                    <a data-restaurant="${r.name}" href="menu.html" class="block group">
                        <div class="photo w-full h-[150px] rounded-2xl mb-2.5"
                            style="background-image: url('${r.src}'); border: 1px solid var(--rule);"></div>
                        <div class="flex justify-between items-baseline mb-1">
                            <div class="text-base font-semibold" style="color: var(--ink)">${r.name}</div>
                            <div class="flex items-center gap-[3px] text-[13px] font-medium" style="color: var(--ink)">
                                <i data-lucide="star" class="w-3 h-3" style="color: var(--accent); fill: var(--accent);"></i>
                                <span>${r.rating}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2.5 text-xs" style="color: var(--ink-3)">
                            <span>${r.tag}</span>
                            <span class="w-[3px] h-[3px] rounded-full" style="background: var(--ink-3)"></span>
                            <span>${r.eta}</span>
                            <span class="w-[3px] h-[3px] rounded-full" style="background: var(--ink-3)"></span>
                            <span>${r.fee} delivery</span>
                        </div>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "Near you tonight" frontend/home.js             # expect 1
grep -c "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" frontend/home.js  # expect 1
grep -c 'href="menu.html"' frontend/home.js             # expect 1
grep -c "data-restaurant" frontend/home.js              # expect 1
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): near-you-tonight restaurant list with responsive grid"
```

---

### Task 10: Bottom tab bar (mobile) + top nav (desktop)

**Files:**
- Modify: `frontend/home.js` — fill `renderBottomNav()`

- [ ] **Step 1: Replace the empty `function renderBottomNav() {}` in `frontend/home.js` with this**

```javascript
function renderBottomNav() {
    const TABS = [
        { id: 'home',    icon: 'home',     label: 'Home',    active: true },
        { id: 'explore', icon: 'compass',  label: 'Explore' },
        { id: 'orders',  icon: 'shopping-bag', label: 'Orders' },
        { id: 'saved',   icon: 'heart',    label: 'Saved' },
        { id: 'me',      icon: 'user',     label: 'Me' },
    ];

    // Mobile: fixed bottom tab bar. Hidden on sm+ screens.
    // Desktop/tablet: top nav row — we render it once in the same <nav> element but
    // with responsive classes. Tailwind's sm: breakpoint (>=640px) swaps layouts.
    $('bottom-nav').innerHTML = `
        <!-- Mobile bottom tab bar -->
        <div class="sm:hidden fixed bottom-0 left-0 right-0 grid grid-cols-5 px-2 py-2 pb-1"
            style="background: var(--surface); border-top: 1px solid var(--rule); z-index: 40;">
            ${TABS.map((t) => `
                <button data-tab="${t.id}" type="button" class="flex flex-col items-center gap-0.5 py-1.5"
                    style="color: ${t.active ? 'var(--accent)' : 'var(--ink-3)'};
                           font-size: 10px; font-weight: ${t.active ? '600' : '500'};">
                    <i data-lucide="${t.icon}" class="w-[22px] h-[22px]"></i>
                    <span>${t.label}</span>
                </button>
            `).join('')}
        </div>

        <!-- Desktop/tablet top nav (sm+) -->
        <div class="hidden sm:block sticky top-0 z-30" style="background: var(--bg); border-bottom: 1px solid var(--rule);">
            <div class="max-w-[1200px] mx-auto px-5 py-3 flex items-center justify-between">
                <a href="home.html" class="serif text-2xl" style="color: var(--ink)">Mama's Kitchen</a>
                <div class="flex items-center gap-6">
                    ${TABS.map((t) => `
                        <button data-tab-desktop="${t.id}" type="button" class="flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                            style="color: ${t.active ? 'var(--accent)' : 'var(--ink-2)'}; font-weight: ${t.active ? '600' : '500'};">
                            <i data-lucide="${t.icon}" class="w-4 h-4"></i>
                            <span>${t.label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('[data-tab], [data-tab-desktop]').forEach((b) => {
        b.addEventListener('click', () => {
            const tab = b.getAttribute('data-tab') || b.getAttribute('data-tab-desktop');
            if (tab === 'home') return;
            console.log('tab clicked:', tab, '(placeholder — route not yet implemented)');
        });
    });
}
```

- [ ] **Step 2: Verify**

```bash
grep -c "data-tab=" frontend/home.js                    # expect 1 (template) — the selector in querySelectorAll uses data-tab (no =)
grep -c "data-tab-desktop" frontend/home.js             # expect >=2
grep -c 'grid grid-cols-5\|sticky top-0' frontend/home.js  # expect 2
grep -c "sm:hidden\|hidden sm:block" frontend/home.js   # expect 2
```

- [ ] **Step 3: Commit**

```bash
git add frontend/home.js
git commit -m "feat(home): responsive bottom tab bar (mobile) + top nav (desktop)"
```

---

### Task 11: Wire app.js to persist mk-last-order + auto-open checkout

**Files:**
- Modify: `frontend/app.js` — add `mk-last-order` write on checkout success + auto-open checkout on `?checkout=1`

- [ ] **Step 1: Read current `frontend/app.js` to find the checkout-success block**

The submit handler inside the `if (document.getElementById('menu-grid'))` branch contains (around line 150-170):

```javascript
try {
    const res = await api('/order', { method: 'POST', body: { ... } });
    saveProfile({ ... });
    cart = {};
    saveCart(cart);
    renderCart();
    $('checkout-modal').classList.add('hidden');
    $('success-modal').classList.remove('hidden');
    $('order-number').textContent = res.order_number;
    $('track-link').href = `track.html?o=${encodeURIComponent(res.order_number)}`;
    e.target.reset();
} catch (err) {
    ...
}
```

- [ ] **Step 2: Replace that `try` block with a version that persists `mk-last-order`**

Find:

```javascript
        try {
            const res = await api('/order', {
                method: 'POST',
                body: {
                    customer_name: form.get('customer_name'),
                    customer_phone: form.get('customer_phone'),
                    delivery_address: form.get('delivery_address'),
                    notes: form.get('notes') || null,
                    items,
                },
            });
            saveProfile({
                customer_name: form.get('customer_name'),
                customer_phone: form.get('customer_phone'),
                delivery_address: form.get('delivery_address'),
            });
            cart = {};
            saveCart(cart);
            renderCart();
            $('checkout-modal').classList.add('hidden');
            $('success-modal').classList.remove('hidden');
            $('order-number').textContent = res.order_number;
            $('track-link').href = `track.html?o=${encodeURIComponent(res.order_number)}`;
            e.target.reset();
        } catch (err) {
```

Replace with:

```javascript
        try {
            const res = await api('/order', {
                method: 'POST',
                body: {
                    customer_name: form.get('customer_name'),
                    customer_phone: form.get('customer_phone'),
                    delivery_address: form.get('delivery_address'),
                    notes: form.get('notes') || null,
                    items,
                },
            });
            saveProfile({
                customer_name: form.get('customer_name'),
                customer_phone: form.get('customer_phone'),
                delivery_address: form.get('delivery_address'),
            });

            // Persist a snapshot for the home page's "Order it again?" hero card.
            const totalAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
            const topItem = items.slice().sort((a, b) => b.qty - a.qty)[0];
            const summary = topItem
                ? (items.length === 1 ? topItem.name : `${topItem.name} + ${items.length - 1} more`)
                : 'your last order';
            localStorage.setItem('mk-last-order', JSON.stringify({
                order_number: res.order_number,
                items,
                total: totalAmount,
                timestamp: new Date().toISOString(),
                restaurant: 'Iya Bisi Kitchen',
                summary,
                tracking_url: `track.html?o=${encodeURIComponent(res.order_number)}`,
            }));

            cart = {};
            saveCart(cart);
            renderCart();
            $('checkout-modal').classList.add('hidden');
            $('success-modal').classList.remove('hidden');
            $('order-number').textContent = res.order_number;
            $('track-link').href = `track.html?o=${encodeURIComponent(res.order_number)}`;
            e.target.reset();
        } catch (err) {
```

- [ ] **Step 3: Add the `?checkout=1` auto-opener to the bootstrap IIFE at the end of `app.js`**

Find (at the end of the menu-grid branch, inside the existing `(async function bootstrap() { ... })();` block's success path):

```javascript
            if (MENU.length === 0) {
                $('menu-loading-error').classList.remove('hidden');
                $('menu-loading-error').textContent = 'No menu items available right now.';
            }

            renderMenu();
            renderCart();
```

Replace with:

```javascript
            if (MENU.length === 0) {
                $('menu-loading-error').classList.remove('hidden');
                $('menu-loading-error').textContent = 'No menu items available right now.';
            }

            renderMenu();
            renderCart();

            // Auto-open checkout when arriving from home page's "Reorder" flow.
            if (new URLSearchParams(location.search).get('checkout') === '1'
                && Object.keys(cart).length > 0) {
                $('checkout-btn').click();
            }
```

- [ ] **Step 4: Verify**

```bash
grep -c "mk-last-order" frontend/app.js                 # expect 1
grep -c 'checkout.*=== .1.' frontend/app.js             # expect 1
grep -c "Iya Bisi Kitchen" frontend/app.js              # expect 1
grep -c "checkout-btn.*click" frontend/app.js           # expect >=2 (existing listener + new programmatic click)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app.js
git commit -m "feat(menu): persist mk-last-order on checkout + auto-open checkout on ?checkout=1"
```

---

### Task 12: Local file-shape sanity pass

**Files:** (verification only, no edits)

- [ ] **Step 1: Confirm the full file set on this branch**

```bash
cd "c:/Users/HP/Desktop/n8n setup and mcp in ClaudeCode"
ls -la frontend/
```

Expected files: `admin.html`, `admin.js`, `app.js`, `home.html`, `home.js`, `index.html`, `menu.html`, `rider.html`, `rider.js`, `track.html`, `track.js`.

- [ ] **Step 2: Confirm `home.js` implements all render stubs**

```bash
grep -c "^function render" frontend/home.js             # expect 7
for fn in renderTopBar renderSearch renderHero renderCuisines renderFilters renderRestaurants renderBottomNav; do
    body_lines=$(awk "/^function $fn\\(\\) {/,/^}/" frontend/home.js | wc -l)
    echo "$fn: $body_lines lines"
done
```

Expected: each function has more than 3 lines (empty stubs were 1-liners).

- [ ] **Step 3: Confirm `home.html` has a `<section>` for every rendered part**

```bash
grep -oE 'id="(top-bar|search-section|hero-section|cuisines-section|filters-section|restaurants-section|bottom-nav)"' frontend/home.html | sort -u | wc -l
```

Expected: 7.

- [ ] **Step 4: Confirm the redirect shim still works**

```bash
grep -c 'http-equiv="refresh".*home.html' frontend/index.html   # expect 1
```

- [ ] **Step 5: Confirm no absolute script paths slipped in**

```bash
grep -nE 'src="/|href="/' frontend/home.html frontend/home.js frontend/index.html || echo "no-absolute-paths"
```

Expected: `no-absolute-paths` (no hits).

- [ ] **Step 6: Confirm git status is clean (all edits committed)**

```bash
git status --short
```

Expected: empty output (clean working tree). If not, investigate before proceeding.

---

### Task 13: Merge to main + verify Pages deploy + live smoke

**Files:** (no edits — merge + deploy + smoke)

- [ ] **Step 1: Push the feature branch**

```bash
cd "c:/Users/HP/Desktop/n8n setup and mcp in ClaudeCode"
git push -u origin feature/home-page-v1-dark
```

- [ ] **Step 2: Merge to `main` (fast-forward if possible; this branch is currently based on `feature/menu-admin-and-map-polish`, which itself is ahead of main — resolve by rebasing onto main first)**

First, check the parent chain:

```bash
git log --oneline main..feature/home-page-v1-dark | head -20
git log --oneline feature/menu-admin-and-map-polish..feature/home-page-v1-dark | head -20
```

If the home-page branch contains the admin-menu commits (it does, since we branched off mid-flow), decide with the user whether to (a) merge both branches to main together here, or (b) rebase home-page off main first and leave admin-menu for later. **Default (a) if user hasn't said otherwise** — it's simpler and the admin-menu work is fully committed through Task 5, with only the Task 6-10 map/geocode work still pending on that branch (which is fine to pick up after as a fresh feature branch off the new main).

For option (a) — fast-forward merge everything:

```bash
git checkout main
git merge --ff-only feature/home-page-v1-dark
git push origin main
```

If fast-forward isn't possible (conflicts), stop and report NEEDS_CONTEXT.

- [ ] **Step 3: Wait for GitHub Pages deploy**

```bash
export PATH="/c/Users/HP/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe:$PATH"
for i in $(seq 1 36); do
    status=$(curl -fsS "https://api.github.com/repos/NeilTheDevil/mamaskitchen/actions/runs?per_page=1" | jq -r '.workflow_runs[0] | "\(.head_sha[0:7]) \(.status) \(.conclusion // "pending")"')
    echo "[$(date +%H:%M:%S)] $status"
    case "$status" in
        *"completed success"*) break ;;
        *"completed failure"*) echo "DEPLOY FAILED — investigate"; exit 1 ;;
    esac
    sleep 5
done
```

Expected: `completed success` within a few minutes.

- [ ] **Step 4: Curl-based live smoke tests**

```bash
BASE=https://neilthedevil.github.io/mamaskitchen

echo "--- / redirects to home.html ---"
curl -sS "$BASE/" | grep -iE 'refresh.*home.html|redirect' | head -2

echo "--- home.html serves and has expected markers ---"
curl -sS "$BASE/home.html" | grep -cE 'oklch|Instrument Serif|lucide@latest|home.js'
# expect >=4

echo "--- home.js serves with the static arrays ---"
curl -sS "$BASE/home.js" | grep -cE 'CATEGORIES|RESTAURANTS|FILTERS|FOOD|renderTopBar|renderHero'
# expect 6

echo "--- menu.html still serves the menu ---"
curl -sS "$BASE/menu.html" | grep -cE 'menu-grid|Mama.s Kitchen'
# expect >=2

echo "--- all public URLs return 200 ---"
for p in / home.html menu.html track.html admin.html rider.html home.js app.js; do
    printf '%-15s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 10 $BASE/$p)"
done
# expect 200 on every line
```

All should pass.

- [ ] **Step 5: Manual browser smoke at three viewports**

Open the deployed URL in Chrome/Firefox and check each breakpoint. Use DevTools' Device Toolbar:

**Mobile (390×844 — iPhone 12 Pro preset):**
- Top bar shows DELIVER TO caption + pin + address + chevron, cart button right.
- Search input renders with placeholder "Search jollof, suya, egusi…".
- Hero card is absent (no `mk-last-order` in a fresh session) OR present if you have one.
- Cuisines rail shows 7 tiles, horizontally scrollable.
- Filter chips row — "Filters" chip is inverse-styled, others are `--surface`.
- Restaurant list — 4 cards, stacked vertically, each with image, name, rating, tag/ETA/fee line.
- Bottom tab bar — 5 tabs, Home highlighted in terracotta.

**Tablet (720×1024):**
- Page is centered, max-width 720px.
- Bottom tab bar disappears; top nav appears with "Mama's Kitchen" logo left + tabs right.
- Restaurant list reflows to 2 columns.

**Desktop (1280×800):**
- Page is centered, max-width 1200px.
- Restaurant list reflows to 3 columns.
- Hero reorder card (if visible) stays capped at ~720px.

- [ ] **Step 6: Manual Reorder flow test**

1. Open `/menu.html` in a fresh session. Add 2-3 items to cart, checkout, fill in fake details, place order. Order succeeds → success modal shows order number.
2. Navigate to `/` (home page). Hero "Order it again?" card is now visible with the summary/total/timestamp.
3. Click "Reorder · ₦XXXX". You should be redirected to `menu.html?checkout=1`, the cart should be populated with the items, and the checkout modal should auto-open with your saved name/phone/address.

- [ ] **Step 7: Delete the now-merged branches on remote (optional housekeeping)**

```bash
# Skip if the user wants to keep them around.
# git push origin --delete feature/home-page-v1-dark feature/menu-admin-and-map-polish
```

Don't auto-run this — flag for user decision.

- [ ] **Step 8: Tag the release**

```bash
git tag -a v1.2 -m "v1.2: new V1 Dark home page; menu moved to /menu.html; admin menu CRUD + map polish rolled in"
git push origin v1.2
```

---

## Deployment Notes

- **No workflow/backend changes** — this plan is frontend-only. The existing n8n workflows (01-07 from Tasks 1-3 of the other plan) continue to serve `/webhook/menu`, `/webhook/order`, etc. unchanged.
- **GitHub Pages deploy workflow** (`.github/workflows/pages.yml`) triggers on pushes to `main` that touch `frontend/**`. Task 13's merge to main triggers it automatically.
- **Feature-branch pushes do not deploy** — we only see the live site after merge.
- **The VM's Caddy** still serves `food.34-79-23-147.sslip.io` as a secondary host for the frontend. After merge, run `bash deploy.sh` (with `PATH` + `CLOUDSDK_CORE_PROJECT` exports) if you want the VM's copy in sync. Not strictly required — Pages is the canonical customer-facing URL now.

## Non-goals (not in this plan)

- Real search page / search logic.
- Real filter logic on the restaurants list.
- Real per-restaurant menus.
- Real "Explore / Orders / Saved / Me" routes.
- Address autocomplete (we're using `prompt()`).
- Hover/press micro-animations.
- Downloading Wikimedia images to our own CDN (deferred per spec).
- Service Worker / PWA manifest (spec says "responsive PWA" but the P in PWA isn't in scope yet — it's a website).

## Risk log

- **Tailwind CDN + inline OKLCH:** Tailwind's JIT doesn't know about our custom properties, but we're using them via `style="color: var(--ink)"` inline, not as Tailwind classes — so there's no conflict. Layout utilities (`flex`, `grid`, `px-5`, etc.) remain Tailwind's job.
- **Lucide CDN render timing:** `lucide.createIcons()` is called at the end of `initHome()` after all sections are rendered. If icons appear missing, `lucide.createIcons()` can be re-called after dynamic updates.
- **GitHub Pages caches aggressively** — first load after deploy may show stale content in browsers with cached copies; hard-refresh (Cmd/Ctrl+Shift+R) to verify.
- **Admin-menu branch drift:** After this merges to main, the `feature/menu-admin-and-map-polish` branch tip (`4eee747`) is already in main. The remaining Tasks 6-10 of the menu-admin plan can be picked up on a fresh branch off the new main — no rebase ceremony needed because both branches share the same commit range through Task 5.
