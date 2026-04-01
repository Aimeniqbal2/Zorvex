"""
erp_core/search_views.py
Global cross-module search API.
Searches Products, Customers, and Service Orders in a single endpoint.
"""
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


class GlobalSearchView(APIView):
    """
    GET /api/search/?q=<query>
    Returns: { products: [...], customers: [...], orders: [...] }
    Tenancy is automatically enforced via TenantManager on the models.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response({'products': [], 'customers': [], 'orders': [], 'sales': []})

        # Product search
        from inventory.models import Product
        from inventory.serializers import ProductSerializer
        products = Product.objects.filter(
            Q(brand__icontains=q) |
            Q(model_name__icontains=q) |
            Q(barcode__icontains=q) |
            Q(color__icontains=q)
        ).select_related('category')[:10]

        # Customer search
        from sales.models import Customer
        from sales.serializers import CustomerSerializer
        customers = Customer.objects.filter(
            Q(name__icontains=q) |
            Q(phone__icontains=q) |
            Q(email__icontains=q)
        )[:10]

        # Service Order search
        from services.models import ServiceOrder
        from services.serializers import ServiceOrderSerializer
        orders = ServiceOrder.objects.filter(
            Q(customer_name__icontains=q) |
            Q(customer_phone__icontains=q) |
            Q(device_brand__icontains=q) |
            Q(device_model__icontains=q)
        ).select_related('technician')[:10]

        # Sale ID search
        sales = []
        clean_q = q.replace('#SAL-', '').replace('#sal-', '').strip()
        if clean_q:
            from sales.models import Sale
            from sales.serializers import SaleSerializer
            # Simple wildcard UUID search by string casting on postgres can be heavy, but for 8 chars starting, it's ok.
            # Using iexact or istartswith on UUID directly is restricted in Django.
            # We will grab recent ones that might match or just get a small subset and python filter, 
            # OR we can just use id__icontains which Django 3.2+ supports native cast for UUID.
            sales_qs = Sale.objects.filter(id__icontains=clean_q).select_related('customer')[:5]
            sales = SaleSerializer(sales_qs, many=True).data

        return Response({
            'products': ProductSerializer(products, many=True).data,
            'customers': CustomerSerializer(customers, many=True).data,
            'orders': ServiceOrderSerializer(orders, many=True).data,
            'sales': sales
        })
