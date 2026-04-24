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
