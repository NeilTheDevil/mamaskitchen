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
