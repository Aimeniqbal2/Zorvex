from rest_framework import serializers
from django.db.models import Sum
from .models import Category, Product, StockMovement, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']
        read_only_fields = ['company']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    profit_per_unit = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_low_stock = serializers.BooleanField(read_only=True)
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'category',
            'category_name',
            'brand',
            'model_name',
            'color',
            'storage_capacity',
            'barcode',
            'issues',
            'cost_price',
            'sale_price',
            'service_price',
            'commission',
            'price',          # backward-compat property
            'stock_quantity',
            'low_stock_threshold',
            'profit_per_unit',
            'is_low_stock',
        ]
        read_only_fields = ['company']


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.model_name', read_only=True)

    class Meta:
        model = StockMovement
        fields = ['id', 'product', 'product_name', 'quantity', 'movement_type', 'reference', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class VendorSerializer(serializers.ModelSerializer):
    """
    Vendor with aggregates computed live from VendorLedger entries.
    Ensures correctness even when stored fields are stale.
    """
    total_purchases = serializers.SerializerMethodField()
    total_paid      = serializers.SerializerMethodField()
    balance_due     = serializers.SerializerMethodField()

    class Meta:
        model = Vendor
        fields = [
            'id', 'name', 'contact_email', 'contact_phone', 'address',
            'balance_due', 'total_purchases', 'total_paid',
            'created_at',
        ]
        read_only_fields = ['company', 'balance_due', 'total_purchases', 'total_paid']

    def _get_qs(self, obj):
        return VendorLedger._default_manager.filter(vendor_id=obj.pk, is_deleted=False)

    def get_total_purchases(self, obj):
        total = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(
            s=Sum('amount'))['s']
        return float(total or 0)

    def get_total_paid(self, obj):
        total = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(
            s=Sum('amount'))['s']
        return float(total or 0)

    def get_balance_due(self, obj):
        purch = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(
            s=Sum('amount'))['s'] or 0
        paid  = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(
            s=Sum('amount'))['s'] or 0
        return float(purch - paid)


class VendorLedgerSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = VendorLedger
        fields = ['id', 'vendor', 'vendor_name', 'transaction_type', 'amount',
                  'reference', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.model_name', read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_cost', 'total_cost']
        read_only_fields = ['company']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'vendor', 'vendor_name', 'status', 'total_amount', 'notes', 'items', 'created_at']
        read_only_fields = ['company', 'created_at']
