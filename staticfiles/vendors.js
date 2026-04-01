const API = '/api';

function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }; }

// ─── Auth Guard ────────────────────────────────────────────────────────────────
if (!getToken()) { window.location.href = '/login/'; }


// ─── State ─────────────────────────────────────────────────────────────────────
let allVendors = [];
let allPOs = [];

// ─── Tab Navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// ─── Fetch Vendors ─────────────────────────────────────────────────────────────
async function loadVendors() {
    try {
        const res = await fetch(`${API}/inventory/vendors/`, { headers: authHeaders() });
        allVendors = await res.json();
        renderVendors(allVendors);
        document.getElementById('totalVendors').textContent = allVendors.length;
        // Populate PO select
        const sel = document.getElementById('poVendor');
        sel.innerHTML = '<option value="">Select a Vendor...</option>';
        allVendors.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id; opt.textContent = v.name;
            sel.appendChild(opt);
        });
    } catch(e) { console.error('Vendor load failed:', e); }
}

function renderVendors(vendors) {
    const list = document.getElementById('vendorList');
    if (!vendors.length) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;">No vendors added yet.</p>'; return; }
    list.innerHTML = vendors.map(v => `
        <div class="vendor-card">
            <div class="vendor-meta">
                <h4>🏭 ${v.name}</h4>
                <p>${v.contact_email || 'No email'} &nbsp;·&nbsp; ${v.contact_phone || 'No phone'}</p>
                ${v.address ? `<p>${v.address}</p>` : ''}
            </div>
            <div class="vendor-actions">
                <button class="action-btn" onclick="newPOForVendor('${v.id}', '${v.name}')">+ PO</button>
            </div>
        </div>
    `).join('');
}

function newPOForVendor(vendorId, vendorName) {
    document.getElementById('poVendor').value = vendorId;
    openModal('poModal');
}

// ─── Fetch Purchase Orders ──────────────────────────────────────────────────────
async function loadPurchaseOrders() {
    try {
        const res = await fetch(`${API}/inventory/purchase-orders/`, { headers: authHeaders() });
        allPOs = await res.json();
        renderPOs(allPOs);
        document.getElementById('openOrders').textContent = allPOs.filter(p => p.status === 'ORDERED').length;
        document.getElementById('receivedOrders').textContent = allPOs.filter(p => p.status === 'RECEIVED').length;
    } catch(e) { console.error('PO load failed:', e); }
}

const statusBadgeMap = {
    DRAFT: 'badge-draft', ORDERED: 'badge-ordered',
    RECEIVED: 'badge-received', CANCELLED: 'badge-cancelled'
};
const statusLabelMap = {
    DRAFT: 'Draft', ORDERED: 'Ordered', RECEIVED: 'Received', CANCELLED: 'Cancelled'
};

function renderPOs(pos) {
    const tbody = document.getElementById('poTableBody');
    if (!pos.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:25px; color:var(--text-muted);">No purchase orders yet.</td></tr>'; return; }
    tbody.innerHTML = pos.map(po => `
        <tr>
            <td style="font-weight:700; font-family:monospace;">#${po.id.slice(0,8)}</td>
            <td>${po.vendor_name || '—'}</td>
            <td style="font-weight:700;">PKR ${Number(po.total_amount).toLocaleString()}</td>
            <td><span class="status-badge ${statusBadgeMap[po.status] || ''}">${statusLabelMap[po.status] || po.status}</span></td>
            <td>${new Date(po.created_at).toLocaleDateString()}</td>
            <td>
                ${po.status === 'DRAFT' ? `<button class="action-btn" onclick="updatePOStatus('${po.id}', 'ORDERED')">Mark Ordered</button>` : ''}
                ${po.status === 'ORDERED' ? `<button class="action-btn" onclick="updatePOStatus('${po.id}', 'RECEIVED')">Mark Received</button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function updatePOStatus(poId, newStatus) {
    if (!confirm(`Mark this purchase order as ${newStatus}? ${newStatus === 'RECEIVED' ? 'This will automatically add stock to your inventory.' : ''}`)) return;
    try {
        await fetch(`${API}/inventory/purchase-orders/${poId}/`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: newStatus })
        });
        loadPurchaseOrders();
    } catch(e) { alert('Update failed.'); }
}

// ─── Modal Helpers ─────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.getElementById('openVendorModalBtn').addEventListener('click', () => openModal('vendorModal'));
document.getElementById('openPOModalBtn').addEventListener('click', () => openModal('poModal'));
document.getElementById('closeVendorModal').addEventListener('click', () => closeModal('vendorModal'));
document.getElementById('closePOModal').addEventListener('click', () => closeModal('poModal'));

// ─── Add Vendor ────────────────────────────────────────────────────────────────
document.getElementById('vendorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('vendorError');
    errEl.style.display = 'none';
    const payload = {
        name: document.getElementById('vendorName').value.trim(),
        contact_email: document.getElementById('vendorEmail').value.trim(),
        contact_phone: document.getElementById('vendorPhone').value.trim(),
        address: document.getElementById('vendorAddress').value.trim(),
    };
    try {
        const res = await fetch(`${API}/inventory/vendors/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display = 'block'; return; }
        e.target.reset(); closeModal('vendorModal'); loadVendors();
    } catch(err) { errEl.textContent = 'Network error. Please try again.'; errEl.style.display = 'block'; }
});

// ─── Create Purchase Order ─────────────────────────────────────────────────────
document.getElementById('poForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('poError');
    errEl.style.display = 'none';
    const payload = {
        vendor: document.getElementById('poVendor').value,
        total_amount: document.getElementById('poTotal').value,
        notes: document.getElementById('poNotes').value.trim(),
    };
    try {
        const res = await fetch(`${API}/inventory/purchase-orders/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display = 'block'; return; }
        e.target.reset(); closeModal('poModal'); loadPurchaseOrders();
    } catch(err) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
});

// ─── Init ──────────────────────────────────────────────────────────────────────
loadVendors();
loadPurchaseOrders();
