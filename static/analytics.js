/* analytics.js — Monthly Analytics & Reports Page Logic */

const API = '/api';
function getToken() { return localStorage.getItem('access_token'); }
function authHeaders() { return { 'Authorization': `Bearer ${getToken()}` }; }
function parseJWT(token) { try { return JSON.parse(atob(token.split('.')[1])); } catch(e) { return {}; } }

if (!getToken()) { window.location.href = '/login/'; }

const jwt = parseJWT(getToken());
const userRole = jwt.role || '';

// Redirect non-analytics roles immediately
if (!['admin', 'manager', 'super_admin'].includes(userRole)) {
    alert('Access Denied: Analytics is restricted to Admin and Manager roles.');
    window.location.href = '/';
}

// Populate year select (last 5 years + current)
const yearSel = document.getElementById('filterYear');
const currYear = new Date().getFullYear();
for (let y = currYear; y >= currYear - 4; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currYear) opt.selected = true;
    yearSel.appendChild(opt);
}

// Set current month as default
const monthSel = document.getElementById('filterMonth');
monthSel.value = String(new Date().getMonth() + 1);

let lineChart = null;
let barChart  = null;

function fmt(num) { return 'PKR ' + parseFloat(num || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtNum(num) { return parseInt(num || 0).toLocaleString(); }

async function loadAnalytics() {
    const year  = yearSel.value;
    const month = monthSel.value;
    const body  = document.getElementById('analyticsTableBody');
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>';

    try {
        let url = `${API}/reports/monthly/?year=${year}`;
        if (month) url += `&month=${month}`;

        const res = await fetch(url, { headers: authHeaders() });
        if (res.status === 403) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:30px;">Access Denied — Admin / Manager only.</td></tr>';
            return;
        }
        if (!res.ok) throw new Error('API error');
        const result = await res.json();
        const data = result.data || [];

        if (!data.length) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No data for selected period.</td></tr>';
            renderSummary([]);
            renderCharts([]);
            return;
        }

        renderSummary(data);
        renderTable(data);
        renderCharts(data);

    } catch(e) {
        console.error('Analytics load error:', e);
        body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:30px;">Failed to load analytics data.</td></tr>`;
    }
}

function renderSummary(data) {
    const totRevenue = data.reduce((s, d) => s + d.revenue, 0);
    const totProfit  = data.reduce((s, d) => s + d.profit, 0);
    const totOrders  = data.reduce((s, d) => s + d.orders, 0);
    const totWork    = data.reduce((s, d) => s + d.work_orders, 0);
    const totPayable = data.reduce((s, d) => s + d.vendor_payables, 0);

    document.getElementById('sumRevenue').textContent    = fmt(totRevenue);
    document.getElementById('sumProfit').textContent     = fmt(totProfit);
    document.getElementById('sumOrders').textContent     = fmtNum(totOrders);
    document.getElementById('sumWorkOrders').textContent = fmtNum(totWork);
    document.getElementById('sumPayables').textContent   = fmt(totPayable);

    // Colour profit
    const profitEl = document.getElementById('sumProfit');
    profitEl.style.color = totProfit >= 0 ? 'var(--success,#05cd99)' : 'var(--danger,#ee5d50)';
}

function renderTable(data) {
    const body = document.getElementById('analyticsTableBody');
    body.innerHTML = data.map(row => `
        <tr>
            <td style="font-weight:700;">${row.month_name} ${row.year}</td>
            <td style="color:var(--primary);font-weight:700;">${fmt(row.revenue)}</td>
            <td style="color:${row.profit >= 0 ? 'var(--success,#05cd99)' : 'var(--danger,#ee5d50)'};font-weight:700;">${fmt(row.profit)}</td>
            <td>${fmtNum(row.orders)}</td>
            <td>${fmtNum(row.work_orders)}</td>
            <td style="color:var(--warning,#ffb547);font-weight:600;">${fmt(row.vendor_payables)}</td>
        </tr>
    `).join('');
}

function renderCharts(data) {
    const style       = getComputedStyle(document.documentElement);
    const primaryColor = '#4318ff';
    const successColor = '#05cd99';
    const warningColor = '#ffb547';
    const dangerColor  = '#ee5d50';
    const textMuted   = style.getPropertyValue('--text-muted').trim() || '#a3aed1';
    const borderColor = style.getPropertyValue('--border-color').trim() || '#e0e5f2';

    const labels = data.map(d => `${d.month_name} ${d.year}`);

    // ── Revenue & Profit Line Chart ──────────────────────────────────────────
    const lineCtx = document.getElementById('revenueLineChart')?.getContext('2d');
    if (lineCtx) {
        if (lineChart) lineChart.destroy();
        const grad = lineCtx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, 'rgba(67,24,255,0.3)');
        grad.addColorStop(1, 'rgba(67,24,255,0)');
        lineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue (PKR)',
                        data: data.map(d => d.revenue),
                        borderColor: primaryColor,
                        backgroundColor: grad,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: primaryColor,
                        pointHoverRadius: 8,
                    },
                    {
                        label: 'Net Profit (PKR)',
                        data: data.map(d => d.profit),
                        borderColor: successColor,
                        backgroundColor: 'rgba(5,205,153,0.08)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: successColor,
                        pointHoverRadius: 7,
                        borderDash: [6, 3],
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textMuted, font: { weight: '700' }, usePointStyle: true } },
                    tooltip: { callbacks: { label: ctx => ` PKR ${ctx.parsed.y.toLocaleString()}` } }
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

    // ── Orders & Work Orders Bar Chart ───────────────────────────────────────
    const barCtx = document.getElementById('ordersBarChart')?.getContext('2d');
    if (barCtx) {
        if (barChart) barChart.destroy();
        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'POS Orders',
                        data: data.map(d => d.orders),
                        backgroundColor: 'rgba(67,24,255,0.75)',
                        borderRadius: 6,
                        borderSkipped: false,
                    },
                    {
                        label: 'Work Orders',
                        data: data.map(d => d.work_orders),
                        backgroundColor: 'rgba(255,181,71,0.75)',
                        borderRadius: 6,
                        borderSkipped: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textMuted, font: { weight: '700' }, usePointStyle: true } },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textMuted } },
                    y: {
                        grid: { color: borderColor, borderDash: [5, 5] },
                        ticks: { color: textMuted, stepSize: 1 },
                        beginAtZero: true,
                    }
                }
            }
        });
    }
}

// Event listeners
document.getElementById('applyFilter').addEventListener('click', loadAnalytics);
yearSel.addEventListener('change', loadAnalytics);
monthSel.addEventListener('change', loadAnalytics);

// Initial load
loadAnalytics();
