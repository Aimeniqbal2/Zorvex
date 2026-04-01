from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from .models import Category, Product, StockMovement, Vendor, PurchaseOrder, PurchaseOrderItem
from .serializers import (
    CategorySerializer, ProductSerializer, StockMovementSerializer,
    VendorSerializer, PurchaseOrderSerializer, PurchaseOrderItemSerializer
)


class CategoryViewSet(TenantModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']


class ProductViewSet(TenantModelViewSet):
    """
    Products viewset — readable by everyone (POS needs it), 
    writable only by admin/manager.
    """
    queryset = Product.objects.select_related('category').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['brand', 'model_name', 'barcode', 'color', 'storage_capacity']
    ordering_fields = ['brand', 'sale_price', 'stock_quantity', 'created_at']

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Return all products that are at or below low_stock_threshold."""
        qs = self.get_queryset().filter(stock_quantity__lte=models.F('low_stock_threshold'))
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def search_pos(self, request):
        """Fast search for POS: by name or barcode."""
        q = request.query_params.get('q', '').strip()
        if not q:
            return Response([])
        from django.db.models import Q
        qs = self.get_queryset().filter(
            Q(brand__icontains=q) |
            Q(model_name__icontains=q) |
            Q(barcode__iexact=q)
        )[:20]
        return Response(ProductSerializer(qs, many=True).data)


# Fix missing import
from django.db import models


class StockMovementViewSet(TenantModelViewSet):
    queryset = StockMovement.objects.select_related('product').all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class VendorViewSet(TenantModelViewSet):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']


class PurchaseOrderViewSet(TenantModelViewSet):
    queryset = PurchaseOrder.objects.select_related('vendor').prefetch_related('items').all()
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']


class PurchaseOrderItemViewSet(TenantModelViewSet):
    queryset = PurchaseOrderItem.objects.select_related('product', 'purchase_order').all()
    serializer_class = PurchaseOrderItemSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']
