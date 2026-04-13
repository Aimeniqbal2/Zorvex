/**
 * credit.js  —  Customer Credit Ledger
 * FIXED:
 *  - Calls /recalculate_balances on first load to fix stale stored data
 *  - Reads dynamically computed totals from API (SerializerMethodField)
 *  - KPI cards now update correctly after every action
 *  - Full CRUD: Add, Edit, Delete customer
 *  - Record Payment modal
 *  - Ledger entries with clean formatting
 */
const API   = '/api';
const TOKEN = localStorage.getItem('access_token');
if (!TOKEN) window.location.href = '/login/';

function authHeaders(isJson = true) {
    const h = { 'Authorization': `Bearer ${TOKEN}` };
    if (isJson) h['Content-Type'] = 'application/json';
    return h;
}

// ── State ──────────────────────────────────────────────────────────────────────
let allCustomers       = [];
let selectedCustomerId = null;
let isAdmin            = false;
let initialized        = false;

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
    // Detect admin role from JWT payload
    try {
        const payload = JSON.parse(atob(TOKEN.split('.')[1]));
        isAdmin = ['admin', 'super_admin', 'manager'].includes(payload.role);
    } catch {}

    // On first load, fix stale stored data in background (fire and forget)
    if (!initialized) {
        initialized = true;
        fetch(`${API}/sales/customers/recalculate_balances/`, {
            method: 'POST', headers: authHeaders()
        }).then(() => loadCustomers()).catch(() => loadCustomers());
        return;
    }
    await loadCustomers();
}

// ── Load Customers ─────────────────────────────────────────────────────────────
async function loadCustomers() {
    try {
        const res  = await fetch(`${API}/sales/customers/`, { headers: authHeaders() });
        const data = await res.json();
        allCustomers = data.results || data;
        renderCustomers(allCustomers);
        updateKPIs(allCustomers);
        populatePaymentSelect(allCustomers);
    } catch (e) { console.error('Customer load failed:', e); }
}

// ── KPI Cards ──────────────────────────────────────────────────────────────────
function updateKPIs(customers) {
    const totalOut  = customers.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
    const totalCred = customers.reduce((s, c) => s + parseFloat(c.total_credit || 0), 0);
    const totalPaid = customers.reduce((s, c) => s + parseFloat(c.total_paid || 0), 0);
    const withBal   = customers.filter(c => parseFloat(c.balance || 0) > 0).length;
    const cleared   = customers.filter(c => parseFloat(c.balance || 0) <= 0).length;

    setEl('totalOutstanding',  `PKR ${fmt(totalOut)}`);
    setEl('totalCreditIssued', `PKR ${fmt(totalCred)}`);
    setEl('totalAmountPaid',   `PKR ${fmt(totalPaid)}`);
    setEl('clientsWithBalance', withBal);
    setEl('clearedAccounts',   cleared);
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function fmt(n) {
    return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Payment select ─────────────────────────────────────────────────────────────
function populatePaymentSelect(customers) {
    const sel = document.getElementById('paymentCustomer');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select Customer...</option>';
    customers.filter(c => parseFloat(c.balance || 0) > 0).forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.name} — Owes PKR ${fmt(c.balance)}`;
        sel.appendChild(o);
    });
}

// ── Render Customer List ───────────────────────────────────────────────────────
function renderCustomers(customers) {
    const list = document.getElementById('customerList');
    if (!customers.length) {
        list.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px;">No customers found.</p>`;
        return;
    }
    list.innerHTML = customers.map(c => {
        const bal   = parseFloat(c.balance || 0);
        const cred  = parseFloat(c.total_credit || 0);
        const paid  = parseFloat(c.total_paid || 0);
        const color = bal > 0 ? 'var(--danger)' : 'var(--success)';
        const isSel = selectedCustomerId === c.id;
        return `
        <div class="customer-card ${isSel ? 'selected' : ''}" onclick="selectCustomer('${c.id}')">
            <div style="flex:1;min-width:0;">
                <p class="customer-name">${c.name}</p>
                <p class="customer-phone">${c.phone || 'No phone'}</p>
                <div style="display:flex;gap:10px;margin-top:6px;font-size:11px;color:var(--text-muted);flex-wrap:wrap;">
                    <span>📤 Credit: <strong style="color:var(--danger);">PKR ${fmt(cred)}</strong></span>
                    <span>📥 Paid: <strong style="color:var(--success);">PKR ${fmt(paid)}</strong></span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                <p style="font-size:16px;font-weight:800;color:${color};white-space:nowrap;">
                    PKR ${fmt(bal)}
                </p>
                <div style="display:flex;gap:4px;">
                    <button class="action-btn" style="font-size:11px;padding:5px 10px;"
                        onclick="event.stopPropagation();openEditCustomer('${c.id}')">✏️ Edit</button>
                    <button class="action-btn" style="font-size:11px;padding:5px 10px;color:var(--danger);border-color:var(--danger);"
                        onclick="event.stopPropagation();deleteCustomer('${c.id}','${c.name.replace(/'/g,'\\\'') }')">🗑️</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Search ─────────────────────────────────────────────────────────────────────
document.getElementById('customerSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderCustomers(allCustomers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    ));
});

// ── Select Customer & Load Ledger ──────────────────────────────────────────────
async function selectCustomer(customerId) {
    selectedCustomerId = customerId;
    renderCustomers(allCustomers);
    const c = allCustomers.find(x => x.id === customerId);
    if (!c) return;

    const bal      = parseFloat(c.balance || 0);
    const credited = parseFloat(c.total_credit || 0);
    const paid     = parseFloat(c.total_paid || 0);

    setEl('ledgerCustomerName',  c.name);
    setEl('ledgerCustomerPhone', c.phone || 'No phone');
    const balEl = document.getElementById('ledgerBalance');
    if (balEl) {
        balEl.textContent = `PKR ${fmt(bal)}`;
        balEl.style.color = bal > 0 ? 'var(--danger)' : 'var(--success)';
    }

    const aggEl = document.getElementById('ledgerAggregates');
    if (aggEl) {
        aggEl.innerHTML = `
            <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;">
                <span>📤 Total Credit Issued: <strong style="color:var(--danger);">PKR ${fmt(credited)}</strong></span>
                <span>📥 Total Paid Back: <strong style="color:var(--success);">PKR ${fmt(paid)}</strong></span>
                <span>📊 Outstanding: <strong style="color:${bal>0?'var(--danger)':'var(--success)'};">PKR ${fmt(bal)}</strong></span>
            </div>`;
    }

    document.getElementById('ledgerPlaceholder').style.display = 'none';
    document.getElementById('ledgerContent').style.display     = 'block';

    try {
        const res = await fetch(`${API}/sales/ledger/?customer=${customerId}`, { headers: authHeaders() });
        const data = await res.json();
        renderLedgerEntries(data.results || data);
    } catch (e) { console.error('Ledger load failed:', e); }
}

// ── Ledger Entries ─────────────────────────────────────────────────────────────
function renderLedgerEntries(entries) {
    const container = document.getElementById('ledgerEntries');
    if (!entries.length) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:10px 0;">No transactions yet.</p>`;
        return;
    }
    container.innerHTML = entries.map(e => {
        const isDebit = e.transaction_type === 'DEBIT';
        const sign    = isDebit ? '+' : '-';
        const color   = isDebit ? 'var(--danger)' : 'var(--success)';
        const bgColor = isDebit ? 'var(--danger-light)' : 'var(--success-light)';
        const label   = isDebit ? '↑ CREDIT SALE' : '↓ PAYMENT RECEIVED';
        const date    = new Date(e.created_at).toLocaleDateString();
        return `
        <div class="ledger-entry" style="display:flex;justify-content:space-between;align-items:center;
            padding:14px 16px;background:var(--input-bg);border-radius:10px;margin-bottom:8px;border:1px solid var(--border-color);">
            <div class="entry-info">
                <span style="font-size:12px;font-weight:800;padding:3px 8px;border-radius:6px;
                    background:${bgColor};color:${color};">${label}</span>
                <p style="font-size:12px;color:var(--text-muted);margin-top:5px;word-break:break-word;">
                    ${e.notes || '—'} &nbsp;·&nbsp; ${date}${e.sale_ref ? ` &nbsp;·&nbsp; Ref: ${e.sale_ref}` : ''}
                </p>
            </div>
            <span style="font-weight:800;font-size:15px;color:${color};white-space:nowrap;margin-left:16px;">
                ${sign} PKR ${fmt(e.amount)}
            </span>
        </div>`;
    }).join('');
}

// ── Add Customer ───────────────────────────────────────────────────────────────
const addModal = document.getElementById('addCustomerModal');
document.getElementById('openAddCustomerBtn')?.addEventListener('click', () => {
    document.getElementById('addCustomerForm')?.reset();
    document.getElementById('addCustomerError').style.display = 'none';
    addModal?.classList.add('active');
});
document.getElementById('closeAddCustomerModal')?.addEventListener('click', () => addModal?.classList.remove('active'));

document.getElementById('addCustomerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = e.target.querySelector('button[type="submit"]');
    const errEl = document.getElementById('addCustomerError');
    errEl.style.display = 'none';
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/sales/customers/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                name:  document.getElementById('addCustName').value.trim(),
                phone: document.getElementById('addCustPhone').value.trim(),
                email: document.getElementById('addCustEmail').value.trim(),
            })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
        addModal.classList.remove('active');
        e.target.reset();
        await loadCustomers();
    } catch (err) { errEl.textContent = 'Network error.'; errEl.style.display='block';
    } finally { btn.textContent = 'Add Customer'; btn.disabled = false; }
});

// ── Edit Customer ──────────────────────────────────────────────────────────────
const editModal = document.getElementById('editCustomerModal');

function openEditCustomer(customerId) {
    const c = allCustomers.find(x => x.id === customerId);
    if (!c) return;
    document.getElementById('editCustId').value    = c.id;
    document.getElementById('editCustName').value  = c.name;
    document.getElementById('editCustPhone').value = c.phone || '';
    document.getElementById('editCustEmail').value = c.email || '';
    document.getElementById('editCustomerError').style.display = 'none';
    editModal?.classList.add('active');
}
document.getElementById('closeEditCustomerModal')?.addEventListener('click', () => editModal?.classList.remove('active'));

document.getElementById('editCustomerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = e.target.querySelector('button[type="submit"]');
    const errEl  = document.getElementById('editCustomerError');
    errEl.style.display = 'none';
    const custId = document.getElementById('editCustId').value;
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/sales/customers/${custId}/`, {
            method: 'PATCH', headers: authHeaders(),
            body: JSON.stringify({
                name:  document.getElementById('editCustName').value.trim(),
                phone: document.getElementById('editCustPhone').value.trim(),
                email: document.getElementById('editCustEmail').value.trim(),
            })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
        editModal.classList.remove('active');
        await loadCustomers();
        if (selectedCustomerId === custId) selectCustomer(custId);
    } catch (err) { errEl.textContent = 'Network error.'; errEl.style.display='block';
    } finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
});

// ── Delete Customer ────────────────────────────────────────────────────────────
async function deleteCustomer(customerId, name) {
    if (!confirm(`Soft-delete customer "${name}"?\n\nTransactions will be preserved for accounting.`)) return;
    try {
        await fetch(`${API}/sales/customers/${customerId}/`, { method: 'DELETE', headers: authHeaders() });
        if (selectedCustomerId === customerId) {
            selectedCustomerId = null;
            document.getElementById('ledgerContent').style.display    = 'none';
            document.getElementById('ledgerPlaceholder').style.display = 'block';
        }
        await loadCustomers();
    } catch (e) { alert('Could not delete customer: ' + e.message); }
}

// ── Payment Modal ──────────────────────────────────────────────────────────────
document.getElementById('openPaymentModalBtn')?.addEventListener('click', () => {
    if (selectedCustomerId) document.getElementById('paymentCustomer').value = selectedCustomerId;
    document.getElementById('paymentError').style.display = 'none';
    document.getElementById('paymentModal').classList.add('active');
});
document.getElementById('closePaymentModal')?.addEventListener('click', () => {
    document.getElementById('paymentModal').classList.remove('active');
});

document.getElementById('paymentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl  = document.getElementById('paymentError');
    errEl.style.display = 'none';
    const custId = document.getElementById('paymentCustomer').value;
    const amount = document.getElementById('paymentAmount').value;
    const notes  = document.getElementById('paymentNotes').value.trim();

    if (!custId || !amount) {
        errEl.textContent = 'Customer and amount are required.';
        errEl.style.display = 'block';
        return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = 'Recording...'; btn.disabled = true;
    try {
        const res = await fetch(`${API}/sales/customers/${custId}/receive_payment/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ amount, notes })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = d.error || JSON.stringify(d); errEl.style.display='block'; return; }
        e.target.reset();
        document.getElementById('paymentModal').classList.remove('active');
        await loadCustomers();
        if (selectedCustomerId === custId) await selectCustomer(custId);
    } catch (err) { errEl.textContent = 'Network error: ' + err.message; errEl.style.display='block';
    } finally { btn.textContent = 'Record Payment'; btn.disabled = false; }
});

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
