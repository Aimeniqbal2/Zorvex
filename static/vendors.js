/**
 * vendors.js  —  Vendors & Procurement
 * FIXED:
 *  - Vendor cards show balance_due, total_purchases, total_paid (dynamically from API)
 *  - Clicking a vendor opens ledger panel with full transaction history
 *  - Pay Vendor button creates CREDIT ledger entry and refreshes data
 *  - Edit & Delete vendor fully working
 *  - recalculate_balances called on init to fix stale vendor data
 */
const API   = '/api';
const TOKEN = localStorage.getItem('access_token');
if (!TOKEN) window.location.href = '/login/';

function authHeaders(json = true) {
    const h = { 'Authorization': `Bearer ${TOKEN}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

function fmt(n) {
    return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── State ──────────────────────────────────────────────────────────────────────
let allVendors  = [];
let selectedVendorId = null;

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
    // Fix stale stored vendor balances in background
    fetch(`${API}/inventory/vendorledger/recalculate_balances/`, {
        method: 'POST', headers: authHeaders()
    }).catch(() => {});
    await Promise.all([loadVendors(), loadPurchaseOrders()]);
}

// ── Load Vendors ───────────────────────────────────────────────────────────────
async function loadVendors() {
    try {
        const res  = await fetch(`${API}/inventory/vendors/`, { headers: authHeaders() });
        const data = await res.json();
        allVendors = data.results || data;
        renderVendors(allVendors);
        updateVendorKPIs(allVendors);

        // Populate PO select
        const sel = document.getElementById('poVendor');
        if (sel) {
            sel.innerHTML = '<option value="">Select a Vendor...</option>';
            allVendors.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.name;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Vendor load failed:', e); }
}

function updateVendorKPIs(vendors) {
    const totalVend = vendors.length;
    const totalDue  = vendors.reduce((s, v) => s + parseFloat(v.balance_due || 0), 0);

    const el = document.getElementById('totalVendors');
    if (el) el.textContent = totalVend;

    // Update payable KPI if it exists
    const dueEl = document.getElementById('totalPayable');
    if (dueEl) dueEl.textContent = `PKR ${fmt(totalDue)}`;
}

function renderVendors(vendors) {
    const list = document.getElementById('vendorList');
    if (!vendors.length) {
        list.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px;">No vendors added yet.</p>`;
        return;
    }
    list.innerHTML = vendors.map(v => {
        const due   = parseFloat(v.balance_due || 0);
        const purch = parseFloat(v.total_purchases || 0);
        const paid  = parseFloat(v.total_paid || 0);
        const dueColor = due > 0 ? 'var(--danger)' : 'var(--success)';
        const isSel = selectedVendorId === v.id;
        return `
        <div class="vendor-card ${isSel ? 'selected' : ''}" onclick="selectVendor('${v.id}')"
            style="background:var(--card-bg);border:1px solid ${isSel ? 'var(--primary)' : 'var(--border-color)'};
            border-radius:16px;padding:20px;margin-bottom:12px;cursor:pointer;transition:all 0.2s;
            ${isSel ? 'background:var(--primary-light);' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
                <div style="flex:1;min-width:0;">
                    <h4 style="font-size:16px;font-weight:800;color:var(--text-main);margin-bottom:4px;">
                        🏭 ${v.name}
                    </h4>
                    <p style="font-size:13px;color:var(--text-muted);">
                        ${v.contact_email || 'No email'} &nbsp;·&nbsp; ${v.contact_phone || 'No phone'}
                    </p>
                    ${v.address ? `<p style="font-size:12px;color:var(--text-muted);margin-top:3px;">${v.address}</p>` : ''}
                    <div style="display:flex;gap:16px;margin-top:10px;font-size:12px;flex-wrap:wrap;">
                        <span>📦 Purchased: <strong style="color:var(--text-main);">PKR ${fmt(purch)}</strong></span>
                        <span>✅ Paid: <strong style="color:var(--success);">PKR ${fmt(paid)}</strong></span>
                        <span>⚠️ Due: <strong style="color:${dueColor};">PKR ${fmt(due)}</strong></span>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    <span style="font-size:16px;font-weight:900;color:${dueColor};">PKR ${fmt(due)}</span>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">
                        <button class="action-btn" onclick="event.stopPropagation();newPOForVendor('${v.id}','${v.name.replace(/'/g,"\\'")}');"
                            style="font-size:11px;padding:5px 9px;">+ PO</button>
                        <button class="action-btn" onclick="event.stopPropagation();openPayVendorModal('${v.id}','${v.name.replace(/'/g,"\\'")}',${due});"
                            style="font-size:11px;padding:5px 9px;background:var(--success);color:#fff;border-color:var(--success);">💰 Pay</button>
                        <button class="action-btn" onclick="event.stopPropagation();openEditVendor('${v.id}');"
                            style="font-size:11px;padding:5px 9px;">✏️ Edit</button>
                        <button class="action-btn" onclick="event.stopPropagation();deleteVendor('${v.id}','${v.name.replace(/'/g,"\\'")}');"
                            style="font-size:11px;padding:5px 9px;color:var(--danger);border-color:var(--danger);">🗑️</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Select Vendor → Show Ledger ────────────────────────────────────────────────
async function selectVendor(vendorId) {
    selectedVendorId = vendorId;
    renderVendors(allVendors);
    const v = allVendors.find(x => x.id === vendorId);
    if (!v) return;

    const due   = parseFloat(v.balance_due || 0);
    const purch = parseFloat(v.total_purchases || 0);
    const paid  = parseFloat(v.total_paid || 0);

    const lp = document.getElementById('ledgerPanel');
    if (!lp) return;
    lp.style.display = 'block';

    document.getElementById('ledgerVendorName').textContent  = v.name;
    document.getElementById('ledgerVendorPhone').textContent = v.contact_phone || '';
    const balEl = document.getElementById('ledgerVendorBalance');
    if (balEl) { balEl.textContent = `PKR ${fmt(due)}`; balEl.style.color = due > 0 ? 'var(--danger)' : 'var(--success)'; }

    const aggEl = document.getElementById('vendorLedgerAggregates');
    if (aggEl) aggEl.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;">
            <span>📦 Total Purchased: <strong style="color:var(--text-main);">PKR ${fmt(purch)}</strong></span>
            <span>✅ Total Paid: <strong style="color:var(--success);">PKR ${fmt(paid)}</strong></span>
            <span>⚠️ Balance Due: <strong style="color:${due > 0 ? 'var(--danger)' : 'var(--success)'};">PKR ${fmt(due)}</strong></span>
        </div>`;

    try {
        const res = await fetch(`${API}/inventory/vendorledger/?vendor=${vendorId}`, { headers: authHeaders() });
        const data = await res.json();
        renderVendorLedger(data.results || data);
    } catch (e) { console.error('Vendor ledger load failed:', e); }
}

function renderVendorLedger(entries) {
    const container = document.getElementById('vendorLedgerEntries');
    if (!container) return;
    if (!entries.length) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:10px 0;">No transactions yet for this vendor.</p>`;
        return;
    }
    container.innerHTML = entries.map(e => {
        const isDebit = e.transaction_type === 'DEBIT';
        const sign    = isDebit ? '+' : '-';
        const color   = isDebit ? 'var(--danger)' : 'var(--success)';
        const bg      = isDebit ? 'var(--danger-light)' : 'var(--success-light)';
        const label   = isDebit ? '↑ PURCHASE' : '↓ PAYMENT';
        const date    = new Date(e.created_at).toLocaleDateString();
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:14px 16px;background:var(--input-bg);border-radius:10px;margin-bottom:8px;border:1px solid var(--border-color);">
            <div>
                <span style="font-size:12px;font-weight:800;padding:3px 8px;border-radius:6px;background:${bg};color:${color};">
                    ${label}
                </span>
                <p style="font-size:12px;color:var(--text-muted);margin-top:5px;word-break:break-word;">
                    ${e.notes || '—'} &nbsp;·&nbsp; ${date}${e.reference ? ` &nbsp;·&nbsp; ${e.reference}` : ''}
                </p>
            </div>
            <span style="font-weight:800;font-size:15px;color:${color};white-space:nowrap;margin-left:16px;">
                ${sign} PKR ${fmt(e.amount)}
            </span>
        </div>`;
    }).join('');
}

// ── Pay Vendor Modal ───────────────────────────────────────────────────────────
function openPayVendorModal(vendorId, vendorName, currentDue) {
    selectedVendorId = vendorId;
    const modal = document.getElementById('payVendorModal');
    if (!modal) return;
    document.getElementById('payVendorName').textContent    = vendorName;
    document.getElementById('payVendorBalance').textContent = `PKR ${fmt(currentDue)}`;
    document.getElementById('payVendorVendorId').value      = vendorId;
    document.getElementById('payVendorAmount').value        = '';
    document.getElementById('payVendorError').style.display = 'none';
    modal.classList.add('active');
}
document.getElementById('closePayVendorModal')?.addEventListener('click', () =>
    document.getElementById('payVendorModal')?.classList.remove('active')
);

document.getElementById('payVendorForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl    = document.getElementById('payVendorError');
    errEl.style.display = 'none';
    const vendorId = document.getElementById('payVendorVendorId').value;
    const amount   = document.getElementById('payVendorAmount').value;
    const notes    = document.getElementById('payVendorNotes')?.value?.trim() || '';
    const btn      = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Processing...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/inventory/vendorledger/pay_vendor/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ vendor_id: vendorId, amount, notes })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = d.error || JSON.stringify(d); errEl.style.display='block'; return; }
        document.getElementById('payVendorModal').classList.remove('active');
        e.target.reset();
        await loadVendors();
        if (selectedVendorId) selectVendor(selectedVendorId);
    } catch (err) { errEl.textContent = 'Network error: ' + err.message; errEl.style.display='block';
    } finally { btn.textContent = 'Pay Vendor'; btn.disabled = false; }
});

// ── PO Helpers ─────────────────────────────────────────────────────────────────
function newPOForVendor(vendorId, vendorName) {
    const vendorSelect = document.getElementById('poVendor');
    if (vendorSelect) vendorSelect.value = vendorId;
    // Switch to PO tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="po-panel"]')?.classList.add('active');
    document.getElementById('po-panel')?.classList.add('active');
    document.getElementById('openPOModalBtn')?.click();
}

// ── Add Vendor ─────────────────────────────────────────────────────────────────
const vendorModal = document.getElementById('vendorModal');
document.getElementById('openVendorModalBtn')?.addEventListener('click', () => {
    document.getElementById('vendorForm')?.reset();
    document.getElementById('vendorError').style.display = 'none';
    vendorModal?.classList.add('active');
});
document.getElementById('closeVendorModal')?.addEventListener('click', () => vendorModal?.classList.remove('active'));

document.getElementById('vendorForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('vendorError');
    errEl.style.display = 'none';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent= 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/inventory/vendors/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                name:          document.getElementById('vendorName').value.trim(),
                contact_email: document.getElementById('vendorEmail').value.trim(),
                contact_phone: document.getElementById('vendorPhone').value.trim(),
                address:       document.getElementById('vendorAddress').value.trim(),
            })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
        vendorModal.classList.remove('active');
        e.target.reset();
        await loadVendors();
    } catch (err) { errEl.textContent = 'Network error.'; errEl.style.display='block';
    } finally { btn.textContent = 'Save Vendor'; btn.disabled = false; }
});

// ── Edit Vendor ────────────────────────────────────────────────────────────────
const editVendorModal = document.getElementById('editVendorModal');

function openEditVendor(vendorId) {
    const v = allVendors.find(x => x.id === vendorId);
    if (!v) return;
    document.getElementById('editVendorId').value      = v.id;
    document.getElementById('editVendorName').value    = v.name;
    document.getElementById('editVendorEmail').value   = v.contact_email || '';
    document.getElementById('editVendorPhone').value   = v.contact_phone || '';
    document.getElementById('editVendorAddress').value = v.address || '';
    document.getElementById('editVendorError').style.display = 'none';
    editVendorModal?.classList.add('active');
}
document.getElementById('closeEditVendorModal')?.addEventListener('click', () => editVendorModal?.classList.remove('active'));

document.getElementById('editVendorForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl    = document.getElementById('editVendorError');
    errEl.style.display = 'none';
    const vendorId = document.getElementById('editVendorId').value;
    const btn      = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/inventory/vendors/${vendorId}/`, {
            method: 'PATCH', headers: authHeaders(),
            body: JSON.stringify({
                name:          document.getElementById('editVendorName').value.trim(),
                contact_email: document.getElementById('editVendorEmail').value.trim(),
                contact_phone: document.getElementById('editVendorPhone').value.trim(),
                address:       document.getElementById('editVendorAddress').value.trim(),
            })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
        editVendorModal.classList.remove('active');
        e.target.reset();
        await loadVendors();
    } catch (err) { errEl.textContent = 'Network error.'; errEl.style.display='block';
    } finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
});

// ── Delete Vendor ──────────────────────────────────────────────────────────────
async function deleteVendor(vendorId, name) {
    if (!confirm(`Soft-delete vendor "${name}"?\n\nPurchase history will be preserved.`)) return;
    try {
        await fetch(`${API}/inventory/vendors/${vendorId}/`, { method: 'DELETE', headers: authHeaders() });
        if (selectedVendorId === vendorId) {
            selectedVendorId = null;
            const lp = document.getElementById('ledgerPanel');
            if (lp) lp.style.display = 'none';
        }
        await loadVendors();
    } catch (e) { alert('Delete failed: ' + e.message); }
}

// ── Purchase Orders ─────────────────────────────────────────────────────────────
async function loadPurchaseOrders() {
    try {
        const res  = await fetch(`${API}/inventory/purchaseorders/`, { headers: authHeaders() });
        const data = await res.json();
        const orders = data.results || data;
        renderPOTable(orders);
        const open = orders.filter(o => o.status === 'ORDERED').length;
        const recv = orders.filter(o => o.status === 'RECEIVED').length;
        const el1  = document.getElementById('openOrders');
        const el2  = document.getElementById('receivedOrders');
        if (el1) el1.textContent = open;
        if (el2) el2.textContent = recv;
    } catch (e) { console.error('PO load failed:', e); }
}

function renderPOTable(orders) {
    const tbody = document.getElementById('poTableBody');
    if (!tbody) return;
    if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">No purchase orders yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = orders.map(o => {
        const statusMap = { DRAFT:'badge-draft', ORDERED:'badge-ordered', RECEIVED:'badge-received', CANCELLED:'badge-cancelled' };
        const cls = statusMap[o.status] || 'badge-draft';
        return `
        <tr>
            <td style="font-weight:700;color:var(--primary);">PO-${String(o.id).substring(0,8).toUpperCase()}</td>
            <td style="font-weight:600;">${o.vendor_name || '—'}</td>
            <td style="font-weight:700;">PKR ${fmt(o.total_amount)}</td>
            <td><span class="status-badge ${cls}">${o.status}</span></td>
            <td style="color:var(--text-muted);">${new Date(o.created_at).toLocaleDateString()}</td>
            <td>
                ${o.status === 'ORDERED' ? `
                    <button onclick="receivePO('${o.id}')" style="background:var(--success);color:#fff;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">
                        ✅ Mark Received
                    </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function receivePO(orderId) {
    if (!confirm('Mark this Purchase Order as RECEIVED? This will auto-add stock.')) return;
    try {
        await fetch(`${API}/inventory/purchaseorders/${orderId}/`, {
            method: 'PATCH', headers: authHeaders(),
            body: JSON.stringify({ status: 'RECEIVED' })
        });
        await loadPurchaseOrders();
    } catch (e) { alert('Could not mark as received: ' + e.message); }
}

// ── Create PO Modal ────────────────────────────────────────────────────────────
const poModal = document.getElementById('poModal');
document.getElementById('openPOModalBtn')?.addEventListener('click', () => {
    document.getElementById('poForm')?.reset();
    document.getElementById('poError').style.display = 'none';
    poModal?.classList.add('active');
});
document.getElementById('closePOModal')?.addEventListener('click', () => poModal?.classList.remove('active'));

document.getElementById('poForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('poError');
    errEl.style.display = 'none';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/inventory/purchaseorders/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                vendor:       document.getElementById('poVendor').value,
                total_amount: document.getElementById('poTotal').value,
                status:       'ORDERED',
                notes:        document.getElementById('poNotes').value.trim(),
            })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
        poModal.classList.remove('active');
        e.target.reset();
        await loadPurchaseOrders();
    } catch (err) { errEl.textContent = 'Network error.'; errEl.style.display='block';
    } finally { btn.textContent = 'Create Order (Draft)'; btn.disabled = false; }
});

// ── Tab Switching ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab)?.classList.add('active');
    });
});

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
