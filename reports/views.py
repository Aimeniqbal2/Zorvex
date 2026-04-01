import csv
from datetime import datetime
from django.http import HttpResponse
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
    Returns unified, fast dashboard aggregates so the Frontend only makes a single request 
    during screen paints. Combines Sales, Finance, Services, and Inventory highlights.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        company_id = request.user.company_id
        
        # Finance Core calculations
        finance_stats = ProfitCalculationService.get_net_profit(company_id=company_id)
        
        # Active workloads
        active_repairs = ServiceOrder.objects.filter(
            company_id=company_id, 
            status__in=['pending', 'in_progress']
        ).count()
        
        # Low Inventory Triggers
        low_stock_items = Product.objects.filter(
            company_id=company_id, 
            stock_quantity__lt=5
        ).count()
        
        # Chronological Revenue
        recent_sales_qs = Sale.objects.filter(company_id=company_id).select_related('cashier', 'customer', 'service_order').order_by('-created_at')[:8]
        recent_sales = [
            {
                'id': str(s.id), 
                'amount': float(s.total_amount), 
                'date': s.created_at.strftime('%b %d, %Y - %I:%M %p'), 
                'method': s.payment_method,
                'customer_name': s.customer.name if s.customer else 'Walk-in Customer',
                'customer_phone': s.customer.phone if s.customer else '',
                'sale_type': 'Repair Service' if s.service_order_id else 'Retail POS'
            }
            for s in recent_sales_qs
        ]
        
        return Response({
            'total_revenue': finance_stats['revenue'],
            'total_expenses': finance_stats['expenses'],
            'net_profit': finance_stats['profit'],
            'active_repairs': active_repairs,
            'low_stock_items': low_stock_items,
            'recent_sales': recent_sales
        })


class ExportCSVAPIView(APIView):
    """
    Dynamically exports structural CSVs based on dynamic param constraints (Sales or Inventory).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        report_type = request.query_params.get('type', 'sales')
        company_id = request.user.company_id
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{report_type}_report_{datetime.now().strftime("%Y%m%d")}.csv"'
        
        writer = csv.writer(response)
        
        if report_type == 'sales':
            writer.writerow(['Sale ID', 'Cashier', 'Amount', 'Payment Method', 'Date Processed'])
            sales = Sale.objects.filter(company_id=company_id).select_related('cashier')
            for s in sales:
                cashier_name = s.cashier.username if s.cashier else 'Unknown'
                writer.writerow([s.id, cashier_name, s.total_amount, s.payment_method, s.created_at.strftime('%Y-%m-%d %H:%M:%S')])
                
        elif report_type == 'inventory':
            writer.writerow(['Product Brand', 'Model', 'Current Stock', 'Sale Price'])
            products = Product.objects.filter(company_id=company_id)
            for p in products:
                writer.writerow([p.brand, p.model_name, p.stock_quantity, p.price])
                
        return response
