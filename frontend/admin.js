const NEXT_STATUS = {
    received:         { next: 'preparing',        label: 'Start preparing' },
    preparing:        { next: 'out_for_delivery', label: 'Send out for delivery' },
    out_for_delivery: { next: 'delivered',        label: 'Mark delivered' },
};

const STATUS_BADGE = {
    received:         'bg-amber-100 text-amber-800',
    preparing:        'bg-orange-100 text-orange-800',
    out_for_delivery: 'bg-sky-100 text-sky-800',
    delivered:        'bg-emerald-100 text-emerald-800',
    cancelled:        'bg-stone-200 text-stone-600',
};

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const adminKey = params.get('key');

if (!adminKey) {
    $('auth-warning').classList.remove('hidden');
    $('orders-list').innerHTML = '';
    $('empty-state').remove();
}

async function load() {
    if (!adminKey) return;
    try {
        const data = await api(`/admin/orders?key=${encodeURIComponent(adminKey)}`);
        const orders = data.orders || [];
        renderCounts(data.counts || {});
        renderOrders(orders);
        $('last-refresh').textContent = 'Last refresh: ' + new Date().toLocaleTimeString();
    } catch (err) {
        $('orders-list').innerHTML = `<p class="text-rose-600 text-center py-8">Error: ${err.message}</p>`;
    }
}

function renderCounts(c) {
    ['received', 'preparing', 'out_for_delivery', 'delivered'].forEach((s) => {
        const el = $(`count-${s}`);
        if (el) el.textContent = c[s] || 0;
    });
}

function renderOrders(orders) {
    const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    if (active.length === 0) {
        $('orders-list').innerHTML = '<p class="text-stone-400 text-center py-12">No active orders. 🎉</p>';
        return;
    }
    $('orders-list').innerHTML = active.map((o) => {
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        const action = NEXT_STATUS[o.status];
        return `
            <div class="bg-white rounded-xl shadow-sm p-5 flex flex-col md:flex-row gap-5">
                <div class="flex-1">
                    <div class="flex items-center gap-3">
                        <span class="brand-font text-xl font-black text-amber-700">${o.order_number}</span>
                        <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[o.status]}">${o.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p class="text-sm text-stone-500 mt-1">${formatTime(o.created_at)}</p>
                    <div class="mt-3">
                        <p class="font-semibold">${o.customer_name} · <a href="tel:${o.customer_phone}" class="text-amber-700 hover:underline">${o.customer_phone}</a></p>
                        <p class="text-sm text-stone-600">${o.delivery_address}</p>
                        ${o.notes ? `<p class="text-sm text-stone-500 italic mt-1">"${o.notes}"</p>` : ''}
                    </div>
                    <ul class="mt-3 text-sm space-y-1">
                        ${items.map((i) => `<li>${i.qty} × ${i.name} <span class="text-stone-500">· ${formatNaira(i.price * i.qty)}</span></li>`).join('')}
                    </ul>
                    <p class="mt-2 font-bold">Total: ${formatNaira(o.total_amount)}</p>
                </div>
                <div class="flex md:flex-col gap-2 md:w-48">
                    ${action ? `
                        <button data-advance="${o.order_number}" data-next="${action.next}"
                            class="bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-amber-700 flex-1">
                            ${action.label}
                        </button>
                    ` : ''}
                    ${o.status === 'out_for_delivery' ? `
                        <button data-copy-rider="${o.order_number}"
                            class="bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-sky-700 flex-1">
                            Copy rider link
                        </button>
                    ` : ''}
                    <button data-cancel="${o.order_number}"
                        class="bg-stone-100 text-stone-700 font-semibold py-2 px-4 rounded-lg hover:bg-stone-200 flex-1">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('[data-advance]').forEach((b) => b.addEventListener('click', () => {
        advance(b.getAttribute('data-advance'), b.getAttribute('data-next'));
    }));
    document.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
        if (confirm('Cancel this order?')) advance(b.getAttribute('data-cancel'), 'cancelled');
    }));
    document.querySelectorAll('[data-copy-rider]').forEach((b) => b.addEventListener('click', async () => {
        const order = b.getAttribute('data-copy-rider');
        const url = new URL('rider.html', location.href);
        url.searchParams.set('o', order);
        url.searchParams.set('key', adminKey);
        const link = url.toString();
        try {
            await navigator.clipboard.writeText(link);
            const orig = b.textContent;
            b.textContent = 'Copied ✓';
            setTimeout(() => { b.textContent = orig; }, 2000);
        } catch {
            prompt('Copy this link and send to your rider:', link);
        }
    }));
}

async function advance(orderNumber, newStatus) {
    try {
        await api(`/order-status?o=${encodeURIComponent(orderNumber)}`, {
            method: 'POST',
            body: { status: newStatus, key: adminKey },
        });
        load();
    } catch (err) {
        alert('Failed: ' + err.message);
    }
}

$('refresh-btn').addEventListener('click', load);

if (adminKey) {
    load();
    setInterval(load, 20000);
}

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
