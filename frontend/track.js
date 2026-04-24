const STATUS_ORDER = ['received', 'preparing', 'out_for_delivery', 'delivered'];
const STATUS_COPY = {
    received:         { title: 'Order received',        sub: 'The kitchen has your order and will start preparing soon.' },
    preparing:        { title: 'Preparing your food',   sub: 'Your meal is being cooked fresh right now.' },
    out_for_delivery: { title: 'Out for delivery',      sub: 'A rider picked up your order and is on the way.' },
    delivered:        { title: 'Delivered — enjoy! 🎉', sub: 'Thanks for ordering from Mama\'s Kitchen.' },
    cancelled:        { title: 'Order cancelled',       sub: 'This order was cancelled.' },
};

let pollTimer = null;
let map = null;
let riderMarker = null;

const $ = (id) => document.getElementById(id);

async function lookup(orderNumber) {
    $('lookup-error').classList.add('hidden');
    try {
        const order = await api(`/order?o=${encodeURIComponent(orderNumber)}`);
        render(order);
        if (pollTimer) clearInterval(pollTimer);
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
            const intervalMs = order.status === 'out_for_delivery' ? 10000 : 15000;
            pollTimer = setInterval(async () => {
                try {
                    const fresh = await api(`/order?o=${encodeURIComponent(orderNumber)}`);
                    render(fresh);
                    if (fresh.status === 'delivered' || fresh.status === 'cancelled') clearInterval(pollTimer);
                } catch { /* ignore transient errors */ }
            }, intervalMs);
        }
    } catch (err) {
        $('lookup-error').textContent = err.message || 'Order not found.';
        $('lookup-error').classList.remove('hidden');
        $('status-card').classList.add('hidden');
    }
}

function renderMap(order) {
    const showMap = order.status === 'out_for_delivery' && order.rider_lat != null && order.rider_lng != null;
    if (!showMap) {
        $('map-section').classList.add('hidden');
        return;
    }
    $('map-section').classList.remove('hidden');
    const lat = Number(order.rider_lat);
    const lng = Number(order.rider_lng);

    if (!map) {
        map = L.map('map', { zoomControl: true, attributionControl: true }).setView([lat, lng], 15);
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
        riderMarker = L.marker([lat, lng], { icon: riderIcon }).addTo(map);
    } else {
        riderMarker.setLatLng([lat, lng]);
        map.panTo([lat, lng], { animate: true });
    }

    if (order.rider_location_updated_at) {
        const secs = Math.max(0, Math.floor((Date.now() - new Date(order.rider_location_updated_at).getTime()) / 1000));
        $('map-updated').textContent = secs < 60
            ? `Updated ${secs}s ago`
            : `Updated ${Math.floor(secs / 60)}m ${secs % 60}s ago`;
    }
    $('map-note').textContent = 'Live location from your rider, updated every ~15 seconds.';
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

    renderMap(order);
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
