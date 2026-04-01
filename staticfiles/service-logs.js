const API = '/api';

function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }; }
function parseJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch(e) { return {}; }
}

if (!getToken()) { window.location.href = '/login/'; }

// ─── State ─────────────────────────────────────────────────────────────────────
let allOrders = [];
let selectedOrderId = null;
let currentTab = 'all';

// ─── Phase 1: Create Order ─────────────────────────────────────────────────────
document.getElementById('openNewOrderBtn').addEventListener('click', () => openModal('newOrderModal'));
document.getElementById('closeNewOrderModal').addEventListener('click', () => closeModal('newOrderModal'));

document.getElementById('newOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('newOrderError');
    errEl.style.display = 'none';
    const btn = e.target.querySelector('button[type="submit"]');

    const payload = {
        customer_name: document.getElementById('no_custName').value,
        customer_phone: document.getElementById('no_custPhone').value,
        device_brand: document.getElementById('no_brand').value,
        device_model: document.getElementById('no_model').value,
        device_imei: document.getElementById('no_imei').value,
        screen_condition: document.getElementById('no_screen').value,
        device_appearance: document.getElementById('no_appearance').value,
        issues: document.getElementById('no_issues').value,
        department: document.getElementById('no_dept').value,
        technician_comments_initial: document.getElementById('no_tech_comments').value,
        estimated_cost: document.getElementById('no_price').value || 0,
        estimated_minutes: document.getElementById('no_time').value || 60,
        commission: document.getElementById('no_comm').value || 0,
    };

    btn.textContent = 'Initializing Data...';
    try {
        const res = await fetch(`${API}/services/serviceorders/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(JSON.stringify(d)); }
        
        closeModal('newOrderModal');
        await loadOrders();
    } catch(err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Initialize Service Ticket';
    }
});

// ─── Load & Filter Orders ────────────────────────────────────────────────────────
async function loadOrders() {
    try {
        const res = await fetch(`${API}/services/serviceorders/`, { headers: authHeaders() });
        const data = await res.json();
        allOrders = data.results || data; 
        filterAndRenderOrders();
    } catch(e) { console.error('Order load failed:', e); }
}

function filterAndRenderOrders() {
    const q = document.getElementById('orderSearch').value.toLowerCase();
    
    let filtered = allOrders;
    // 1. Tab filtering (Hardware vs Software)
    if (currentTab !== 'all') {
        filtered = filtered.filter(o => o.department === currentTab);
    }
    // 2. Text Search
    if (q) {
        filtered = filtered.filter(o =>
            o.customer_name.toLowerCase().includes(q) ||
            `${o.device_brand} ${o.device_model}`.toLowerCase().includes(q)
        );
    }
    renderOrderList(filtered);
}

document.querySelectorAll('.d-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentTab = e.target.dataset.dept;
        filterAndRenderOrders();
    });
});

document.getElementById('orderSearch').addEventListener('input', filterAndRenderOrders);

function renderOrderList(orders) {
    const list = document.getElementById('orderList');
    if (!orders.length) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;">No service orders found.</p>'; return; }
    list.innerHTML = orders.map(o => `
        <div class="order-card ${selectedOrderId === o.id ? 'selected' : ''}" onclick="selectOrder('${o.id}')">
            <div class="order-header">
                <div class="order-info">
                    <h4>${o.customer_name}</h4>
                    <p>${o.device_brand} ${o.device_model}</p>
                </div>
                <span class="status-badge badge-${o.status}">${o.status.replace('_', ' ').toUpperCase()}</span>
            </div>
            <p style="font-size:12px; color:var(--text-muted);">${o.issues || '—'}</p>
        </div>
    `).join('');
}

// ─── Main Details View ──────────────────────────────────────────────────────────
async function selectOrder(orderId) {
    selectedOrderId = orderId;
    filterAndRenderOrders();

    try {
        const res = await fetch(`${API}/services/serviceorders/${orderId}/`, { headers: authHeaders() });
        const order = await res.json();
        window.currentOrderMeta = order; // Save globally for easy access

        document.getElementById('detailCustomer').textContent = `${order.customer_name} · ${order.customer_phone}`;
        document.getElementById('detailDevice').textContent = `${order.device_brand} ${order.device_model} (IMEI: ${order.device_imei || 'N/A'})`;
        document.getElementById('detailIssues').textContent = `Issues: ${order.issues}`;
        document.getElementById('detailAppearance').textContent = `Initial Appearance: ${order.screen_condition.toUpperCase()} | ${order.device_appearance || 'No further notes.'}`;
        
        const statusEl = document.getElementById('detailStatus');
        statusEl.textContent = order.status.replace('_', ' ').toUpperCase();
        statusEl.className = `status-badge badge-${order.status}`;
        
        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('detailContent').style.display = 'block';
        
        renderStatusButtons(order);
        renderWorkLogs(order.work_logs || []);
        renderPartsUsed(order.parts_used || []);
        renderMedia(order.media || []);
    } catch (e) { console.error('Failed to load order details', e); }
}

function renderStatusButtons(order) {
    const container = document.getElementById('statusButtons');
    let html = '';

    if (order.status === 'pending') {
        html = `<button class="action-btn" onclick="updateOrderStatus('${order.id}', 'in_progress')">Start Technical Phase</button>`;
    } else if (order.status === 'in_progress') {
        html = `<button class="action-btn" onclick="updateOrderStatus('${order.id}', 'ready')">Mark Ready (Testing Completed)</button>`;
        html += `<button class="action-btn" style="color:var(--danger); border-color:var(--danger);" onclick="updateOrderStatus('${order.id}', 'return')">Return Unfixed / Failed</button>`;
    } else if (order.status === 'ready' || order.status === 'return') {
        html = `<button class="action-btn" onclick="openPaymentModal('${order.id}')" style="background:var(--primary); color:#fff;">Process Final Delivery</button>`;
    }
    
    container.innerHTML = html;
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await fetch(`${API}/services/serviceorders/${orderId}/update_status/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ status: newStatus })
        });
        await loadOrders();
        selectOrder(orderId);
    } catch(e) { alert('Status update failed.'); }
}

// ─── Sub-Entities (Logs, Parts, Media) ──────────────────────────────────────────
function renderWorkLogs(logs) {
    const container = document.getElementById('workLogsList');
    if (!logs.length) { container.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No telemetry lines recorded.</p>'; return; }
    container.innerHTML = logs.map(log => `
        <div style="background:#f8fafc; padding:15px; border-radius:10px; margin-bottom:10px; border-left:4px solid var(--primary);">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px; color:var(--text-muted); font-weight:700;">
                <span>👤 Authorized Tech: ${log.technician_name || 'System Operator'}</span>
                <span>⏱️ ${new Date(log.created_at).toLocaleString()}</span>
            </div>
            <p style="font-size:14px; font-weight:500; color:var(--text-main);">${log.notes}</p>
        </div>
    `).join('');
}

function renderPartsUsed(parts) {
    const container = document.getElementById('partsUsedList');
    if (!parts.length) { container.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No hardware mapped yet.</p>'; return; }
    container.innerHTML = parts.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:15px; border-radius:10px; margin-bottom:10px; border:1px solid var(--border-light);">
            <div>
                <p style="font-weight:800; font-size:14px;">📦 ${p.product_name || p.part_name || 'Unknown Part'} <span style="font-size:11px; color:#fff; background:${p.source === 'vendor' ? '#ee5d50' : '#05cd99'}; padding:2px 6px; border-radius:6px; margin-left:8px;">${p.source.toUpperCase()}</span></p>
                <p style="font-size:12px; color:var(--text-muted); margin-top:3px;">Qty: ${p.quantity} Unit Cost: PKR ${parseFloat(p.unit_cost).toLocaleString()}</p>
            </div>
            <strong style="color:var(--text-main);">PKR ${(p.quantity * parseFloat(p.unit_cost)).toLocaleString()}</strong>
        </div>
    `).join('');
}

function renderMedia(mediaData) {
    const container = document.getElementById('mediaList');
    if (!mediaData.length) { container.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No S3 footprint recorded.</p>'; return; }
    container.innerHTML = mediaData.map(m => {
        const isVideo = m.media_type === 'video' || (m.file && m.file.endsWith('.mp4'));
        const elm = isVideo ? `<video src="${m.file}" controls style="border-radius:10px; max-width:140px; border:1px solid #e2e8f0;"></video>`
                            : `<img src="${m.file}" style="border-radius:10px; max-width:140px; max-height:100px; object-fit:cover; border:1px solid #e2e8f0;">`;
        return `
        <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-start;">
            ${elm}
            <span style="font-size:10px; color:var(--text-muted); max-width:140px;">${m.caption || ''}</span>
        </div>`;
    }).join('');
}

// ─── Modal Architecture ────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.getElementById(id).querySelectorAll('form').forEach(f => f.reset()); }

document.getElementById('openLogModalBtn').addEventListener('click', () => { if(selectedOrderId) openModal('logModal'); });
document.getElementById('openPartModalBtn').addEventListener('click', () => { if(selectedOrderId) openModal('partModal'); });
document.getElementById('openMediaModalBtn').addEventListener('click', () => { if(selectedOrderId) openModal('mediaModal'); });

['logModal', 'partModal', 'mediaModal', 'paymentModal'].forEach(id => {
    document.getElementById('close' + id.charAt(0).toUpperCase() + id.slice(1)).addEventListener('click', () => closeModal(id));
});

// Logs
document.getElementById('logForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving...';
    try {
        const res = await fetch(`${API}/services/servicelogs/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ service_order: selectedOrderId, notes: document.getElementById('logNotes').value.trim() })
        });
        if(!res.ok) throw new Error("Failed logging.");
        closeModal('logModal'); selectOrder(selectedOrderId);
    } catch(err) { alert(err.message); } finally { btn.textContent = 'Save Telemetry'; }
});

// Parts (Inventory vs Vendor)
document.getElementById('partSource').addEventListener('change', (e) => {
    const isVendor = e.target.value === 'vendor';
    document.getElementById('inventorySection').style.display = isVendor ? 'none' : 'block';
    document.getElementById('vendorSection').style.display = isVendor ? 'block' : 'none';
});

async function loadProducts() {
    try {
        const res = await fetch(`${API}/inventory/products/`, { headers: authHeaders() });
        const data = await res.json();
        const sel = document.getElementById('partProduct');
        sel.innerHTML = '<option value="">Select internal hardware...</option>' + (data.results || data).map(p =>
            `<option value="${p.id}" data-cost="${p.sale_price || p.price || 0}">${p.brand} ${p.model_name} (Stock: ${p.stock_quantity})</option>`
        ).join('');
        sel.addEventListener('change', () => {
            const selected = sel.options[sel.selectedIndex];
            if (selected.dataset.cost) document.getElementById('partCost').value = selected.dataset.cost;
        });
    } catch(e) { console.error('Product load failed:', e); }
}

document.getElementById('partForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = document.getElementById('partSource').value;
    const payload = {
        service_order: selectedOrderId,
        source: source,
        quantity: document.getElementById('partQty').value,
        unit_cost: document.getElementById('partCost').value
    };

    if (source === 'inventory') {
        payload.product = document.getElementById('partProduct').value;
        if (!payload.product) return alert('Select an internal product.');
    } else {
        payload.part_name = document.getElementById('partName').value;
        if (!payload.part_name) return alert('Provide vendor part name.');
    }

    try {
        const res = await fetch(`${API}/services/serviceparts/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        if(!res.ok) {
            const j = await res.json(); throw new Error(JSON.stringify(j));
        }
        closeModal('partModal'); selectOrder(selectedOrderId);
    } catch(err) { alert("Stock Error: " + err.message); }
});

// Media (30s verification)
document.getElementById('mediaFile').addEventListener('change', function() {
    const file = this.files[0];
    if (file && file.type.startsWith('video/')) {
        // Evaluate video limit client side
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src);
            if (video.duration > 32) { // 30s + 2s buffer padding
                alert("Invalid: Video duration is " + Math.round(video.duration) + "s. Max limit is 30 seconds for Cloud Uploads.");
                document.getElementById('mediaFile').value = '';
            }
        }
        video.src = URL.createObjectURL(file);
    }
});

document.getElementById('mediaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const fileNode = document.getElementById('mediaFile');
    if (!fileNode.files[0]) return;

    const file = fileNode.files[0];
    const formData = new FormData();
    formData.append('service_order', selectedOrderId);
    formData.append('file', file);
    formData.append('caption', document.getElementById('mediaCaption').value);
    formData.append('media_type', file.type.startsWith('video') ? 'video' : 'image');

    btn.textContent = 'Uploading chunk data...';
    try {
        const res = await fetch(`${API}/services/servicemedia/`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });
        if(!res.ok) throw new Error("S3 Timeout");
        closeModal('mediaModal'); selectOrder(selectedOrderId);
    } catch(e) { alert(e.message); } finally { btn.textContent = 'Stream to AWS S3'; }
});

// ─── Phase 3: Payment UI Logic Equivalent to POS ────────────────────────────────
window.openPaymentModal = (orderId) => {
    const meta = window.currentOrderMeta;
    if(!meta) return;

    // Sum parts + base estimate
    let partsTotal = 0;
    if (meta.parts_used && meta.parts_used.length) {
        partsTotal = meta.parts_used.reduce((acc, p) => acc + parseFloat(p.total_cost || 0), 0);
    }
    const totalCalc = parseFloat(meta.estimated_cost || 0) + partsTotal;

    document.getElementById('paymentAmount').value = totalCalc.toFixed(2);
    document.getElementById('paymentReceived').value = totalCalc.toFixed(2);
    updateServiceChange();
    
    // reset selection
    document.querySelectorAll('.p-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.p-btn[data-method="cash"]').classList.add('selected');
    document.getElementById('paymentMethod').value = 'cash';
    document.getElementById('cashLogic').style.display = 'block';

    openModal('paymentModal');
};

document.querySelectorAll('.p-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.p-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const method = btn.dataset.method;
    document.getElementById('paymentMethod').value = method;
    document.getElementById('cashLogic').style.display = (method === 'cash') ? 'block' : 'none';
}));

function updateServiceChange() {
    const due = parseFloat(document.getElementById('paymentAmount').value || 0);
    const rec = parseFloat(document.getElementById('paymentReceived').value || 0);
    document.getElementById('paymentChange').innerText = `PKR ${Math.max(0, rec - due).toFixed(2)}`;
}
document.getElementById('paymentReceived').addEventListener('input', updateServiceChange);

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const finalAmt = document.getElementById('paymentAmount').value;
    const method = document.getElementById('paymentMethod').value;
    
    btn.textContent = 'Processing Ledgers...';
    try {
        const res = await fetch(`${API}/services/serviceorders/${selectedOrderId}/process_payment/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ final_amount: finalAmt, payment_method: method })
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Gateway Timeout');

        closeModal('paymentModal');
        await loadOrders(); // will refresh list
        
        // Use Global Meta for the print Receipt structure identical to POS framework
        const meta = window.currentOrderMeta;
        printServiceReceipt(meta, { total_amount: parseFloat(finalAmt), payment_method: method });

        selectedOrderId = null; // Clear view
        document.getElementById('detailContent').style.display = 'none';
        document.getElementById('detailPlaceholder').style.display = 'block';
    } catch(err) {
        document.getElementById('paymentError').innerText = err.message;
        document.getElementById('paymentError').style.display = 'block';
    } finally {
        btn.textContent = 'AUTHORIZE DELIVERY & RECEIPT';
    }
});

// Reuse same 80mm layout format
function printServiceReceipt(meta, paymentInfo) {
    const rc = document.getElementById('receiptContent');
    const partsArray = meta.parts_used || [];
    
    let partsHtml = partsArray.map(p => `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="max-width:65%; font-size:11px;">[PART] ${p.quantity}x ${p.product_name || p.part_name}</span>
            <span style="font-size:11px;">PKR${parseFloat(p.total_cost).toFixed(2)}</span>
        </div>
    `).join('');

    let html = `
        <div style="text-align:center; margin-bottom:15px; border-bottom:1px dashed #000; padding-bottom:10px;">
            <h2 style="margin:0; font-family:monospace; font-size:20px; font-weight:800;">ZORVEX ERP</h2>
            <p style="margin:2px 0; font-size:11px;">Service Centers | Tech Dept</p>
            <p style="margin:5px 0 0 0; font-size:12px; font-weight:bold;">TKT: #SVC-${meta.id.substring(0, 8).toUpperCase()}</p>
            <p style="margin:2px 0; font-size:11px;">Client: ${meta.customer_name}</p>
        </div>
        
        <div style="margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:800;">
                <span style="max-width:65%; font-size:11px;">[LABOR] Base Service Cost</span>
                <span style="font-size:11px;">PKR${parseFloat(meta.estimated_cost).toFixed(2)}</span>
            </div>
            ${partsHtml}
        </div>

        <div style="border-top:1px dashed #000; padding-top:10px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; margin-top:5px;">
                <span>TOTAL BILLED:</span><span>PKR${paymentInfo.total_amount.toFixed(2)}</span>
            </div>
        </div>
        
        <div style="text-align:center; margin-top:20px; font-size:11px;">
            <p style="margin:0;">Method: ${(paymentInfo.payment_method || 'CASH').toUpperCase()}</p>
            <p style="margin:5px 0 0 0; font-style:italic;">Thank you for your business!</p>
        </div>
    `;
    rc.innerHTML = html;
    openModal('receiptModal');
    document.body.style.background = '#fff';
}

document.getElementById('closeReceiptBtn').addEventListener('click', () => { 
    closeModal('receiptModal');
    document.body.style.background = ''; // restore
});

// ─── Init ──────────────────────────────────────────────────────────────────────
loadOrders();
loadProducts();
