"""
sales/models.py
POS Sales, Customer Credit Ledger, and POS Session management.
FIXED: CustomerCreditLedger.save() now uses direct F() expressions and
       _base_manager to bypass TenantManager's company-scoped filtering
       which fails when called outside a request context.
"""
import logging
import decimal
from django.db import models, transaction
from django.db.models import F
from django.conf import settings
from erp_core.models import BaseModel
from inventory.models import Product
from services.models import ServiceOrder

logger = logging.getLogger(__name__)


class POSSession(BaseModel):
    STATUS_CHOICES = (('OPEN', 'Open'), ('CLOSED', 'Closed'))
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='OPEN')
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2)
    closing_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"Session {str(self.id)[:8]} - {self.cashier.username} ({self.status})"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class Customer(BaseModel):
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    email = models.EmailField(blank=True, null=True)
    # Running balance = total_credit - total_paid (positive = owes money)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_credit = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                       help_text='Total amount of credit (purchases) issued')
    total_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                     help_text='Total amount paid back by the customer')

    def recalculate_totals(self):
        """
        Re-aggregate totals from ledger entries. Call this to fix stale data.
        Uses _default_manager to bypass tenant scoping issues.
        """
        from django.db.models import Sum
        # Use the table-level query bypassing TenantManager via filter on customer FK
        qs = CustomerCreditLedger._default_manager.filter(
            customer_id=self.pk, is_deleted=False
        )
        self.total_credit = qs.filter(transaction_type='DEBIT').aggregate(
            s=Sum('amount'))['s'] or decimal.Decimal('0')
        self.total_paid = qs.filter(transaction_type='CREDIT').aggregate(
            s=Sum('amount'))['s'] or decimal.Decimal('0')
        self.balance = self.total_credit - self.total_paid
        Customer._default_manager.filter(pk=self.pk).update(
            total_credit=self.total_credit,
            total_paid=self.total_paid,
            balance=self.balance,
        )

    def __str__(self):
        return f"{self.name} ({self.phone or 'No Phone'}) - Bal: {self.balance}"

    class Meta(BaseModel.Meta):
        ordering = ['name']
        indexes = [
            models.Index(fields=['phone']),
        ]


class CustomerCreditLedger(BaseModel):
    """Chronological record of B2B credit/debit events for a customer."""
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='ledger_entries')
    sale = models.ForeignKey('Sale', on_delete=models.SET_NULL, null=True, blank=True)
    transaction_type = models.CharField(
        max_length=20,
        choices=(('DEBIT', 'Debit (Purchase on Credit)'), ('CREDIT', 'Credit (Payment Received)'))
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            try:
                # Use F() expressions + _default_manager to bypass TenantManager
                # This works even outside a request context (no company_id in thread)
                with transaction.atomic():
                    if self.transaction_type == 'DEBIT':
                        Customer._default_manager.filter(pk=self.customer_id).update(
                            total_credit=F('total_credit') + self.amount,
                            balance=F('balance') + self.amount,
                        )
                        logger.info(
                            f"[LEDGER] DEBIT +{self.amount} → Customer {self.customer_id} "
                            f"(total_credit & balance increased)"
                        )
                    else:
                        Customer._default_manager.filter(pk=self.customer_id).update(
                            total_paid=F('total_paid') + self.amount,
                            balance=F('balance') - self.amount,
                        )
                        logger.info(
                            f"[LEDGER] CREDIT -{self.amount} → Customer {self.customer_id} "
                            f"(total_paid increased, balance decreased)"
                        )
            except Exception as e:
                logger.error(f"[LEDGER] Failed to update Customer aggregates for entry {self.pk}: {e}")

    def __str__(self):
        return f"{self.transaction_type} {self.amount} for {self.customer.name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class Sale(BaseModel):
    PAYMENT_CHOICES = (
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('split', 'Split Payment'),
        ('credit', 'Credit'),
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='sales_processed'
    )
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchases'
    )

    # Financial tracking
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Payment
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default='cash')
    due_date = models.DateField(null=True, blank=True)
    split_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    split_card = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Links
    service_order = models.ForeignKey(
        ServiceOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales'
    )
    pos_session = models.ForeignKey(
        POSSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='sales'
    )

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            # Create credit ledger entry for B2B credit sales
            if self.payment_method == 'credit' and self.customer_id:
                ledger_entry = CustomerCreditLedger.objects.create(
                    company_id=self.company_id,
                    customer_id=self.customer_id,
                    sale=self,
                    transaction_type='DEBIT',
                    amount=self.total_amount,
                    notes=(
                        f"POS Credit Checkout #{str(self.id)[:8]} - "
                        f"{self.created_at.strftime('%d/%m/%Y') if self.created_at else ''} "
                        f"· Ref: SAL-{str(self.id)[:8].upper()}"
                    )
                )
                logger.info(
                    f"[SALE] Credit ledger entry created: {ledger_entry.id} for sale {self.id}"
                )

            # Auto-create Finance Journal Entry
            self._create_finance_entry()

    def _create_finance_entry(self):
        """Create a journal entry in the Finance module for this sale."""
        try:
            from finance.models import JournalEntry
            JournalEntry.objects.create(
                company_id=self.company_id,
                entry_type='REVENUE',
                amount=self.total_amount,
                profit=self.profit,
                reference=f"SALE-{str(self.id)[:8].upper()}",
                description=f"POS Sale by {self.cashier.username} | Method: {self.payment_method}"
            )
        except Exception as e:
            logger.warning(f"Finance journal entry failed for sale {self.id}: {e}")

    def __str__(self):
        return f"Sale {str(self.id)[:8].upper()} - PKR{self.total_amount}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class SaleItem(BaseModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.RESTRICT)
    quantity = models.IntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    @property
    def line_profit(self):
        return self.quantity * (self.unit_price - self.unit_cost)

    def __str__(self):
        return f"{self.quantity}x {self.product.model_name} in Sale {str(self.sale_id)[:8]}"

    class Meta(BaseModel.Meta):
        ordering = ['created_at']
