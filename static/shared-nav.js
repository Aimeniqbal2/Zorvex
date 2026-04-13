
/**
 * shared-nav.js
 * Role-aware sidebar navigation for Zorvex ERP.
 * Parses the JWT to get the user's role and hides unauthorized menu items.
 * Include before </body> on every authenticated page.
 */
(function () {
    'use strict';

    const currentPage = window.location.pathname;
    const token = localStorage.getItem('access_token');

    // Auth guard — redirect to login if no token and not already on login page
    if (currentPage !== '/login/' && !token) {
        window.location.href = '/login/';
        return;
    }

    // Parse JWT payload to extract role
    function parseJwt(token) {
        try {
            const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(atob(base64));
        } catch (e) { return {}; }
    }

    const payload = token ? parseJwt(token) : {};
    const userRole = payload.role || 'staff';
    const username = payload.username || 'User';

    // Role hierarchy for UI gating
    const ROLE_LEVELS = {
        super_admin: 5, admin: 4, manager: 3, technician: 2, cashier: 1, staff: 0
    };

    function canAccess(minRole) {
        return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 0);
    }

    const navItems = [
        { href: '/', icon: '📊', label: 'Dashboard', minRole: 'staff' },
        { href: '/pos/', icon: '💳', label: 'POS Sales', minRole: 'cashier' },
        { href: '/service-logs/', icon: '🛠️', label: 'Service Orders', minRole: 'cashier' },
        { href: '/transactions/', icon: '🧾', label: 'Transactions', minRole: 'cashier' },
        { href: '/inventory/', icon: '📦', label: 'Inventory', minRole: 'manager' },
        { href: '/vendors/', icon: '🏭', label: 'Vendors', minRole: 'manager' },
        { href: '/credit/', icon: '📒', label: 'Credit Ledger', minRole: 'manager' },
        { href: '/team/', icon: '👥', label: 'Team', minRole: 'admin' },
    ];

    function buildNav() {
        return navItems
            .filter(item => canAccess(item.minRole))
            .map(item => {
                const isActive = currentPage === item.href;
                return `<a href="${item.href}" class="nav-item${isActive ? ' active' : ''}" title="${item.label}">
                    <span class="nav-icon">${item.icon}</span>
                    <span class="nav-label">${item.label}</span>
                </a>`;
            }).join('');
    }

    const sidebarHTML = `
    <aside class="sidebar" id="mainSidebar">
        <div class="brand">
            <img src="/static/assets/logo-full.png" alt="Zorvex ERP" style="width: 200px; margin-bottom: -20px; animation: gentleFloat 4s ease-in-out infinite; filter: drop-shadow(0 4px 10px rgba(67,24,255,0.2));">
        </div>

        <p class="section-label">Main Menu</p>
        <nav class="nav-menu" id="mainNav">
            ${buildNav()}
        </nav>

        <div style="margin-top:auto; padding-top:20px; border-top:1px solid var(--border-light); margin:auto 0 0 0;">
            <div style="padding:12px 16px; display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=4318ff&color=fff&rounded=true&size=32" 
                     alt="${username}" style="width:32px;height:32px;border-radius:50%;">
                <div class="user-details" style="display:flex; flex-direction:column;">
                    <span style="font-size:13px;font-weight:700;color:var(--text-main); line-height:1;">${username}</span>
                    <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px; margin-top:3px;">${userRole.replace('_', ' ')}</span>
                </div>
            </div>
            <nav class="nav-menu">
                <a href="#" class="nav-item" id="logoutBtn">
                    <span class="nav-icon">🔐</span>
                    <span class="nav-label">Logout</span>
                </a>
            </nav>
        </div>
    </aside>`;

    // Inject sidebar
    const existingSidebar = document.querySelector('aside.sidebar, aside#mainSidebar');
    if (existingSidebar) {
        existingSidebar.outerHTML = sidebarHTML;
    } else {
        document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    }

    // Attach logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/login/';
        });
    }

    // Toggle logic injection
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'icon-btn sidebar-toggle-btn';
        toggleBtn.innerHTML = '☰';
        toggleBtn.title = "Toggle Sidebar Visibility";
        toggleBtn.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('collapsed');
        });
        headerActions.insertBefore(toggleBtn, headerActions.firstChild);
    }

    // -------------------------------------------------------
    // Global Search with Debounce (300ms)
    // -------------------------------------------------------
    const searchBoxes = document.querySelectorAll('.search-box[data-global-search], .global-search-input');
    const API = '/api';

    searchBoxes.forEach(box => {
        let debounceTimer;
        let dropdown = document.createElement('div');
        dropdown.className = 'global-search-dropdown';
        dropdown.style.cssText = `
            position:absolute; border:1px solid var(--border-light); border-radius:14px;
            box-shadow:var(--shadow-md); min-width:380px; max-height:400px;
            overflow-y:auto; z-index:9999; padding:8px; display:none;
        `;
        box.parentNode.style.position = 'relative';
        box.parentNode.appendChild(dropdown);

        box.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const q = e.target.value.trim();
            if (q.length < 2) { dropdown.style.display = 'none'; return; }

            debounceTimer = setTimeout(async () => {
                try {
                    const resp = await fetch(`${API}/search/?q=${encodeURIComponent(q)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!resp.ok) return;
                    const data = await resp.json();
                    renderSearchResults(data, dropdown);
                } catch (err) { console.warn('Search error:', err); }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!box.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    });

    function renderSearchResults(data, container) {
        const { products = [], customers = [], orders = [], sales = [] } = data;
        const total = products.length + customers.length + orders.length + sales.length;

        if (total === 0) {
            container.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;font-weight:600;">No results found</p>';
            container.style.display = 'block';
            return;
        }

        let html = '';
        if (products.length) {
            html += `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;">Products</div>`;
            products.forEach(p => {
                html += `<div class="search-result-item" onclick="window.location.href='/inventory/'" style="padding:10px 12px;border-radius:10px;cursor:pointer;transition:0.15s;">
                    <div style="font-size:13px;font-weight:700;color:#0f172a;">${p.brand} ${p.model_name}</div>
                    <div style="font-size:11px;color:#64748b;">Stock: ${p.stock_quantity} &bull; PKR${parseFloat(p.sale_price).toLocaleString()}</div>
                </div>`;
            });
        }
        if (customers.length) {
            html += `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Customers</div>`;
            customers.forEach(c => {
                html += `<div class="search-result-item" onclick="window.location.href='/credit/'" style="padding:10px 12px;border-radius:10px;cursor:pointer;transition:0.15s;">
                    <div style="font-size:13px;font-weight:700;color:#0f172a;">${c.name}</div>
                    <div style="font-size:11px;color:#64748b;">${c.phone || ''} &bull; Balance: PKR${parseFloat(c.balance || 0).toLocaleString()}</div>
                </div>`;
            });
        }
        if (orders.length) {
            html += `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Service Orders</div>`;
            orders.forEach(o => {
                html += `<div class="search-result-item" onclick="window.location.href='/service-logs/'" style="padding:10px 12px;border-radius:10px;cursor:pointer;transition:0.15s;">
                    <div style="font-size:13px;font-weight:700;color:#0f172a;">${o.customer_name} — ${o.device_brand} ${o.device_model}</div>
                    <div style="font-size:11px;color:#64748b;">Status: <strong>${o.status}</strong> &bull; ${o.phone || ''}</div>
                </div>`;
            });
        }
        if (sales.length) {
            html += `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px;margin-top:4px;">Historical Sales</div>`;
            sales.forEach(s => {
                const badge = s.payment_method === 'cash' ? '<span style="color:#05cd99">CASH</span>' : '<span style="color:#ffb547">CREDIT</span>';
                html += `<div class="search-result-item" onclick="window.location.href='/'" style="padding:10px 12px;border-radius:10px;cursor:pointer;transition:0.15s;">
                    <div style="font-size:13px;font-weight:800;color:var(--primary);">#SAL-${s.id.substring(0, 8).toUpperCase()}</div>
                    <div style="font-size:11px;color:#64748b;">${badge} &bull; PKR${parseFloat(s.total_amount).toLocaleString()}</div>
                </div>`;
            });
        }

        container.innerHTML = html;
        container.style.display = 'block';

        // Hover effects handle via dynamic class if needed, or rely on dashboard.css
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.className = 'search-result-item'; // Allow CSS to handle it
        });
    }

    // -------------------------------------------------------
    // UI Profile & Notification Dropdowns
    // -------------------------------------------------------
    const userProfileNodes = document.querySelectorAll('.user-profile');
    userProfileNodes.forEach(node => {
        node.style.position = 'relative';
        node.style.cursor = 'pointer';

        // Dynamically correct the display image using JWT values
        const img = node.querySelector('img');
        if (img) img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=4318ff&color=fff&rounded=true`;

        // Inject the profile dropout
        const drop = document.createElement('div');
        drop.className = 'dropdown-panel';
        drop.style.cssText = `
            position:absolute; right:0; top:50px; border:1px solid var(--border-light); border-radius:16px; 
            width:280px; padding:20px; display:none; flex-direction:column;
            z-index:9000; cursor:default;
        `;
        drop.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; border-bottom:1px solid #e2e8f0; padding-bottom:15px;">
                <img src="${img ? img.src : ''}" style="width:48px; height:48px; border-radius:50%; box-shadow:0 5px 15px rgba(67,24,255,0.2);">
                <div>
                    <h4 style="margin:0; font-size:16px; font-weight:800; color:var(--text-main);">${username}</h4>
                    <p style="margin:2px 0 0 0; font-size:12px; font-weight:700; color:var(--primary); text-transform:uppercase;">${userRole.replace('_', ' ')}</p>
                </div>
            </div>
            <a href="/team/" style="text-decoration:none; color:var(--text-main); font-size:14px; font-weight:600; padding:10px; border-radius:8px; display:block; transition:0.2s; background:#f4f7fe; text-align:center;">Manage HR Access Settings</a>
        `;
        node.appendChild(drop);

        node.addEventListener('click', (e) => {
            if (drop.contains(e.target)) return; // prevent closing if clicking inside
            drop.style.display = drop.style.display === 'none' ? 'flex' : 'none';
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!node.contains(e.target)) drop.style.display = 'none';
        });
    });

    const bellNodes = Array.from(document.querySelectorAll('.icon-btn')).filter(btn => btn.textContent.includes('🔔'));
    bellNodes.forEach(btn => {
        btn.style.position = 'relative';
        const notiDrop = document.createElement('div');
        notiDrop.className = 'dropdown-panel';
        notiDrop.style.cssText = `
            position:absolute; right:-10px; top:45px; border:1px solid var(--border-light); border-radius:16px; 
            width:320px; padding:20px 20px 30px 20px; display:none; flex-direction:column;
            z-index:9000; text-align:center; cursor:default;
        `;
        notiDrop.innerHTML = `
            <h4 style="margin:0 0 15px 0; font-size:15px; font-weight:800; color:var(--text-main); text-align:left; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">Alerts</h4>
            <div style="font-size:40px; margin-bottom:10px;">🎉</div>
            <p style="margin:0; font-size:14px; font-weight:600; color:var(--text-main);">You're all caught up!</p>
            <p style="margin:5px 0 0 0; font-size:12px; font-weight:500; color:var(--text-muted);">We'll notify you if any POS anomalies or inventory limits trigger.</p>
        `;
        btn.appendChild(notiDrop);

        btn.addEventListener('click', (e) => {
            if (notiDrop.contains(e.target)) return;
            notiDrop.style.display = notiDrop.style.display === 'none' ? 'flex' : 'none';
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target)) notiDrop.style.display = 'none';
        });
    });

    // Expose role info globally for pages that need it
    window.erpUser = { role: userRole, payload };

    // -------------------------------------------------------
    // Dark / Light Theme Toggle (persisted via localStorage)
    // -------------------------------------------------------
    (function initTheme() {
        const saved = localStorage.getItem('erp_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        updateToggleIcon(saved);
    })();

    function updateToggleIcon(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }

    // Inject toggle button if not already in the HTML
    if (!document.getElementById('themeToggleBtn')) {
        const btn = document.createElement('button');
        btn.id = 'themeToggleBtn';
        btn.title = 'Toggle dark / light theme';
        btn.textContent = localStorage.getItem('erp_theme') === 'dark' ? '☀️' : '🌙';
        document.body.appendChild(btn);
    }

    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'themeToggleBtn') {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('erp_theme', next);
            updateToggleIcon(next);
        }
    });

})();
