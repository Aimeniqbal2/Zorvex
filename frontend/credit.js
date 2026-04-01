const API = 'http://127.0.0.1:8000/api';

function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }; }

if (!getToken()) { window.location.href = 'index.html'; }


// ─── State ─────────────────────────────────────────────────────────────────────
let allCustomers = [];
let selectedCustomerId = null;

// ─── Load Customers ────────────────────────────────────────────────────────────
async function loadCustomers() {
    try {
        const res = await fetch(`${API}/sales/customers/`, { headers: authHeaders() });
        allCustomers = await res.json();
        renderCustomers(allCustomers);
        updateKPIs(allCustomers);
        populatePaymentSelect(allCustomers);
    } catch(e) { console.error('Customer load failed:', e); }
}

function updateKPIs(customers) {
    const total = customers.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
    const withBalance = customers.filter(c => parseFloat(c.balance || 0) > 0).length;
    const cleared = customers.filter(c => parseFloat(c.balance || 0) <= 0).length;
    document.getElementById('totalOutstanding').textContent = `PKR ${total.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    document.getElementById('clientsWithBalance').textContent = withBalance;
    document.getElementById('clearedAccounts').textContent = cleared;
}

function populatePaymentSelect(customers) {
    const sel = document.getElementById('paymentCustomer');
    sel.innerHTML = '<option value="">Select Customer...</option>';
    customers.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = `${c.name} – Balance: PKR ${parseFloat(c.balance || 0).toLocaleString()}`;
        sel.appendChild(o);
    });
}

function renderCustomers(customers) {
    const list = document.getElementById('customerList');
    if (!customers.length) { list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No customers found.</p>'; return; }
    list.innerHTML = customers.map(c => {
        const bal = parseFloat(c.balance || 0);
        const balColor = bal > 0 ? '#dc2626' : '#16a34a';
        return `
        <div class="customer-card ${selectedCustomerId === c.id ? 'selected' : ''}" onclick="selectCustomer('${c.id}')">
            <div>
                <p class="customer-name">${c.name}</p>
                <p class="customer-phone">${c.phone || 'No phone'}</p>
            </div>
            <p class="balance-tag" style="color:${balColor};">PKR ${bal.toLocaleString(undefined, {minimumFractionDigits:0})}</p>
        </div>
        `;
    }).join('');
}

// ─── Customer Search ────────────────────────────────────────────────────────────
document.getElementById('customerSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = allCustomers.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
    renderCustomers(filtered);
});

// ─── Select Customer & Load Ledger ─────────────────────────────────────────────
async function selectCustomer(customerId) {
    selectedCustomerId = customerId;
    renderCustomers(allCustomers); // Re-render to highlight selected
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) return;
    document.getElementById('ledgerCustomerName').textContent = customer.name;
    document.getElementById('ledgerCustomerPhone').textContent = customer.phone || 'No phone';
    const bal = parseFloat(customer.balance || 0);
    const balEl = document.getElementById('ledgerBalance');
    balEl.textContent = `PKR ${bal.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    balEl.style.color = bal > 0 ? '#dc2626' : '#16a34a';
    document.getElementById('ledgerPlaceholder').style.display = 'none';
    document.getElementById('ledgerContent').style.display = 'block';
    // Load ledger entries
    try {
        const res = await fetch(`${API}/sales/ledger/?customer=${customerId}`, { headers: authHeaders() });
        const entries = await res.json();
        renderLedgerEntries(entries);
    } catch(e) { console.error('Ledger load failed:', e); }
}

function renderLedgerEntries(entries) {
    const container = document.getElementById('ledgerEntries');
    if (!entries.length) { container.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No transactions yet.</p>'; return; }
    container.innerHTML = entries.map(entry => `
        <div class="ledger-entry">
            <div class="entry-info">
                <span class="entry-type ${entry.transaction_type === 'DEBIT' ? 'entry-debit' : 'entry-credit'}">
                    ${entry.transaction_type === 'DEBIT' ? '↑ Purchase (Debit)' : '↓ Payment (Credit)'}
                </span>
                <span class="entry-notes">${entry.notes || '—'} · ${new Date(entry.created_at).toLocaleDateString()}</span>
            </div>
            <span class="entry-amount" style="color:${entry.transaction_type === 'DEBIT' ? '#dc2626' : '#16a34a'}">
                ${entry.transaction_type === 'DEBIT' ? '+' : '-'} PKR ${parseFloat(entry.amount).toLocaleString(undefined, {minimumFractionDigits:2})}
            </span>
        </div>
    `).join('');
}

// ─── Modal Helpers ─────────────────────────────────────────────────────────────
document.getElementById('openPaymentModalBtn').addEventListener('click', () => {
    if (selectedCustomerId) document.getElementById('paymentCustomer').value = selectedCustomerId;
    document.getElementById('paymentModal').classList.add('active');
});
document.getElementById('closePaymentModal').addEventListener('click', () => {
    document.getElementById('paymentModal').classList.remove('active');
});

// ─── Record Payment ────────────────────────────────────────────────────────────
document.getElementById('paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('paymentError');
    errEl.style.display = 'none';
    const custId = document.getElementById('paymentCustomer').value;
    const amount = document.getElementById('paymentAmount').value;
    const notes = document.getElementById('paymentNotes').value.trim();
    if (!custId || !amount) { errEl.textContent = 'Customer and amount are required.'; errEl.style.display = 'block'; return; }
    try {
        const res = await fetch(`${API}/sales/ledger/`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ customer: custId, transaction_type: 'CREDIT', amount, notes })
        });
        if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display = 'block'; return; }
        e.target.reset();
        document.getElementById('paymentModal').classList.remove('active');
        await loadCustomers(); // Refresh balances
        if (selectedCustomerId) selectCustomer(selectedCustomerId); // Refresh ledger view
    } catch(err) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
});

// ─── Init ──────────────────────────────────────────────────────────────────────
loadCustomers();
