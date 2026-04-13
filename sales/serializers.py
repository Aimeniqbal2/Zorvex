"""
sales/serializers.py
FIXED: CustomerSerializer now computes total_credit, total_paid, balance
       dynamically from ledger entries so even stale stored data shows correctly.
"""
from rest_framework import serializers
from django.db.models import Sum
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession


class CustomerSerializer(serializers.ModelSerializer):
    """
    Customer representation — aggregates computed live from ledger entries.
    This ensures correctness even when stored fields are stale
    (e.g. entries created before the F() fix was deployed).
    """
    total_credit = serializers.SerializerMethodField()
    total_paid   = serializers.SerializerMethodField()
    balance      = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            'id', 'company', 'name', 'phone', 'email',
            'balance', 'total_credit', 'total_paid',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['company', 'balance', 'total_credit', 'total_paid']

    def _get_qs(self, obj):
        """Shared queryset for ledger entries — bypasses TenantManager scoping."""
        return CustomerCreditLedger._default_manager.filter(
            customer_id=obj.pk, is_deleted=False
        )

    def get_total_credit(self, obj):
        total = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(
            s=Sum('amount'))['s']
        return float(total or 0)

    def get_total_paid(self, obj):
        total = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(
            s=Sum('amount'))['s']
        return float(total or 0)

    def get_balance(self, obj):
        credit = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(
            s=Sum('amount'))['s'] or 0
        paid   = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(
            s=Sum('amount'))['s'] or 0
        return float(credit - paid)


class CustomerCreditLedgerSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    sale_ref = serializers.SerializerMethodField()

    class Meta:
        model = CustomerCreditLedger
        fields = [
            'id', 'company', 'customer', 'customer_name',
            'sale', 'sale_ref', 'transaction_type',
            'amount', 'notes', 'created_at',
        ]
        read_only_fields = ['company', 'customer_name', 'sale_ref']

    def get_sale_ref(self, obj):
        if obj.sale_id:
            return f"SAL-{str(obj.sale_id)[:8].upper()}"
        return None


class POSSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSSession
        fields = '__all__'
        read_only_fields = ['cashier', 'company', 'start_time', 'end_time', 'status', 'difference']


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    line_total = serializers.ReadOnlyField()
    line_profit = serializers.ReadOnlyField()

    class Meta:
        model = SaleItem
        fields = '__all__'
        read_only_fields = ['company', 'unit_cost']

    def get_product_name(self, obj):
        return f"{obj.product.brand} {obj.product.model_name}" if obj.product else None


class SaleSerializer(serializers.ModelSerializer):
    customer_info = CustomerSerializer(source='customer', read_only=True)
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['cashier', 'company', 'profit']
