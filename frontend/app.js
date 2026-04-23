const API_BASE = 'https://food.34-79-23-147.sslip.io/webhook';

async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
}

const formatNaira = (n) => '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 });
const formatTime = (iso) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

if (document.getElementById('menu-grid')) {
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

    const CART_KEY = 'mk-cart-v1';
    const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; } };
    const saveCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));
    let cart = loadCart();

    const $ = (id) => document.getElementById(id);

    function renderMenu() {
        $('menu-grid').innerHTML = MENU.map((item) => `
            <div class="item-card bg-white rounded-xl overflow-hidden border border-stone-200 flex flex-col">
                <div class="bg-gradient-to-br ${item.bg} h-40 flex items-center justify-center text-7xl">${item.emoji}</div>
                <div class="p-5 flex-1 flex flex-col">
                    <h3 class="font-bold text-lg">${item.name}</h3>
                    <p class="text-sm text-stone-500 mt-1 flex-1">${item.desc}</p>
                    <div class="mt-4 flex items-center justify-between">
                        <span class="font-bold text-lg">${formatNaira(item.price)}</span>
                        <button data-add="${item.id}"
                            class="bg-stone-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-stone-800">
                            + Add
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        $('menu-grid').querySelectorAll('[data-add]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-add');
                cart[id] = (cart[id] || 0) + 1;
                saveCart(cart);
                renderCart();
                const cc = $('cart-count');
                cc.classList.remove('bump');
                void cc.offsetWidth;
                cc.classList.add('bump');
            });
        });
    }

    function renderCart() {
        const entries = Object.entries(cart).filter(([, q]) => q > 0);
        const count = entries.reduce((sum, [, q]) => sum + q, 0);
        $('cart-count').textContent = count;

        if (entries.length === 0) {
            $('cart-items').innerHTML = '<p class="text-stone-400 text-center py-12">Your cart is empty.</p>';
            $('cart-total').textContent = formatNaira(0);
            $('checkout-btn').disabled = true;
            return;
        }

        let total = 0;
        $('cart-items').innerHTML = entries.map(([id, qty]) => {
            const item = MENU.find((m) => m.id === id);
            if (!item) return '';
            const lineTotal = item.price * qty;
            total += lineTotal;
            return `
                <div class="flex gap-3 items-start">
                    <div class="bg-gradient-to-br ${item.bg} w-14 h-14 rounded-lg flex items-center justify-center text-3xl flex-shrink-0">${item.emoji}</div>
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold truncate">${item.name}</p>
                        <p class="text-xs text-stone-500">${formatNaira(item.price)} each</p>
                        <div class="flex items-center gap-2 mt-2">
                            <button data-dec="${id}" class="w-7 h-7 border border-stone-300 rounded hover:bg-stone-100 font-bold">−</button>
                            <span class="w-8 text-center font-semibold">${qty}</span>
                            <button data-inc="${id}" class="w-7 h-7 border border-stone-300 rounded hover:bg-stone-100 font-bold">+</button>
                        </div>
                    </div>
                    <p class="font-bold whitespace-nowrap">${formatNaira(lineTotal)}</p>
                </div>
            `;
        }).join('');

        $('cart-total').textContent = formatNaira(total);
        $('checkout-btn').disabled = false;

        $('cart-items').querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
            const id = b.getAttribute('data-inc');
            cart[id] = (cart[id] || 0) + 1; saveCart(cart); renderCart();
        }));
        $('cart-items').querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
            const id = b.getAttribute('data-dec');
            cart[id] = Math.max(0, (cart[id] || 0) - 1);
            if (cart[id] === 0) delete cart[id];
            saveCart(cart); renderCart();
        }));
    }

    $('cart-toggle').addEventListener('click', () => $('cart-panel').classList.remove('cart-hidden'));
    $('cart-close').addEventListener('click', () => $('cart-panel').classList.add('cart-hidden'));

    $('checkout-btn').addEventListener('click', () => {
        $('cart-panel').classList.add('cart-hidden');
        $('checkout-modal').classList.remove('hidden');
    });
    $('modal-close').addEventListener('click', () => $('checkout-modal').classList.add('hidden'));

    $('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('place-order-btn');
        btn.disabled = true;
        btn.textContent = 'Placing order...';

        const form = new FormData(e.target);
        const items = Object.entries(cart)
            .filter(([, q]) => q > 0)
            .map(([id, qty]) => {
                const item = MENU.find((m) => m.id === id);
                return { id, name: item.name, price: item.price, qty };
            });

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
            cart = {};
            saveCart(cart);
            renderCart();
            $('checkout-modal').classList.add('hidden');
            $('success-modal').classList.remove('hidden');
            $('order-number').textContent = res.order_number;
            $('track-link').href = `/track.html?o=${encodeURIComponent(res.order_number)}`;
            e.target.reset();
        } catch (err) {
            alert('Could not place order: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Place order';
        }
    });

    $('new-order-btn').addEventListener('click', () => $('success-modal').classList.add('hidden'));

    renderMenu();
    renderCart();
}
