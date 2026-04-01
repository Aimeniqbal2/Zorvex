document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login/'; return; }

    const fetchConfig = { headers: { 'Authorization': `Bearer ${token}` } };
    const postConfig = {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    };

    const tbody = document.getElementById('inventoryTableBody');
    const totalItems = document.getElementById('totalItems');
    const totalValue = document.getElementById('totalValue');
    const lowStock = document.getElementById('lowStock');

    const modal = document.getElementById('productModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const productForm = document.getElementById('productForm');

    let allProducts = [];

    // 1. Hydrate the Category Foreign Keys
    async function loadCategories() {
        try {
            const resp = await fetch('/api/inventory/categorys/', fetchConfig);
            if (!resp.ok) return;
            const dataRaw = await resp.json();
            const data = dataRaw.results || dataRaw;

            const select = document.getElementById('categorySelect');
            select.innerHTML = '<option value="">-- Select Master Category --</option>';

            data.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error("Critical Category Fetch Error:", e);
        }
    }

    // 2. Master Product Sync
    async function syncDatabase() {
        try {
            const resp = await fetch('/api/inventory/products/', fetchConfig);
            if (!resp.ok) throw new Error("Core API Refusal");

            const results = await resp.json();
            allProducts = results.results || results;

            filterAndRender();
            calculateKPIs(allProducts);

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger); font-weight:600;">Django Database Server Disconnected.</td></tr>`;
        }
    }

    function filterAndRender() {
        const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
        const filtered = allProducts.filter(p => 
            p.brand.toLowerCase().includes(q) || 
            p.model_name.toLowerCase().includes(q) || 
            (p.barcode && p.barcode.toLowerCase().includes(q))
        );
        renderTable(filtered);
    }

    if (document.getElementById('searchInput')) {
        document.getElementById('searchInput').addEventListener('input', filterAndRender);
    }

    // 3. Matrix Rendering
    function renderTable(data) {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); font-weight:500;">Zero Native Hardware Assets Registered.</td></tr>`; return;
        }

        data.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${index * 0.08}s`;

            const stockColor = p.stock_quantity <= (p.low_stock_threshold || 5) ? 'var(--danger)' : 'var(--success)';
            const stockBg = p.stock_quantity <= (p.low_stock_threshold || 5) ? '#ffe2e0' : '#e6fcf5';

            tr.innerHTML = `
                <td>
                    <div style="font-weight:700; color:var(--text-dark);">${p.barcode || 'N/A'}</div>
                    <div style="font-size:11px; color:var(--text-muted);">SKU-${p.id.substring(0, 8).toUpperCase()}</div>
                </td>
                <td>
                    <span style="font-weight:800;">${p.brand}</span> <span style="color:var(--text-muted)">${p.model_name} ${p.storage_capacity ? `(${p.storage_capacity})` : ''}</span>
                    <div style="font-size:11px; color:var(--danger); margin-top:2px;">${p.is_low_stock ? '⚠️ Low Stock' : ''}</div>
                </td>
                <td>${p.category_name || '-'}</td>
                <td><span class="badge" style="color:${stockColor}; background:${stockBg}; font-size:12px;">${p.stock_quantity} Units</span></td>
                <td style="font-weight:700;">PKR${parseFloat(p.sale_price || 0).toFixed(2)}</td>
                <td style="font-weight:700; color:#05cd99;">PKR${parseFloat(p.service_price || 0).toFixed(2)}</td>
                <td style="color:var(--text-muted);">PKR${parseFloat(p.commission || 0).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function calculateKPIs(data) {
        let totalVal = 0, lowCount = 0;
        data.forEach(p => {
            totalVal += (parseFloat(p.cost_price || 0) * parseInt(p.stock_quantity || 0));
            if (p.is_low_stock || p.stock_quantity <= (p.low_stock_threshold || 5)) lowCount++;
        });

        totalItems.innerText = data.length;
        totalValue.innerText = "PKR" + totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        lowStock.innerText = lowCount;
    }

    // 4. Input & Modal Bindings
    if (openModalBtn) openModalBtn.addEventListener('click', () => modal.classList.add('active'));
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => { modal.classList.remove('active'); productForm.reset(); });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.classList.remove('active'); productForm.reset(); }
    });

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errNode = document.getElementById('modalError');
        errNode.style.display = 'none';

        const btnText = document.querySelector('.primary-btn');
        const origText = btnText.innerHTML;
        btnText.innerHTML = 'Injecting Logic...';

        const payload = {
            category: document.getElementById('categorySelect').value,
            brand: document.getElementById('brand').value.trim(),
            model_name: document.getElementById('model').value.trim(),
            color: document.getElementById('color').value,
            storage_capacity: document.getElementById('storage').value,
            barcode: document.getElementById('barcode').value.trim(),
            cost_price: document.getElementById('cost_price').value,
            sale_price: document.getElementById('sale_price').value,
            service_price: document.getElementById('service_price').value,
            commission: document.getElementById('commission').value,
            stock_quantity: document.getElementById('stock').value,
            low_stock_threshold: document.getElementById('low_stock_threshold').value,
            issues: document.getElementById('issues').value
        };

        try {
            const pConf = { ...postConfig, body: JSON.stringify(payload) };
            const r = await fetch('/api/inventory/products/', pConf);

            if (!r.ok) {
                const data = await r.json();
                console.warn(data);
                throw new Error("Invalid format matrix rejected by Django Engine.");
            }

            modal.classList.remove('active');
            productForm.reset();
            syncDatabase(); // Re-ping the server for the exact visual repaint

        } catch (error) {
            errNode.textContent = "Data Injection Overridden. Please assert parameters.";
            errNode.style.display = 'block';
        } finally {
            btnText.innerHTML = origText;
        }
    });

    // Boot Sequences
    loadCategories();
    syncDatabase();
});
