const API = 'http://127.0.0.1:8000/api';

function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` }; }

if(!getToken()) { window.location.href = 'index.html'; }

let allUsers = [];

const tbody = document.getElementById('teamTableBody');
const kpiTotal = document.getElementById('kpiTotal');
const kpiAdmins = document.getElementById('kpiAdmins');
const kpiCashiers = document.getElementById('kpiCashiers');
const kpiTechs = document.getElementById('kpiTechs');

const modal = document.getElementById('teamModal');
const teamForm = document.getElementById('teamForm');
const editModal = document.getElementById('editTeamModal');
const editTeamForm = document.getElementById('editTeamForm');

// ─── Fetch ───────────────────────────────────────────────────────────────────
async function syncIdentities() {
    try {
        const resp = await fetch(`${API}/accounts/users/`, { headers: authHeaders() });
        if(!resp.ok) {
            if(resp.status === 401 || resp.status === 402) {
                alert('Session Token Voided.'); window.location.href='index.html'; 
            }
            throw new Error("Access API Refused");
        }
        
        const results = await resp.json();
        allUsers = results.results || results; 
        
        filterAndRender();
        calculateKPIs(allUsers);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger); font-weight:600;">Auth Endpoint Disconnected or Insufficient Clearance.</td></tr>`;
    }
}

// ─── Render & Search ────────────────────────────────────────────────────────
function filterAndRender() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
    
    tbody.innerHTML = '';
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-weight:500;">Zero External Identities Detected.</td></tr>`; return;
    }

    filtered.forEach((u, index) => {
        const tr = document.createElement('tr');
        tr.style.animationDelay = `${index * 0.08}s`;
        
        let badgeStyle = "background: #f4f7fe; color: var(--text-muted);";
        if(u.role === 'admin') badgeStyle = "background: #e6fcf5; color: var(--success);";
        if(u.role === 'technician') badgeStyle = "background: #ffe2e0; color: var(--danger);";
        if(u.role === 'cashier') badgeStyle = "background: #fff8eb; color: var(--warning);";
        if(u.role === 'manager') badgeStyle = "background: var(--primary-light); color: var(--primary);";
        
        const joinedDate = new Date(u.date_joined || new Date()).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' });

        tr.innerHTML = `
            <td style="color:var(--text-dark); font-weight:700; letter-spacing: -0.2px;">@${u.username}</td>
            <td><span class="badge" style="${badgeStyle} font-size:12px;">${u.role.toUpperCase()}</span></td>
            <td style="color:var(--text-muted); font-weight:600;">${joinedDate}</td>
            <td>
                <button onclick="openEditModal('${u.id}', '${u.username}', '${u.role}')" style="background:transparent; border:none; cursor:pointer; font-size:16px; margin-right:10px;" title="Edit">✏️</button>
                <button onclick="deleteUser('${u.id}', '${u.username}')" style="background:transparent; border:none; cursor:pointer; font-size:16px;" title="Flush">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('searchInput').addEventListener('input', filterAndRender);

function calculateKPIs(data) {
    let admins = 0, techs = 0, cashiers = 0;
    data.forEach(u => {
        if(u.role === 'admin') admins++;
        if(u.role === 'technician') techs++;
        if(u.role === 'cashier') cashiers++;
    });
    kpiTotal.innerText = data.length;
    kpiAdmins.innerText = admins;
    kpiTechs.innerText = techs;
    kpiCashiers.innerText = cashiers;
}

// ─── Modal Architecture ────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.getElementById(id).querySelectorAll('form').forEach(f => f.reset()); }

document.getElementById('openModalBtn').addEventListener('click', () => openModal('teamModal'));
document.getElementById('closeModalBtn').addEventListener('click', () => closeModal('teamModal'));
document.getElementById('closeEditModalBtn').addEventListener('click', () => closeModal('editTeamModal'));

window.openEditModal = function(id, username, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = username;
    document.getElementById('editRole').value = role;
    document.getElementById('editPassword').value = ''; // empty means ignore
    openModal('editTeamModal');
};

// Create
teamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errNode = document.getElementById('modalError'); errNode.style.display = 'none';
    const payload = {
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        role: document.getElementById('role').value
    };
    const btn = document.querySelector('#teamForm .primary-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Encrypting Target...';
    try {
        const r = await fetch(`${API}/accounts/users/`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
        if(!r.ok) { const d = await r.json(); throw new Error(Object.values(d).join(' | ')); }
        closeModal('teamModal'); syncIdentities();
    } catch (err) { errNode.textContent = err.message; errNode.style.display = 'block'; }
    finally { btn.innerHTML = orig; }
});

// Update
editTeamForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errNode = document.getElementById('editModalError'); errNode.style.display = 'none';
    const id = document.getElementById('editUserId').value;
    const payload = {
        username: document.getElementById('editUsername').value.trim(),
        role: document.getElementById('editRole').value
    };
    const pwd = document.getElementById('editPassword').value;
    if(pwd) payload.password = pwd;

    const btn = document.querySelector('#editTeamForm .primary-btn'); const orig = btn.innerHTML; btn.innerHTML = 'Overwriting Key...';
    try {
        const r = await fetch(`${API}/accounts/users/${id}/`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(payload) });
        if(!r.ok) { const d = await r.json(); throw new Error(Object.values(d).join(' | ')); }
        closeModal('editTeamModal'); syncIdentities();
    } catch (err) { errNode.textContent = err.message; errNode.style.display = 'block'; }
    finally { btn.innerHTML = orig; }
});

// Delete
window.deleteUser = async function(id, username) {
    if(!confirm(`Flush Identity Node: @${username}? This is irreversible.`)) return;
    try {
        const r = await fetch(`${API}/accounts/users/${id}/`, { method: 'DELETE', headers: authHeaders() });
        if(!r.ok) { const d = await r.json(); throw new Error(Object.values(d).join(' | ')); }
        syncIdentities();
    } catch(err) { alert(`Delete Failed: ${err.message}`); }
};

// ─── Init ────────────────────────────────────────────────────────────────
syncIdentities();
