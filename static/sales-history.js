document.addEventListener('DOMContentLoaded', () => {
    // Session Guard
    const token = localStorage.getItem('access_token');
    if(!token) { window.location.href = '/login/'; return; }

    const fetchConfig = { headers: { 'Authorization': `Bearer ${token}` } };
    const salesTableBody = document.getElementById('salesTableBody');
    const searchInput = document.getElementById('searchInput');
    const methodFilter = document.getElementById('methodFilter');
    
    let globalSalesData = [];

    async function loadTransactions() {
        try {
            const resp = await fetch('/api/sales/sales/', fetchConfig);
            if(resp.status === 401 || resp.status === 402) {
                alert("Security Gateway Terminated Process. Re-auth required.");
                localStorage.clear(); window.location.href = '/login/'; return;
            }

            const data = await resp.json();
            globalSalesData = data;
            
            renderTable(globalSalesData);

        } catch (e) {
            console.error("Ledger Feed Sync Critical:", e);
            salesTableBody.innerHTML = `<tr><td colspan="6" style="color:var(--danger); text-align:center; padding: 45px;">API Matrix Offline.</td></tr>`;
        }
    }

    function renderTable(salesData) {
        salesTableBody.innerHTML = '';
        if(salesData.length === 0) {
            salesTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding: 45px;">0 Active Transactions found matching parameters.</td></tr>`; return;
        }

        salesData.forEach(s => {
            const dt = new Date(s.created_at);
            const dateStr = dt.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) + ' - ' + dt.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
            
            const tr = document.createElement('tr');
            tr.className = 'clickable-row';
            tr.onclick = () => viewReceipt(s.id);

            const badgeCls = s.payment_method === 'cash' ? 'bg-cash' : s.payment_method === 'credit' ? 'bg-credit' : 'bg-wallet';
            const customerName = s.customer_details ? s.customer_details.name : 'Walk-in Customer';
            const customerPhone = s.customer_details ? s.customer_details.phone : '';
            const saleType = s.service_order ? 'Repair Service' : 'Retail POS';

            tr.innerHTML = `
                <td style="color:var(--primary); font-weight:800;">#SAL-${s.id.substring(0,8).toUpperCase()}</td>
                <td style="font-size:12px; font-weight:600; color:var(--text-muted);">${dateStr}</td>
                <td>
                    <div style="font-weight:700;">${customerName}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${customerPhone}</div>
                </td>
                <td><span class="badge" style="background:#f4f7fe; color:var(--text-muted); font-size:11px;">${saleType.toUpperCase()}</span></td>
                <td style="font-weight:800; color:var(--text-main);">PKR${parseFloat(s.total_amount).toFixed(2)}</td>
                <td><span class="badge ${badgeCls}">${s.payment_method.toUpperCase()}</span></td>
            `;
            salesTableBody.appendChild(tr);
        });
    }

    // Interactive Filtering Engine
    function filterLedger() {
        const query = searchInput.value.toLowerCase();
        const method = methodFilter.value.toLowerCase();
        
        const filtered = globalSalesData.filter(s => {
            const customerName = (s.customer_details ? s.customer_details.name : 'Walk-in').toLowerCase();
            const customerPhone = (s.customer_details ? s.customer_details.phone : '').toLowerCase();
            const saleId = s.id.toLowerCase();
            
            const matchQuery = saleId.includes(query) || customerName.includes(query) || customerPhone.includes(query) || query.replace('#sal-','') === saleId.substring(0,8);
            const matchMethod = method === '' || s.payment_method.toLowerCase() === method;
            
            return matchQuery && matchMethod;
        });
        
        renderTable(filtered);
    }

    searchInput.addEventListener('input', filterLedger);
    methodFilter.addEventListener('change', filterLedger);

    const receiptModal = document.getElementById('receiptModal');
    const closeReceiptBtn = document.getElementById('closeReceiptBtn');
    
    if (closeReceiptBtn) {
        closeReceiptBtn.addEventListener('click', () => { 
            document.getElementById('receiptModal').classList.remove('active');
            document.body.style.background = ''; // restore bg
        });
    }

    // Cloning Receipt Thermal Print Engine from Dashboard module
    window.viewReceipt = async function(saleId) {
        try {
            const r = await fetch(`/api/sales/sales/${saleId}/`, fetchConfig);
            if (!r.ok) throw new Error("Failed fetching sale");
            const sale = await r.json();
            
            const rc = document.getElementById('receiptContent');
            let itemsHtml = '';
            
            if (sale.items && sale.items.length) {
                itemsHtml = sale.items.map(i => `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="max-width:60%;">${i.quantity}x ${i.product_name || i.product}</span>
                        <span>PKR${(i.unit_price * i.quantity).toFixed(2)}</span>
                    </div>
                `).join('');
            } else if (sale.service_order) {
                itemsHtml = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="max-width:60%;">Service & Parts</span>
                        <span>PKR${parseFloat(sale.total_amount).toFixed(2)}</span>
                    </div>
                `;
            }

            let html = `
                <div style="text-align:center; margin-bottom:15px; border-bottom:1px dashed #000; padding-bottom:10px;">
                    <h2 style="margin:0; font-family:monospace; font-size:20px; font-weight:800;">ZORVEX ERP</h2>
                    <p style="margin:2px 0; font-size:11px;">Historical Receipt Copy</p>
                    <p style="margin:5px 0 0 0; font-size:12px; font-weight:bold;">Inv: #SAL-${sale.id.substring(0, 8).toUpperCase()}</p>
                </div>
                
                <div style="margin-bottom:15px; font-size:12px;">
                    ${itemsHtml}
                </div>

                <div style="border-top:1px dashed #000; padding-top:10px; font-size:13px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>Subtotal:</span><span>PKR${parseFloat(sale.subtotal).toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span>Tax (15%):</span><span>PKR${parseFloat(sale.tax_amount).toFixed(2)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-weight:800; font-size:15px; margin-top:5px;">
                        <span>TOTAL:</span><span>PKR${parseFloat(sale.total_amount).toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:20px; font-size:11px;">
                    <p style="margin:0;">Method: ${(sale.payment_method || 'CASH').toUpperCase()}</p>
                    <p style="margin:5px 0 0 0; font-style:italic;">Thank you for your business!</p>
                </div>
            `;
            rc.innerHTML = html;
            document.getElementById('receiptModal').classList.add('active');
            document.body.style.background = '#fff';
        } catch(e) { alert("Could not load full receipt details."); }
    };

    loadTransactions();
});
