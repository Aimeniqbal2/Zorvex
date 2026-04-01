from rest_framework import serializers
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'
        read_only_fields = ['company']

class CustomerCreditLedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerCreditLedger
        fields = '__all__'
        read_only_fields = ['company']

class POSSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSSession
        fields = '__all__'
        read_only_fields = ['cashier', 'company', 'start_time', 'end_time', 'status', 'difference']

class SaleSerializer(serializers.ModelSerializer):
    customer_info = CustomerSerializer(source='customer', read_only=True)
    class Meta:
        model = Sale
        fields = '__all__'
        read_only_fields = ['cashier', 'company']

class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = '__all__'
        read_only_fields = ['company']

