document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if (!token) { window.location.href = '/login/'; return; }

    const fetchConfig = { headers: { 'Authorization': `Bearer ${token}` } };
    const jsonHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const postConfig  = { method: 'POST', headers: jsonHeaders };

    const tbody       = document.getElementById('inventoryTableBody');
    const totalItems  = document.getElementById('totalItems');
    const totalValue  = document.getElementById('totalValue');
    const lowStock    = document.getElementById('lowStock');

    const modal       = document.getElementById('productModal');
    const openModalBtn  = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const productForm   = document.getElementById('productForm');

    let allProducts = [];

    // ── Edit Product Modal (injected dynamically) ───────────────────────────
    const editModal = document.createElement('div');
    editModal.id = 'editProductModal';
    editModal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:9000;display:none;`;
    editModal.innerHTML = `
        <div style="background:var(--modal-bg);border:1px solid var(--border-color);border-radius:24px;padding:30px;width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:14px;">
                <h3 style="font-size:20px;font-weight:800;color:var(--text-main);">✏️ Edit Product</h3>
                <button id="closeEditProductModal" style="background:none;border:none;font-size:22px;color:var(--text-muted);cursor:pointer;">×</button>
            </div>
            <form id="editProductForm">
                <input type="hidden" id="editProdId">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Brand</label><input id="editBrand" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Model</label><input id="editModel" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Cost Price</label><input id="editCostPrice" type="number" step="0.01" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Sale Price</label><input id="editSalePrice" type="number" step="0.01" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Stock</label><input id="editStock" type="number" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                    <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Low Stock Threshold</label><input id="editLowThreshold" type="number" class="form-input" style="width:100%;margin-top:6px;padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--input-bg);color:var(--text-main);"></div>
                </div>
                <p id="editProdError" style="color:var(--danger);font-size:12px;font-weight:600;display:none;margin:12px 0;"></p>
                <button type="submit" style="width:100%;margin-top:16px;padding:14px;border-radius:12px;background:var(--primary);color:#fff;font-size:15px;font-weight:700;border:none;cursor:pointer;">Save Changes</button>
            </form>
        </div>`;
    document.body.appendChild(editModal);

    document.getElementById('closeEditProductModal').addEventListener('click', () => editModal.style.display = 'none');
    editModal.addEventListener('click', e => { if (e.target === editModal) editModal.style.display = 'none'; });

    function openEditProduct(productId) {
        const p = allProducts.find(x => x.id === productId);
        if (!p) return;
        document.getElementById('editProdId').value       = p.id;
        document.getElementById('editBrand').value        = p.brand;
        document.getElementById('editModel').value        = p.model_name;
        document.getElementById('editCostPrice').value    = p.cost_price;
        document.getElementById('editSalePrice').value    = p.sale_price;
        document.getElementById('editStock').value        = p.stock_quantity;
        document.getElementById('editLowThreshold').value = p.low_stock_threshold;
        document.getElementById('editProdError').style.display = 'none';
        editModal.style.display = 'flex';
    }

    document.getElementById('editProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl  = document.getElementById('editProdError');
        const prodId = document.getElementById('editProdId').value;
        const btn    = e.target.querySelector('button[type="submit"]');
        btn.textContent = 'Saving...'; btn.disabled = true;
        try {
            const res = await fetch(`/api/inventory/products/${prodId}/`, {
                method: 'PATCH', headers: jsonHeaders,
                body: JSON.stringify({
                    brand:              document.getElementById('editBrand').value.trim(),
                    model_name:         document.getElementById('editModel').value.trim(),
                    cost_price:         document.getElementById('editCostPrice').value,
                    sale_price:         document.getElementById('editSalePrice').value,
                    stock_quantity:     document.getElementById('editStock').value,
                    low_stock_threshold: document.getElementById('editLowThreshold').value,
                })
            });
            if (!res.ok) { const d = await res.json(); errEl.textContent = JSON.stringify(d); errEl.style.display='block'; return; }
            editModal.style.display = 'none';
            syncDatabase();
        } catch(err) { errEl.textContent = 'Network error.'; errEl.style.display = 'block';
        } finally { btn.textContent = 'Save Changes'; btn.disabled = false; }
    });

    async function deleteProduct(productId, name) {
        if (!confirm(`Soft-delete "${name}"? It will no longer appear in inventory or POS.`)) return;
        try {
            await fetch(`/api/inventory/products/${productId}/`, {
                method: 'DELETE', headers: jsonHeaders
            });
            syncDatabase();
        } catch(e) { alert('Delete failed: ' + e.message); }
    }

    // Expose for inline onclick
    window._editProduct   = openEditProduct;
    window._deleteProduct = deleteProduct;


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

    function renderTable(data) {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); font-weight:500;">Zero Native Hardware Assets Registered.</td></tr>`;
            return;
        }

        data.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${index * 0.08}s`;

            const stockColor = p.stock_quantity <= (p.low_stock_threshold || 5) ? 'var(--danger)' : 'var(--success)';
            const stockBg    = p.stock_quantity <= (p.low_stock_threshold || 5) ? 'var(--danger-light)' : 'var(--success-light)';

            tr.innerHTML = `
                <td>
                    <div style="font-weight:700; color:var(--text-main);">${p.barcode || 'N/A'}</div>
                    <div style="font-size:11px; color:var(--text-muted);">SKU-${p.id.substring(0, 8).toUpperCase()}</div>
                </td>
                <td>
                    <span style="font-weight:800;">${p.brand}</span> <span style="color:var(--text-muted)">${p.model_name} ${p.storage_capacity ? `(${p.storage_capacity})` : ''}</span>
                    <div style="font-size:11px; color:var(--danger); margin-top:2px;">${p.is_low_stock ? '⚠️ Low Stock' : ''}</div>
                </td>
                <td>${p.category_name || '-'}</td>
                <td><span class="badge" style="color:${stockColor}; background:${stockBg}; font-size:12px;">${p.stock_quantity} Units</span></td>
                <td style="font-weight:700;">PKR${parseFloat(p.sale_price || 0).toFixed(2)}</td>
                <td style="font-weight:700; color:var(--success);">PKR${parseFloat(p.service_price || 0).toFixed(2)}</td>
                <td style="color:var(--text-muted);">PKR${parseFloat(p.commission || 0).toFixed(2)}</td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button onclick="window._editProduct('${p.id}')" 
                            style="background:var(--primary-light);color:var(--primary);border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">✏️ Edit</button>
                        <button onclick="window._deleteProduct('${p.id}', '${p.brand} ${p.model_name}')" 
                            style="background:var(--danger-light);color:var(--danger);border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">🗑️</button>
                    </div>
                </td>
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
