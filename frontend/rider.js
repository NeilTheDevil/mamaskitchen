(function () {
    const params = new URLSearchParams(location.search);
    const orderNumber = (params.get('o') || '').toUpperCase();
    const key = params.get('key');

    const $ = (id) => document.getElementById(id);

    if (!orderNumber || !key) {
        $('missing-params').classList.remove('hidden');
        return;
    }
    $('job').classList.remove('hidden');

    const PING_INTERVAL_MS = 15000;
    let watchId = null;
    let lastSentAt = 0;
    let latestFix = null;
    let pingCount = 0;

    const setStatus = (label, dotClass) => {
        $('status-label').textContent = label;
        $('status-dot').className = `w-3 h-3 rounded-full ${dotClass}`;
    };
    const showError = (msg) => {
        const el = $('error');
        el.textContent = msg;
        el.classList.remove('hidden');
    };
    const clearError = () => $('error').classList.add('hidden');

    async function loadOrder() {
        try {
            const order = await api(`/order?o=${encodeURIComponent(orderNumber)}`);
            $('order-number').textContent = order.order_number;
            $('customer-line').textContent = `${order.customer_name} · ${order.customer_phone}`;
            $('address-line').textContent = order.delivery_address;
            if (order.notes && order.notes !== 'null') {
                $('notes-line').textContent = `Note: "${order.notes}"`;
                $('notes-line').classList.remove('hidden');
            }
            if (order.status === 'out_for_delivery') {
                $('mark-delivered-btn').classList.remove('hidden');
            }
            if (order.status === 'delivered' || order.status === 'cancelled') {
                setStatus(`Order ${order.status.replace(/_/g, ' ')}`, 'bg-stone-500');
                $('toggle-btn').disabled = true;
                $('toggle-btn').classList.add('opacity-50', 'cursor-not-allowed');
            }
        } catch (err) {
            showError('Could not load order: ' + err.message);
        }
    }

    async function sendPing(lat, lng) {
        try {
            await api(`/rider-ping?o=${encodeURIComponent(orderNumber)}`, {
                method: 'POST',
                body: { lat, lng, key },
            });
            pingCount += 1;
            $('ping-count').textContent = `${pingCount} ping${pingCount === 1 ? '' : 's'}`;
            $('last-ping').textContent = 'Last sent ' + new Date().toLocaleTimeString();
            clearError();
        } catch (err) {
            showError('Ping failed: ' + err.message);
        }
    }

    function onPosition(pos) {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        latestFix = { lat, lng, accuracy: pos.coords.accuracy };
        $('coords').textContent = `${lat}, ${lng}  (±${Math.round(pos.coords.accuracy)}m)`;
        const now = Date.now();
        if (now - lastSentAt >= PING_INTERVAL_MS) {
            lastSentAt = now;
            sendPing(lat, lng);
        }
    }

    function onPositionError(err) {
        const msgs = { 1: 'Permission denied. Allow location and reload.', 2: 'Position unavailable.', 3: 'Timed out.' };
        showError(msgs[err.code] || err.message);
        stopTracking();
    }

    function startTracking() {
        if (!navigator.geolocation) { showError('Geolocation unsupported on this device.'); return; }
        clearError();
        setStatus('Tracking live', 'bg-emerald-400 pulse');
        $('toggle-btn').textContent = 'Stop tracking';
        $('toggle-btn').classList.remove('bg-amber-600', 'hover:bg-amber-700');
        $('toggle-btn').classList.add('bg-rose-600', 'hover:bg-rose-700');
        watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
            enableHighAccuracy: true, maximumAge: 5000, timeout: 20000,
        });
        // Periodic ping even if coords haven't changed (rider standing still)
        window._periodicPing = setInterval(() => {
            if (!latestFix) return;
            const now = Date.now();
            if (now - lastSentAt >= PING_INTERVAL_MS) {
                lastSentAt = now;
                sendPing(latestFix.lat, latestFix.lng);
            }
        }, PING_INTERVAL_MS);
    }

    function stopTracking() {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        if (window._periodicPing) { clearInterval(window._periodicPing); window._periodicPing = null; }
        setStatus('Not tracking', 'bg-stone-500');
        $('toggle-btn').textContent = 'Start tracking';
        $('toggle-btn').classList.remove('bg-rose-600', 'hover:bg-rose-700');
        $('toggle-btn').classList.add('bg-amber-600', 'hover:bg-amber-700');
    }

    $('toggle-btn').addEventListener('click', () => {
        if (watchId === null) startTracking();
        else stopTracking();
    });

    $('mark-delivered-btn').addEventListener('click', async () => {
        if (!confirm('Mark this order as delivered?')) return;
        try {
            await api(`/order-status?o=${encodeURIComponent(orderNumber)}`, {
                method: 'POST', body: { status: 'delivered', key },
            });
            stopTracking();
            setStatus('Order delivered', 'bg-emerald-500');
            $('toggle-btn').disabled = true;
            $('toggle-btn').classList.add('opacity-50', 'cursor-not-allowed');
            $('mark-delivered-btn').disabled = true;
            $('mark-delivered-btn').classList.add('opacity-50', 'cursor-not-allowed');
        } catch (err) {
            showError('Failed to mark delivered: ' + err.message);
        }
    });

    loadOrder();
})();
