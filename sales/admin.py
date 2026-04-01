from django.contrib import admin
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession

@admin.register(POSSession)
class POSSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'status', 'opening_cash', 'closing_cash', 'start_time')
    list_filter = ('status', 'company')

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'customer', 'total_amount', 'payment_method', 'created_at')
    list_filter = ('payment_method', 'company')

@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'sale', 'product', 'quantity', 'unit_price')

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'email', 'company')

@admin.register(CustomerCreditLedger)
class CustomerCreditLedgerAdmin(admin.ModelAdmin):
    list_display = ('customer', 'amount', 'transaction_type', 'created_at')
