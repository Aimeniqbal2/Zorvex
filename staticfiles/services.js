document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if(!token) { window.location.href = '/login/'; return; }

    const fetchConfig = { headers: { 'Authorization': `Bearer ${token}` } };
    const patchConfig = { 
        method: 'PATCH', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } 
    };

    const container = document.getElementById('serviceList');

    async function hydrateWorkbench() {
        try {
            const resp = await fetch('/api/services/orders/', fetchConfig);
            if(!resp.ok) throw new Error("Django Refusal API Endpoint Disconnected.");
            
            const raw = await resp.json();
            const orders = raw.results || raw;
            renderKanban(orders);

        } catch (e) {
            container.innerHTML = `<div style="text-align:center; color:var(--danger); font-weight:600; padding:40px;">Connection Refused to Django Architecture.</div>`;
        }
    }

    function renderKanban(data) {
        container.innerHTML = '';
        if(data.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 50px; color: var(--text-muted); font-weight: 600;">Zero External Operations Routed currently.</div>`;
            return;
        }

        // Sort dynamically so pending > in_progress > delivered
        data.sort((a,b) => {
            const rank = { 'pending': 1, 'in_progress': 2, 'delivered': 3 };
            return rank[a.status] - rank[b.status];
        });

        data.forEach(o => {
            const card = document.createElement('div');
            card.className = 'work-card';

            let badgeHtml = '';
            let actionHtml = '';

            // Render conditional buttons based on the exact strict state machine
            if(o.status === 'pending') {
                badgeHtml = `<span class="status-badge" style="background:#fff8eb; color:var(--warning);">AWAITING DIAGNOSTIC</span>`;
                actionHtml = `<button class="action-btn btn-start" onclick="window.triggerAPIState('${o.id}', 'in_progress')">▶ Commence Operations</button>`;
            } 
            else if (o.status === 'in_progress') {
                badgeHtml = `<span class="status-badge" style="background:var(--primary-light); color:var(--primary);">ACTIVE REPAIR CYCLE</span>`;
                actionHtml = `<button class="action-btn btn-finish" onclick="window.triggerAPIState('${o.id}', 'delivered')">✔ Complete & Deliver</button>`;
            } 
            else {
                badgeHtml = `<span class="status-badge" style="background:#e6fcf5; color:var(--success);">DELIVERED ARCHIVE</span>`;
                actionHtml = `<button class="action-btn btn-disabled" disabled>Operation Vaulted</button>`;
            }

            card.innerHTML = `
                <div class="work-info">
                    <h3>${o.device_model} / <span style="font-weight:600; font-size:16px;">${o.customer_name}</span></h3>
                    <p>Issue Diagnostics: <span style="color:var(--text-dark);">${o.issue_description}</span></p>
                    ${badgeHtml} <span style="font-size:12px; font-weight:600; color:var(--text-muted); margin-left:10px;">Cost: $${parseFloat(o.estimated_cost).toFixed(2)}</span>
                </div>
                <div class="work-actions">
                    ${actionHtml}
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Natively hook global API mutation events
    window.triggerAPIState = async (orderId, targetStatus) => {
        try {
            const timeISO = new Date().toISOString();
            const payload = { status: targetStatus };

            // Specifically trigger the strict logical limits constructed in Phase 7 Business Logic
            if(targetStatus === 'in_progress') payload.start_time = timeISO;
            if(targetStatus === 'delivered') payload.end_time = timeISO;

            const pConf = { ...patchConfig, body: JSON.stringify(payload) };
            const resp = await fetch(`/api/services/orders/${orderId}/`, pConf);
            
            if(!resp.ok) throw new Error("State Transition Denied by Backend Pipeline.");
            
            // Reloop
            hydrateWorkbench();

        } catch (e) {
            alert(`Diagnostic Failure: ${e.message}`);
        }
    };

    

    // Boot execution
    hydrateWorkbench();
});
