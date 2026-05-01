"""
sales/serializers.py
FIXED:
  - Removed received_amount from serializer validation (wrong layer — POS view handles this)
  - SaleSerializer validates: total_amount == subtotal - discount_amount + tax_amount (rounding-safe)
  - CustomerSerializer computes totals from ledger entries
"""
import decimal
from rest_framework import serializers
from django.db.models import Sum
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession


class CustomerSerializer(serializers.ModelSerializer):
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
        return CustomerCreditLedger._default_manager.filter(
            customer_id=obj.pk, is_deleted=False
        )

    def get_total_credit(self, obj):
        total = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(s=Sum('amount'))['s']
        return float(total or 0)

    def get_total_paid(self, obj):
        total = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(s=Sum('amount'))['s']
        return float(total or 0)

    def get_balance(self, obj):
        credit = self._get_qs(obj).filter(transaction_type='DEBIT').aggregate(s=Sum('amount'))['s'] or 0
        paid   = self._get_qs(obj).filter(transaction_type='CREDIT').aggregate(s=Sum('amount'))['s'] or 0
        return float(credit - paid)


class CustomerCreditLedgerSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    sale_ref      = serializers.SerializerMethodField()

    class Meta:
        model = CustomerCreditLedger
        fields = [
            'id', 'company', 'customer', 'customer_name',
            'sale', 'sale_ref', 'transaction_type',
            'amount', 'notes', 'created_at',
        ]
        read_only_fields = ['company', 'customer_name', 'sale_ref']

    def get_sale_ref(self, obj):
        return f"SAL-{str(obj.sale_id)[:8].upper()}" if obj.sale_id else None


class POSSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSSession
        fields = '__all__'
        read_only_fields = ['cashier', 'company', 'start_time', 'end_time', 'status', 'difference']


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    line_total   = serializers.ReadOnlyField()
    line_profit  = serializers.ReadOnlyField()

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


    def validate(self, data):
        """
        Enforce: total_amount ≈ subtotal - discount_amount + tax_amount
        Generous tolerance (PKR 1.00) to handle float rounding from frontend JS.
        received_amount validation is handled at the VIEW level, not here.
        """
        subtotal        = decimal.Decimal(str(data.get('subtotal', 0) or 0))
        discount_amount = decimal.Decimal(str(data.get('discount_amount', 0) or 0))
        tax_amount      = decimal.Decimal(str(data.get('tax_amount', 0) or 0))
        total_amount    = decimal.Decimal(str(data.get('total_amount', 0) or 0))

        computed_total = subtotal - discount_amount + tax_amount

        # Auto-set total if not provided
        if total_amount == decimal.Decimal('0') and computed_total > 0:
            data['total_amount'] = computed_total
            return data

        # Reject only if difference > PKR 1.00 (prevents tampering, allows float rounding)
        if abs(computed_total - total_amount) > decimal.Decimal('1.00'):
            raise serializers.ValidationError(
                f"Calculation error: total ({total_amount}) does not match "
                f"subtotal ({subtotal}) - discount ({discount_amount}) + tax ({tax_amount}) = {computed_total}. "
                "Please refresh and retry."
            )

        # Use server-computed total
        data['total_amount'] = computed_total
        return data
