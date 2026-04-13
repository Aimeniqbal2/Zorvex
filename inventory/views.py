from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from .models import Category, Product, StockMovement, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem
from .serializers import (
    CategorySerializer, ProductSerializer, StockMovementSerializer,
    VendorSerializer, VendorLedgerSerializer, PurchaseOrderSerializer, PurchaseOrderItemSerializer
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
    allowed_reads = ['admin', 'manager', 'staff', 'technician']


class VendorLedgerViewSet(TenantModelViewSet):
    """View and record vendor payable transactions."""
    queryset = VendorLedger.objects.select_related('vendor').all()
    serializer_class = VendorLedgerSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'technician']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    def get_queryset(self):
        qs = super().get_queryset().order_by('-created_at')
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        return qs

    @action(detail=False, methods=['post'])
    def pay_vendor(self, request):
        """
        Record a payment to a vendor — creates a CREDIT entry and reduces balance.
        Payload: { vendor_id, amount, notes }
        """
        vendor_id = request.data.get('vendor_id')
        amount = request.data.get('amount')
        notes = request.data.get('notes', '')

        if not vendor_id or not amount:
            return Response({'error': 'vendor_id and amount required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            vendor = Vendor.objects.get(pk=vendor_id, company_id=request.user.company_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        import decimal
        amount_dec = decimal.Decimal(str(amount))
        # Create CREDIT ledger entry — VendorLedger.save() auto-updates balance_due/total_paid
        entry = VendorLedger.objects.create(
            company_id=request.user.company_id,
            vendor=vendor,
            transaction_type='CREDIT',
            amount=amount_dec,
            reference=f"PMT-{str(vendor.id)[:8].upper()}",
            notes=notes or f"Payment to {vendor.name}"
        )
        # Refresh vendor from DB to get updated balance_due after F() expressions
        vendor.refresh_from_db()
        return Response({
            'status': 'paid',
            'vendor_id':  str(vendor.id),
            'vendor_name': vendor.name,
            'balance_due': float(vendor.balance_due),
            'total_paid': float(vendor.total_paid),
            'total_purchases': float(vendor.total_purchases),
            'entry_id': str(entry.id)
        })

    @action(detail=False, methods=['post'])
    def recalculate_balances(self, request):
        """
        Admin utility: Re-aggregate all vendor balances from VendorLedger entries.
        POST /api/inventory/vendorledger/recalculate_balances/
        """
        from django.db.models import Sum
        company_id = request.user.company_id
        vendors = Vendor.objects.filter(company_id=company_id)
        fixed = 0
        for v in vendors:
            qs = VendorLedger._default_manager.filter(vendor_id=v.pk, is_deleted=False)
            total_purchases = qs.filter(transaction_type='DEBIT').aggregate(
                s=Sum('amount'))['s'] or 0
            total_paid = qs.filter(transaction_type='CREDIT').aggregate(
                s=Sum('amount'))['s'] or 0
            Vendor._default_manager.filter(pk=v.pk).update(
                total_purchases=total_purchases,
                total_paid=total_paid,
                balance_due=total_purchases - total_paid,
            )
            fixed += 1
        return Response({'status': 'ok', 'vendors_fixed': fixed})


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
