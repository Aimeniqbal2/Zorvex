/* ============================================================
   service-logs.js
   Full Service Center Logic:
   - Phase 1:  Create order
   - Phase 1b: Admin assigns technician (BEFORE tech phase)
   - Phase 2:  Start Technical Phase → unlocks Parts / Logs / Media
   - Phase 3:  Payment & receipt
   Role awareness: admin sees all controls; technician sees only assigned
   ============================================================ */

const API = '/api';

function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }; }
function parseJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch(e) { return {}; }
}

if (!getToken()) { window.location.href = '/login/'; }

// ─── Current User Info ─────────────────────────────────────────────────────────
const _jwt = parseJWT(getToken());
const currentUserRole = _jwt.role || '';
const currentUserId   = _jwt.user_id || '';
const isAdmin = ['admin', 'manager', 'super_admin'].includes(currentUserRole);

// ─── State ─────────────────────────────────────────────────────────────────────
let allOrders = [];
let selectedOrderId = null;
let currentTab = 'all';

// ─── Phase 1: Create Order ──────────────────────────────────────────────────────
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
        estimated_cost: parseFloat(document.getElementById('no_price').value) || 0,
        estimated_minutes: parseInt(document.getElementById('no_time').value) || 60,
        commission: parseFloat(document.getElementById('no_comm').value) || 0,
    };

    btn.textContent = 'Initializing...';
    btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/serviceorders/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(JSON.stringify(d)); }
        closeModal('newOrderModal');
        e.target.reset();
        await loadOrders();
        showToast('Service ticket created successfully!', 'success');
    } catch(err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Initialize Service Ticket';
        btn.disabled = false;
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
    if (currentTab !== 'all') {
        filtered = filtered.filter(o => o.department === currentTab);
    }
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
    if (!orders.length) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;">No service orders found.</p>';
        return;
    }
    list.innerHTML = orders.map(o => {
        const techName = o.assigned_technician_name || o.assigned_technician_username || o.technician_name || o.technician_username || 'Unassigned';
        const assignedBadge = o.assigned_technician
            ? `<span style="font-size:10px;background:#e6fcf5;color:#05cd99;padding:2px 6px;border-radius:5px;font-weight:700;">✓ ${techName}</span>`
            : `<span style="font-size:10px;background:#fff3cd;color:#856404;padding:2px 6px;border-radius:5px;font-weight:700;">⚠ Unassigned</span>`;
        return `
        <div class="order-card ${selectedOrderId === o.id ? 'selected' : ''}" onclick="selectOrder('${o.id}')">
            <div class="order-header">
                <div class="order-info">
                    <h4>${o.customer_name}</h4>
                    <p>${o.device_brand} ${o.device_model}</p>
                </div>
                <span class="status-badge badge-${o.status}">${o.status.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                ${assignedBadge}
                <span style="font-size:11px;color:var(--text-muted);">${o.department?.toUpperCase()}</span>
            </div>
        </div>`;
    }).join('');
}

// ─── Main Details View ──────────────────────────────────────────────────────────
async function selectOrder(orderId) {
    selectedOrderId = orderId;
    filterAndRenderOrders();
    try {
        const res = await fetch(`${API}/services/serviceorders/${orderId}/`, { headers: authHeaders() });
        const order = await res.json();
        window.currentOrderMeta = order;

        document.getElementById('detailCustomer').textContent = `${order.customer_name} · ${order.customer_phone}`;
        document.getElementById('detailDevice').textContent = `${order.device_brand} ${order.device_model} (IMEI: ${order.device_imei || 'N/A'})`;
        document.getElementById('detailIssues').textContent = `Issues: ${order.issues}`;
        document.getElementById('detailAppearance').textContent = `Condition: ${(order.screen_condition || '').toUpperCase()} | ${order.device_appearance || 'No notes.'}`;

        const statusEl = document.getElementById('detailStatus');
        statusEl.textContent = order.status.replace('_', ' ').toUpperCase();
        statusEl.className = `status-badge badge-${order.status}`;

        document.getElementById('detailPlaceholder').style.display = 'none';
        document.getElementById('detailContent').style.display = 'block';

        // Render technician assignment info
        renderAssignmentBanner(order);
        // Render status/phase action buttons
        renderStatusButtons(order);
        // Gate Phase 2 buttons behind technical_phase_started
        renderPhase2Controls(order);

        renderWorkLogs(order.work_logs || []);
        renderPartsUsed(order.parts_used || []);
        renderMedia(order.media || []);
    } catch (e) { console.error('Failed to load order details', e); }
}

// ─── Assignment Banner ──────────────────────────────────────────────────────────
function renderAssignmentBanner(order) {
    const container = document.getElementById('assignmentBanner');
    if (!container) return;
    if (order.assigned_technician) {
        container.innerHTML = `
            <div style="background:#e6fcf5;border:1px solid #05cd99;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <p style="font-size:11px;font-weight:700;color:#05cd99;text-transform:uppercase;">Assigned Technician</p>
                    <p style="font-size:15px;font-weight:800;color:var(--text-main);">👤 ${order.assigned_technician_name || order.assigned_technician_username}</p>
                </div>
                ${isAdmin ? `<button class="action-btn" onclick="openAssignModal('${order.id}')" style="font-size:12px;padding:8px 12px;">Re-assign</button>` : ''}
            </div>`;
    } else {
        container.innerHTML = `
            <div style="background:#fff3cd;border:1px solid #ffb547;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <p style="font-size:11px;font-weight:700;color:#856404;text-transform:uppercase;">⚠ No Technician Assigned</p>
                    <p style="font-size:13px;color:var(--text-muted);">Assign a technician before the repair can begin.</p>
                </div>
                ${isAdmin ? `<button class="action-btn" onclick="openAssignModal('${order.id}')" style="font-size:12px;padding:8px 12px;background:var(--warning);color:#fff;border-color:var(--warning);">Assign Now</button>` : ''}
            </div>`;
    }
}

// ─── Phase 2 Controls (Gated) ───────────────────────────────────────────────────
function renderPhase2Controls(order) {
    const btnArea = document.getElementById('phase2Controls');
    if (!btnArea) return;

    const myId = String(currentUserId);
    const assignedId = String(order.assigned_technician || '');
    const isAssigned = assignedId && assignedId === myId;
    const canAct = isAdmin || isAssigned;

    if (!order.technical_phase_started) {
        // Only show "Start Technical Phase" if assigned or admin & technician is set
        if (canAct && order.assigned_technician) {
            btnArea.innerHTML = `
                <button class="action-btn" id="startPhaseBtn"
                    onclick="startTechnicalPhase('${order.id}')"
                    style="background:var(--primary);color:#fff;border-color:var(--primary);padding:12px 20px;font-size:14px;width:100%;margin-bottom:10px;">
                    🚀 Start Technical Phase
                </button>`;
        } else if (!order.assigned_technician) {
            btnArea.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px;">Awaiting technician assignment before phase can begin.</p>`;
        } else {
            btnArea.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px;">Awaiting technician to start this repair.</p>`;
        }
    } else {
        // Phase started — show all 3 action buttons
        btnArea.innerHTML = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                <button class="action-btn" id="openLogModalBtn" style="flex:1;min-width:120px;">+ Work Log</button>
                <button class="action-btn" id="openPartModalBtn" style="flex:1;min-width:120px;">+ Inject Part</button>
                <button class="action-btn" id="openMediaModalBtn" style="flex:1;min-width:120px;">+ Media</button>
            </div>`;
        document.getElementById('openLogModalBtn')?.addEventListener('click', () => { if(selectedOrderId) openModal('logModal'); });
        document.getElementById('openPartModalBtn')?.addEventListener('click', () => { if(selectedOrderId) openModal('partModal'); });
        document.getElementById('openMediaModalBtn')?.addEventListener('click', () => { if(selectedOrderId) openModal('mediaModal'); });
    }
}

function renderStatusButtons(order) {
    const container = document.getElementById('statusButtons');
    let html = '';
    if (order.status === 'in_progress') {
        html = `<button class="action-btn" onclick="updateOrderStatus('${order.id}', 'ready')">✅ Mark Ready</button>`;
        html += `<button class="action-btn" style="color:var(--danger);border-color:var(--danger);" onclick="updateOrderStatus('${order.id}', 'return')">↩ Return Unfixed</button>`;
    } else if (order.status === 'ready' || order.status === 'return') {
        html = `<button class="action-btn" onclick="openPaymentModal('${order.id}')" style="background:var(--success);color:#fff;border-color:var(--success);">💳 Process Delivery</button>`;
    }
    container.innerHTML = html;
}

// ─── Start Technical Phase ──────────────────────────────────────────────────────
async function startTechnicalPhase(orderId) {
    const btn = document.getElementById('startPhaseBtn');
    if (btn) { btn.textContent = 'Starting...'; btn.disabled = true; }
    try {
        const res = await fetch(`${API}/services/serviceorders/${orderId}/start_technical_phase/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({})
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
        showToast('Technical phase started!', 'success');
        await loadOrders();
        selectOrder(orderId);
    } catch(e) {
        showToast(e.message, 'error');
        if (btn) { btn.textContent = '🚀 Start Technical Phase'; btn.disabled = false; }
    }
}

// ─── Assign Technician Modal (Admin only) ───────────────────────────────────────
let technicians = [];
async function loadTechnicians() {
    if (technicians.length) return;
    try {
        const res = await fetch(`${API}/services/technicians/`, { headers: authHeaders() });
        technicians = await res.json();
    } catch(e) { console.error('Technician load failed:', e); }
}

async function openAssignModal(orderId) {
    await loadTechnicians();
    const sel = document.getElementById('assignTechSelect');
    sel.innerHTML = '<option value="">Select technician...</option>' +
        technicians.map(t => `<option value="${t.id}">${t.full_name} (@${t.username})</option>`).join('');
    document.getElementById('assignOrderId').value = orderId;
    openModal('assignModal');
}

document.getElementById('closeAssignModal')?.addEventListener('click', () => closeModal('assignModal'));

document.getElementById('assignForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const orderId = document.getElementById('assignOrderId').value;
    const techId  = document.getElementById('assignTechSelect').value;
    const errEl   = document.getElementById('assignError');
    errEl.style.display = 'none';
    if (!techId) { errEl.textContent = 'Select a technician.'; errEl.style.display = 'block'; return; }

    btn.textContent = 'Assigning...';
    btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/serviceorders/${orderId}/assign_technician/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ technician_id: techId })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || JSON.stringify(d)); }
        closeModal('assignModal');
        e.target.reset();
        showToast('Technician assigned successfully!', 'success');
        await loadOrders();
        selectOrder(orderId);
    } catch(err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Confirm Assignment';
        btn.disabled = false;
    }
});

// ─── Status Update ──────────────────────────────────────────────────────────────
async function updateOrderStatus(orderId, newStatus) {
    try {
        const res = await fetch(`${API}/services/serviceorders/${orderId}/update_status/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Status update failed');
        showToast(`Status updated to ${newStatus}`, 'success');
        await loadOrders();
        selectOrder(orderId);
    } catch(e) { showToast(e.message, 'error'); }
}

// ─── Work Logs ──────────────────────────────────────────────────────────────────
function renderWorkLogs(logs) {
    const container = document.getElementById('workLogsList');
    if (!logs.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No work logs yet.</p>'; return; }
    container.innerHTML = logs.map(log => `
        <div style="background:var(--input-bg,#f8fafc);padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid var(--primary);">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--text-muted);font-weight:700;">
                <span>👤 ${log.technician_name || log.technician_username || 'Tech'}</span>
                <span>⏱️ ${new Date(log.created_at).toLocaleString()}</span>
            </div>
            <p style="font-size:14px;font-weight:500;color:var(--text-main);">${log.notes}</p>
        </div>`).join('');
}

document.getElementById('logForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/servicelogs/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ service_order: selectedOrderId, notes: document.getElementById('logNotes').value.trim() })
        });
        if (!res.ok) throw new Error('Log save failed.');
        closeModal('logModal'); e.target.reset();
        selectOrder(selectedOrderId);
        showToast('Work log saved!', 'success');
    } catch(err) { showToast(err.message, 'error');
    } finally { btn.textContent = 'Save Log'; btn.disabled = false; }
});

// ─── Parts (Inventory or Vendor) ────────────────────────────────────────────────
function renderPartsUsed(parts) {
    const container = document.getElementById('partsUsedList');
    if (!parts.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No parts added yet.</p>'; return; }
    container.innerHTML = parts.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--card-bg,#fff);padding:14px;border-radius:10px;margin-bottom:8px;border:1px solid var(--border-light);">
            <div>
                <p style="font-weight:800;font-size:14px;color:var(--text-main);">📦 ${p.product_name || p.part_name || 'Unknown'}
                    <span style="font-size:11px;color:#fff;background:${p.source === 'vendor' ? '#ee5d50' : '#05cd99'};padding:2px 6px;border-radius:5px;margin-left:6px;">${p.source.toUpperCase()}</span>
                    ${p.vendor_name ? `<span style="font-size:11px;color:var(--text-muted);"> · ${p.vendor_name}</span>` : ''}
                </p>
                <p style="font-size:12px;color:var(--text-muted);margin-top:3px;">Qty: ${p.quantity} · Unit: PKR ${parseFloat(p.unit_cost).toLocaleString()}</p>
            </div>
            <strong style="color:var(--text-main);">PKR ${(p.quantity * parseFloat(p.unit_cost)).toLocaleString()}</strong>
        </div>`).join('');
}

document.getElementById('partSource').addEventListener('change', (e) => {
    const isVendor = e.target.value === 'vendor';
    document.getElementById('inventorySection').style.display = isVendor ? 'none' : 'block';
    document.getElementById('vendorSection').style.display = isVendor ? 'block' : 'none';
    document.getElementById('vendorSelectSection').style.display = isVendor ? 'block' : 'none';
});

async function loadProducts() {
    try {
        const res = await fetch(`${API}/inventory/products/`, { headers: authHeaders() });
        const data = await res.json();
        const sel = document.getElementById('partProduct');
        sel.innerHTML = '<option value="">Select internal part...</option>' + (data.results || data).map(p =>
            `<option value="${p.id}" data-cost="${p.cost_price || 0}">${p.brand} ${p.model_name} (Stock: ${p.stock_quantity})</option>`
        ).join('');
        sel.addEventListener('change', () => {
            const opt = sel.options[sel.selectedIndex];
            if (opt?.dataset.cost) document.getElementById('partCost').value = opt.dataset.cost;
        });
    } catch(e) { console.error('Product load failed:', e); }
}

async function loadVendors() {
    try {
        const res = await fetch(`${API}/inventory/vendors/`, { headers: authHeaders() });
        const data = await res.json();
        const sel = document.getElementById('partVendor');
        sel.innerHTML = '<option value="">Select vendor...</option>' + (data.results || data).map(v =>
            `<option value="${v.id}">${v.name}${v.balance > 0 ? ` (Payable: PKR ${parseFloat(v.balance).toLocaleString()})` : ''}</option>`
        ).join('');
    } catch(e) { console.error('Vendor load failed:', e); }
}

document.getElementById('partForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const source   = document.getElementById('partSource').value;
    const quantity = document.getElementById('partQty').value;
    const unitCost = document.getElementById('partCost').value;
    const errEl    = document.getElementById('partError');
    errEl.style.display = 'none';

    const payload = { service_order: selectedOrderId, source, quantity, unit_cost: unitCost };

    if (source === 'inventory') {
        payload.product = document.getElementById('partProduct').value;
        if (!payload.product) { errEl.textContent = 'Select an internal product.'; errEl.style.display = 'block'; return; }
    } else {
        payload.part_name = document.getElementById('partName').value;
        payload.vendor    = document.getElementById('partVendor').value || null;
        if (!payload.part_name) { errEl.textContent = 'Provide vendor part name.'; errEl.style.display = 'block'; return; }
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/serviceparts/`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
        });
        if (!res.ok) { const j = await res.json(); throw new Error(JSON.stringify(j)); }
        closeModal('partModal'); e.target.reset();
        document.getElementById('inventorySection').style.display = 'block';
        document.getElementById('vendorSection').style.display = 'none';
        document.getElementById('vendorSelectSection').style.display = 'none';
        selectOrder(selectedOrderId);
        showToast('Part added successfully!', 'success');
    } catch(err) { errEl.textContent = err.message; errEl.style.display = 'block';
    } finally { btn.textContent = 'Attach Component'; btn.disabled = false; }
});

// ─── Media Upload (multipart/form-data — no JSON headers) ───────────────────────
function renderMedia(mediaData) {
    const container = document.getElementById('mediaList');
    if (!mediaData.length) { container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No media uploaded yet.</p>'; return; }
    container.innerHTML = mediaData.map(m => {
        const isVideo = m.media_type === 'video';
        const src = m.file;
        const elm = isVideo
            ? `<video src="${src}" controls style="border-radius:10px;max-width:140px;border:1px solid var(--border-light);"></video>`
            : `<img src="${src}" style="border-radius:10px;max-width:140px;max-height:100px;object-fit:cover;border:1px solid var(--border-light);">`;
        return `<div style="display:flex;flex-direction:column;gap:5px;">${elm}<span style="font-size:10px;color:var(--text-muted);max-width:140px;">${m.caption || ''}</span></div>`;
    }).join('');
}

document.getElementById('mediaFile').addEventListener('change', function() {
    const file = this.files[0];
    if (file && file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = function() {
            window.URL.revokeObjectURL(video.src);
            if (video.duration > 32) {
                alert(`Video is ${Math.round(video.duration)}s — max 30 seconds allowed.`);
                document.getElementById('mediaFile').value = '';
            }
        };
        video.src = URL.createObjectURL(file);
    }
});

document.getElementById('mediaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn    = e.target.querySelector('button[type="submit"]');
    const fileEl = document.getElementById('mediaFile');
    const errEl  = document.getElementById('mediaError');
    errEl.style.display = 'none';
    if (!fileEl.files[0]) return;

    const file = fileEl.files[0];
    // IMPORTANT: Use raw FormData — do NOT set Content-Type header (browser sets multipart boundary)
    const formData = new FormData();
    formData.append('service_order', selectedOrderId);
    formData.append('file', file);
    formData.append('caption', document.getElementById('mediaCaption').value);
    formData.append('media_type', file.type.startsWith('video') ? 'video' : 'image');

    btn.textContent = 'Uploading...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/servicemedias/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` }, // No Content-Type!
            body: formData
        });
        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.detail || d.file?.[0] || 'Upload failed');
        }
        closeModal('mediaModal'); e.target.reset();
        selectOrder(selectedOrderId);
        showToast('Media uploaded!', 'success');
    } catch(err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally { btn.textContent = 'Upload Media'; btn.disabled = false; }
});

// ─── Payment ────────────────────────────────────────────────────────────────────
window.openPaymentModal = (orderId) => {
    const meta = window.currentOrderMeta;
    if (!meta) return;
    let partsTotal = (meta.parts_used || []).reduce((acc, p) => acc + parseFloat(p.total_cost || 0), 0);
    const total = parseFloat(meta.estimated_cost || 0) + partsTotal;
    document.getElementById('paymentAmount').value = total.toFixed(2);
    document.getElementById('paymentReceived').value = total.toFixed(2);
    updateServiceChange();
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
    document.getElementById('cashLogic').style.display = method === 'cash' ? 'block' : 'none';
}));

function updateServiceChange() {
    const due = parseFloat(document.getElementById('paymentAmount').value || 0);
    const rec = parseFloat(document.getElementById('paymentReceived').value || 0);
    document.getElementById('paymentChange').innerText = `PKR ${Math.max(0, rec - due).toFixed(2)}`;
}
document.getElementById('paymentReceived').addEventListener('input', updateServiceChange);

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = e.target.querySelector('button[type="submit"]');
    const amount  = document.getElementById('paymentAmount').value;
    const method  = document.getElementById('paymentMethod').value;
    const errEl   = document.getElementById('paymentError');
    errEl.style.display = 'none';
    btn.textContent = 'Processing...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/services/serviceorders/${selectedOrderId}/process_payment/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ final_amount: amount, payment_method: method })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment failed');
        closeModal('paymentModal');
        await loadOrders();
        printServiceReceipt(window.currentOrderMeta, { total_amount: parseFloat(amount), payment_method: method });
        selectedOrderId = null;
        document.getElementById('detailContent').style.display = 'none';
        document.getElementById('detailPlaceholder').style.display = 'block';
        showToast('Payment processed & receipt ready!', 'success');
    } catch(err) {
        errEl.textContent = err.message; errEl.style.display = 'block';
    } finally { btn.textContent = 'AUTHORIZE DELIVERY & RECEIPT'; btn.disabled = false; }
});

// ─── Receipt ────────────────────────────────────────────────────────────────────
function printServiceReceipt(meta, paymentInfo) {
    const partsHtml = (meta.parts_used || []).map(p => `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="max-width:65%;font-size:11px;">[PART] ${p.quantity}x ${p.product_name || p.part_name}</span>
            <span style="font-size:11px;">PKR${parseFloat(p.total_cost).toFixed(2)}</span>
        </div>`).join('');
    document.getElementById('receiptContent').innerHTML = `
        <div style="text-align:center;margin-bottom:15px;border-bottom:1px dashed #000;padding-bottom:10px;">
            <h2 style="margin:0;font-size:20px;font-weight:800;">ZORVEX ERP</h2>
            <p style="margin:2px 0;font-size:11px;">Service Center | Tech Dept</p>
            <p style="margin:5px 0 0;font-size:12px;font-weight:bold;">TKT: #SVC-${meta.id.substring(0,8).toUpperCase()}</p>
            <p style="margin:2px 0;font-size:11px;">Client: ${meta.customer_name}</p>
        </div>
        <div style="margin-bottom:15px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-weight:800;">
                <span style="font-size:11px;">[LABOUR] Base Service</span>
                <span style="font-size:11px;">PKR${parseFloat(meta.estimated_cost).toFixed(2)}</span>
            </div>
            ${partsHtml}
        </div>
        <div style="border-top:1px dashed #000;padding-top:10px;">
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;margin-top:5px;">
                <span>TOTAL:</span><span>PKR${paymentInfo.total_amount.toFixed(2)}</span>
            </div>
        </div>
        <div style="text-align:center;margin-top:20px;font-size:11px;">
            <p>Method: ${(paymentInfo.payment_method||'CASH').toUpperCase()}</p>
            <p style="margin-top:5px;font-style:italic;">Thank you for your business!</p>
        </div>`;
    openModal('receiptModal');
}

document.getElementById('closeReceiptBtn').addEventListener('click', () => closeModal('receiptModal'));

// ─── Modals ─────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.querySelectorAll('form').forEach(f => f.reset());
}

['logModal','partModal','mediaModal','paymentModal'].forEach(id => {
    const closeId = 'close' + id.charAt(0).toUpperCase() + id.slice(1);
    document.getElementById(closeId)?.addEventListener('click', () => closeModal(id));
});

// ─── Toast Notification ──────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    let toast = document.getElementById('svcToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'svcToast';
        toast.style.cssText = `position:fixed;bottom:90px;right:28px;padding:14px 20px;border-radius:12px;
            font-weight:700;font-size:14px;z-index:99999;opacity:0;pointer-events:none;
            transition:opacity 0.3s;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.18);`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = type === 'success' ? '#05cd99' : '#ee5d50';
    toast.style.color = '#fff';
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ─── Init ────────────────────────────────────────────────────────────────────────
loadOrders();
loadProducts();
loadVendors();
