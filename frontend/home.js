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
