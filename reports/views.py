"""
reports/views.py
Dashboard API — real-time aggregates, 7-day revenue trend, and service order stats.
All queries are scoped to the requesting user's company.
"""
import csv
from datetime import datetime, timedelta
from django.http import HttpResponse
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets

from erp_core.views import TenantModelViewSet
from sales.models import Sale
from services.models import ServiceOrder
from inventory.models import Product
from finance.services import ProfitCalculationService


class DashboardAPIView(APIView):
    """
    Returns unified dashboard aggregates in a single API call:
    - KPI cards: revenue, profit, active repairs, low stock count WITH month-on-month % changes
    - 7-day revenue trend (real data) for the line chart
    - Service order status distribution for the doughnut chart
    - 8 most recent sales for the activity table
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company_id = request.user.company_id

        today = timezone.now().date()
        curr_start = today.replace(day=1)
        if curr_start.month == 1:
            prev_start = curr_start.replace(year=curr_start.year - 1, month=12, day=1)
        else:
            prev_start = curr_start.replace(month=curr_start.month - 1, day=1)
        prev_end = curr_start - timedelta(days=1)

        def pct_change(curr, prev):
            try:
                curr_f = float(curr or 0)
                prev_f = float(prev or 0)
                if prev_f == 0:
                    return 100.0 if curr_f > 0 else 0.0
                return round(((curr_f - prev_f) / prev_f) * 100, 1)
            except Exception:
                return 0.0

        # ── KPI 1: Gross Revenue ────────────────────────────────────────────────
        curr_revenue = Sale.objects.filter(
            company_id=company_id,
            created_at__date__gte=curr_start,
            created_at__date__lte=today,
        ).aggregate(total=Sum('total_amount'))['total'] or 0

        prev_revenue = Sale.objects.filter(
            company_id=company_id,
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        ).aggregate(total=Sum('total_amount'))['total'] or 0

        revenue_pct = pct_change(curr_revenue, prev_revenue)

        # ── KPI 2: Net Profit ───────────────────────────────────────────────────
        curr_finance = ProfitCalculationService.get_net_profit(
            start_date=curr_start, end_date=today, company_id=company_id
        )
        prev_finance = ProfitCalculationService.get_net_profit(
            start_date=prev_start, end_date=prev_end, company_id=company_id
        )
        curr_profit = curr_finance['profit']
        prev_profit = prev_finance['profit']
        profit_pct = pct_change(curr_profit, prev_profit)

        # All-time totals
        finance_stats = ProfitCalculationService.get_net_profit(company_id=company_id)

        # ── KPI 3: Active Work Orders ───────────────────────────────────────────
        curr_active = ServiceOrder.objects.filter(
            company_id=company_id,
            status__in=['pending', 'in_progress', 'ready']
        ).count()

        prev_active = ServiceOrder.objects.filter(
            company_id=company_id,
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        ).exclude(status='delivered').count()

        active_pct = pct_change(curr_active, prev_active)

        # ── KPI 4: Supply Chain Danger ──────────────────────────────────────────
        curr_low_stock = Product.objects.filter(
            company_id=company_id,
            stock_quantity__lte=5
        ).count()

        from inventory.models import VendorLedger
        curr_payables = VendorLedger.objects.filter(
            company_id=company_id,
            transaction_type='DEBIT',
            created_at__date__gte=curr_start,
            created_at__date__lte=today,
        ).aggregate(total=Sum('amount'))['total'] or 0

        prev_payables = VendorLedger.objects.filter(
            company_id=company_id,
            transaction_type='DEBIT',
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        ).aggregate(total=Sum('amount'))['total'] or 0

        supply_danger_pct = pct_change(curr_payables, prev_payables)

        # ── 7-Day Revenue Trend ─────────────────────────────────────────────────
        revenue_labels = []
        revenue_data = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            day_total = Sale.objects.filter(
                company_id=company_id,
                created_at__date=day
            ).aggregate(total=Sum('total_amount'))['total'] or 0
            revenue_labels.append(day.strftime('%b %d'))
            revenue_data.append(float(day_total))

        # ── Service Order Status Distribution ───────────────────────────────────
        status_counts = ServiceOrder.objects.filter(
            company_id=company_id
        ).values('status').annotate(count=Count('id'))

        status_map = {s['status']: s['count'] for s in status_counts}
        repair_stats = {
            'pending':     status_map.get('pending', 0),
            'in_progress': status_map.get('in_progress', 0),
            'ready':       status_map.get('ready', 0),
            'completed':   status_map.get('completed', 0),
            'return':      status_map.get('return', 0),
        }

        # ── Recent Sales Table ──────────────────────────────────────────────────
        recent_sales_qs = Sale.objects.filter(
            company_id=company_id
        ).select_related('cashier', 'customer', 'service_order').order_by('-created_at')[:8]

        recent_sales = [
            {
                'id': str(s.id),
                'amount': float(s.total_amount),
                'date': s.created_at.strftime('%b %d, %Y %I:%M %p'),
                'method': s.payment_method,
                'customer_name': s.customer.name if s.customer else 'Walk-in Customer',
                'customer_phone': s.customer.phone if s.customer else '',
                'sale_type': 'Repair Service' if s.service_order_id else 'Retail POS',
            }
            for s in recent_sales_qs
        ]

        return Response({
            'total_revenue':      finance_stats['revenue'],
            'total_expenses':     finance_stats['expenses'],
            'net_profit':         finance_stats['profit'],
            'active_repairs':     curr_active,
            'low_stock_items':    curr_low_stock,
            'kpi_changes': {
                'revenue': {
                    'current':  float(curr_revenue),
                    'previous': float(prev_revenue),
                    'pct':      revenue_pct,
                },
                'profit': {
                    'current':  float(curr_profit),
                    'previous': float(prev_profit),
                    'pct':      profit_pct,
                },
                'active_orders': {
                    'current':  curr_active,
                    'previous': prev_active,
                    'pct':      active_pct,
                },
                'supply_danger': {
                    'current':  float(curr_payables),
                    'previous': float(prev_payables),
                    'pct':      supply_danger_pct,
                },
            },
            'revenue_trends': {
                'labels': revenue_labels,
                'data':   revenue_data,
            },
            'repair_stats': repair_stats,
            'recent_sales': recent_sales,
        })


class MonthlyAnalyticsAPIView(APIView):
    """
    Month-wise analytics data. Admin and Manager only.
    GET /api/reports/monthly/?year=2026
    GET /api/reports/monthly/?year=2026&month=4
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company_id = request.user.company_id
        user_role = getattr(request.user, 'role', '')

        if user_role not in ('admin', 'manager', 'super_admin') and not request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Analytics access restricted to Admin and Manager roles.")

        year = int(request.query_params.get('year', timezone.now().year))
        month_param = request.query_params.get('month')
        months = [int(month_param)] if month_param else list(range(1, 13))

        results = []
        for m in months:
            try:
                from datetime import date
                m_start = date(year, m, 1)
                if m == 12:
                    m_end = date(year + 1, 1, 1) - timedelta(days=1)
                else:
                    m_end = date(year, m + 1, 1) - timedelta(days=1)
            except ValueError:
                continue

            revenue = Sale.objects.filter(
                company_id=company_id,
                created_at__date__gte=m_start,
                created_at__date__lte=m_end,
            ).aggregate(total=Sum('total_amount'))['total'] or 0

            finance = ProfitCalculationService.get_net_profit(
                start_date=m_start, end_date=m_end, company_id=company_id
            )

            orders_count = Sale.objects.filter(
                company_id=company_id,
                created_at__date__gte=m_start,
                created_at__date__lte=m_end,
                service_order__isnull=True,
            ).count()

            work_orders_count = ServiceOrder.objects.filter(
                company_id=company_id,
                created_at__date__gte=m_start,
                created_at__date__lte=m_end,
            ).count()

            from inventory.models import VendorLedger
            vendor_payables = VendorLedger.objects.filter(
                company_id=company_id,
                transaction_type='DEBIT',
                created_at__date__gte=m_start,
                created_at__date__lte=m_end,
            ).aggregate(total=Sum('amount'))['total'] or 0

            from calendar import month_abbr
            results.append({
                'month':           m,
                'month_name':      month_abbr[m],
                'year':            year,
                'revenue':         float(revenue),
                'profit':          float(finance['profit']),
                'orders':          orders_count,
                'work_orders':     work_orders_count,
                'vendor_payables': float(vendor_payables),
            })

        return Response({'year': year, 'month': month_param, 'data': results})


class ExportCSVAPIView(APIView):
    """Exports Sales or Inventory data as CSV."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        report_type = request.query_params.get('type', 'sales')
        company_id = request.user.company_id

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="{report_type}_report_{datetime.now().strftime("%Y%m%d")}.csv"'
        )
        writer = csv.writer(response)

        if report_type == 'sales':
            writer.writerow(['Sale ID', 'Cashier', 'Customer', 'Amount', 'Payment Method', 'Date'])
            sales = Sale.objects.filter(company_id=company_id).select_related('cashier', 'customer')
            for s in sales:
                writer.writerow([
                    str(s.id),
                    s.cashier.username if s.cashier else 'Unknown',
                    s.customer.name if s.customer else 'Walk-in',
                    s.total_amount,
                    s.payment_method,
                    s.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                ])
        elif report_type == 'inventory':
            writer.writerow(['Brand', 'Model', 'Storage', 'Barcode', 'Stock', 'Cost Price', 'Sale Price'])
            products = Product.objects.filter(company_id=company_id)
            for p in products:
                writer.writerow([
                    p.brand, p.model_name, p.storage_capacity,
                    p.barcode, p.stock_quantity, p.cost_price, p.sale_price,
                ])

        return response
