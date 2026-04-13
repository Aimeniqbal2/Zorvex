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
    - KPI cards: revenue, profit, active repairs, low stock count
    - 7-day revenue trend (real data) for the line chart
    - Service order status distribution for the doughnut chart
    - 8 most recent sales for the activity table
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company_id = request.user.company_id

        # ── Finance KPIs ───────────────────────────────────────────────────────
        finance_stats = ProfitCalculationService.get_net_profit(company_id=company_id)

        # ── Active Service Orders ───────────────────────────────────────────────
        active_repairs = ServiceOrder.objects.filter(
            company_id=company_id,
            status__in=['pending', 'in_progress', 'ready']
        ).count()

        # ── Low Stock Count ─────────────────────────────────────────────────────
        low_stock_items = Product.objects.filter(
            company_id=company_id,
            stock_quantity__lte=5
        ).count()

        # ── 7-Day Revenue Trend (real daily totals) ─────────────────────────────
        today = timezone.now().date()
        revenue_labels = []
        revenue_data = []
        for i in range(6, -1, -1):  # 6 days ago → today
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
            # KPI cards
            'total_revenue':   finance_stats['revenue'],
            'total_expenses':  finance_stats['expenses'],
            'net_profit':      finance_stats['profit'],
            'active_repairs':  active_repairs,
            'low_stock_items': low_stock_items,
            # Charts
            'revenue_trends': {
                'labels': revenue_labels,
                'data':   revenue_data,
            },
            'repair_stats': repair_stats,
            # Table
            'recent_sales': recent_sales,
        })


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
