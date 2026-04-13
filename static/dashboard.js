document.addEventListener('DOMContentLoaded', () => {
    // Session Guard
    const token = localStorage.getItem('access_token');
    if(!token) { window.location.href = '/login/'; return; }

    // Handlers
    const logoutBtn = document.getElementById('logoutBtn');
    const exportBtn = document.getElementById('exportBtn');
    const valRevenue = document.querySelector('#valRevenue .counter');
    const valProfit = document.querySelector('#valProfit .counter');
    const valRepairs = document.querySelector('#valRepairs .counter');
    const valStock = document.querySelector('#valStock .counter');
    const salesTableBody = document.getElementById('salesTableBody');

    const fetchConfig = { headers: { 'Authorization': `Bearer ${token}` } };

    async function igniteEngine() {
        try {
            const resp = await fetch('/api/reports/dashboard/', fetchConfig);
            if(resp.status === 401 || resp.status === 402) {
                alert("Security Gateway Terminated Process. Re-auth required.");
                fireLogout(); return;
            }

            const data = await resp.json();
            
            // Numeric Animations
            animateCounter(valRevenue, data.total_revenue || 0);
            animateCounter(valProfit, data.net_profit || 0);
            animateCounter(valRepairs, data.active_repairs || 0, 1000);
            animateCounter(valStock, data.low_stock_items || 0, 1000);

            // Table Generator
            buildTable(data.recent_sales || []);

            // Visual Graphic Chart Generator
            paintCharts(data);

        } catch (e) {
            console.error("Dashboard Feed Sync Critical:", e);
            salesTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--danger); text-align:center;">API Matrix Offline.</td></tr>`;
        }
    }

    function buildTable(sales) {
        salesTableBody.innerHTML = '';
        if(sales.length === 0) {
            salesTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">0 Active Transactions on Local Node.</td></tr>`; return;
        }

        sales.forEach(s => {
            const tr = document.createElement('tr');
            const bt = s.method.toLowerCase() === 'cash' ? 'positive' : 'warning';
            tr.innerHTML = `
                <td style="color:var(--primary); font-weight:800;">#SAL-${s.id.substring(0,8).toUpperCase()}</td>
                <td style="font-size:12px; font-weight:600; color:var(--text-muted);">${s.date}</td>
                <td>
                    <div style="font-weight:700;">${s.customer_name}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${s.customer_phone || ''}</div>
                </td>
                <td><span class="badge" style="background:var(--bg-secondary); color:var(--text-muted); font-size:11px;">${s.sale_type.toUpperCase()}</span></td>
                <td style="font-weight:800; color:var(--text-main);">PKR${parseFloat(s.amount).toFixed(2)}</td>
                <td><button onclick="viewReceipt('${s.id}')" style="background:var(--primary-light); color:var(--primary); border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700; font-size:12px;">📄 View</button></td>
            `;
            salesTableBody.appendChild(tr);
        });
    }

    const receiptModal = document.getElementById('receiptModal');
    const closeReceiptBtn = document.getElementById('closeReceiptBtn');
    
    if (closeReceiptBtn) {
        closeReceiptBtn.addEventListener('click', () => { 
            document.getElementById('receiptModal').classList.remove('active');
            document.body.style.background = ''; // restore bg
        });
    }

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

    // ChartJS — Real Data from Dashboard API
    let revenueChartInstance = null;
    let statusChartInstance  = null;

    function paintCharts(payload) {
        // Read computed CSS vars so charts respect dark/light theme
        const style        = getComputedStyle(document.documentElement);
        const primaryColor = style.getPropertyValue('--primary').trim() || '#4318ff';
        const textMuted    = style.getPropertyValue('--text-muted').trim() || '#a3aed1';
        const borderColor  = style.getPropertyValue('--border-color').trim() || '#e0e5f2';
        const successColor = style.getPropertyValue('--success').trim() || '#05cd99';
        const warningColor = style.getPropertyValue('--warning').trim() || '#ffb547';
        const dangerColor  = style.getPropertyValue('--danger').trim() || '#ee5d50';

        // ── Revenue Trend (7-day real data) ─────────────────────────────────
        const revCtx = document.getElementById('revenueChart')?.getContext('2d');
        if (revCtx) {
            const isHex = primaryColor.startsWith('#');
            const grad = revCtx.createLinearGradient(0, 0, 0, 300);
            grad.addColorStop(0, isHex ? primaryColor + '66' : 'rgba(67, 24, 255, 0.4)');
            grad.addColorStop(1, isHex ? primaryColor + '00' : 'rgba(67, 24, 255, 0)');

            const trends = payload.revenue_trends || { labels: [], data: [] };

            if (revenueChartInstance) revenueChartInstance.destroy();
            revenueChartInstance = new Chart(revCtx, {
                type: 'line',
                data: {
                    labels: trends.labels,
                    datasets: [{
                        label: 'Revenue (PKR)',
                        data: trends.data,
                        borderColor: primaryColor,
                        backgroundColor: grad,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: primaryColor,
                        pointHoverRadius: 7,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` PKR ${ctx.parsed.y.toLocaleString()}`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { color: textMuted } },
                        y: {
                            grid: { color: borderColor, borderDash: [5, 5] },
                            ticks: { color: textMuted, callback: v => `PKR ${v.toLocaleString()}` },
                            beginAtZero: true,
                        }
                    }
                }
            });
        }

        // ── Service Order Status Distribution ────────────────────────────────
        const statusCtx = document.getElementById('statusChart')?.getContext('2d');
        if (statusCtx) {
            const stats = payload.repair_stats || {};
            const labels = ['Pending', 'In Progress', 'Ready', 'Completed', 'Returned'];
            const dataset = [
                stats.pending     || 0,
                stats.in_progress || 0,
                stats.ready       || 0,
                stats.completed   || 0,
                stats.return      || 0,
            ];
            const colors = [warningColor, primaryColor, successColor, '#38bdf8', dangerColor];

            if (statusChartInstance) statusChartInstance.destroy();
            statusChartInstance = new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data: dataset,
                        backgroundColor: colors,
                        borderWidth: 0,
                        cutout: '72%',
                        hoverOffset: 8,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: textMuted, font: { size: 12, weight: '600' }, padding: 14, boxWidth: 12, usePointStyle: true }
                        }
                    }
                }
            });
        }
    }

    function animateCounter(el, target, duration=1500) {
        let start = null; const tar = parseFloat(target);
        const step = (ts) => {
            if(!start) start = ts; const p = Math.min((ts - start) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 4); const val = ease * tar;
            el.innerHTML = tar % 1 !== 0 ? val.toFixed(2) : Math.floor(val);
            if(p < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    function fireLogout() { localStorage.clear(); window.location.href = '/login/'; }

    if(logoutBtn) logoutBtn.addEventListener('click', fireLogout);

    if(exportBtn) exportBtn.addEventListener('click', async () => {
        exportBtn.textContent = 'Crunching CSV...';
        try {
            const r = await fetch('/api/reports/export/?type=sales', fetchConfig);
            if(r.ok) {
                const url = window.URL.createObjectURL(await r.blob());
                const a = document.createElement('a'); a.href = url; a.download = `Fleet_CSV_${Date.now()}.csv`;
                document.body.appendChild(a); a.click(); a.remove();
            }
        } catch(e) {} finally { exportBtn.textContent = 'Export Native CSV'; }
    });

    igniteEngine();
});
