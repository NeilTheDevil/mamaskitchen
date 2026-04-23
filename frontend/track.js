const STATUS_ORDER = ['received', 'preparing', 'out_for_delivery', 'delivered'];
const STATUS_COPY = {
    received:         { title: 'Order received',        sub: 'The kitchen has your order and will start preparing soon.' },
    preparing:        { title: 'Preparing your food',   sub: 'Your meal is being cooked fresh right now.' },
    out_for_delivery: { title: 'Out for delivery',      sub: 'A rider picked up your order and is on the way.' },
    delivered:        { title: 'Delivered — enjoy! 🎉', sub: 'Thanks for ordering from Mama\'s Kitchen.' },
    cancelled:        { title: 'Order cancelled',       sub: 'This order was cancelled.' },
};

let pollTimer = null;

const $ = (id) => document.getElementById(id);

async function lookup(orderNumber) {
    $('lookup-error').classList.add('hidden');
    try {
        const order = await api(`/order?o=${encodeURIComponent(orderNumber)}`);
        render(order);
        if (pollTimer) clearInterval(pollTimer);
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
            pollTimer = setInterval(async () => {
                try {
                    const fresh = await api(`/order?o=${encodeURIComponent(orderNumber)}`);
                    render(fresh);
                    if (fresh.status === 'delivered' || fresh.status === 'cancelled') clearInterval(pollTimer);
                } catch { /* ignore transient errors */ }
            }, 15000);
        }
    } catch (err) {
        $('lookup-error').textContent = err.message || 'Order not found.';
        $('lookup-error').classList.remove('hidden');
        $('status-card').classList.add('hidden');
    }
}

function render(order) {
    $('status-card').classList.remove('hidden');
    $('status-order-number').textContent = order.order_number;
    $('status-placed-at').textContent = 'Placed ' + formatTime(order.created_at);

    const currentIdx = STATUS_ORDER.indexOf(order.status);
    STATUS_ORDER.forEach((s, idx) => {
        const el = $(`step-${s}`);
        el.classList.remove('step-active', 'step-done');
        if (idx < currentIdx) el.classList.add('step-done');
        else if (idx === currentIdx) el.classList.add('step-active');
    });

    const pct = order.status === 'cancelled' ? 0 : (currentIdx <= 0 ? 0 : (currentIdx / (STATUS_ORDER.length - 1)) * 100);
    $('progress-bar').style.width = pct + '%';

    const copy = STATUS_COPY[order.status] || { title: order.status, sub: '' };
    $('current-status-text').textContent = copy.title;
    $('current-status-sub').textContent = copy.sub;

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    $('status-items').innerHTML = items.map((i) => `
        <li class="flex justify-between">
            <span>${i.qty} × ${i.name}</span>
            <span class="text-stone-500">${formatNaira(i.price * i.qty)}</span>
        </li>
    `).join('');
    $('status-total').textContent = formatNaira(order.total_amount);
}

$('lookup-btn').addEventListener('click', () => {
    const val = $('order-input').value.trim().toUpperCase();
    if (val) lookup(val);
});

$('order-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('lookup-btn').click();
});

const params = new URLSearchParams(location.search);
const prefilled = params.get('o');
if (prefilled) {
    $('order-input').value = prefilled.toUpperCase();
    lookup(prefilled.toUpperCase());
}
