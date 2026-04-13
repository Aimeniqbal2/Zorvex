from django.db import models, transaction
from erp_core.models import BaseModel


class Category(BaseModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Categories"
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(BaseModel):
    """
    Core product/item record for inventory.
    Covers both physical goods for sale and spare parts used in repairs.
    """
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    brand = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100)
    color = models.CharField(max_length=50, blank=True)
    storage_capacity = models.CharField(max_length=50, blank=True, help_text="e.g. 128GB, 256GB")
    barcode = models.CharField(max_length=100, blank=True, db_index=True, help_text="Barcode/SKU for scanner input")

    # Pricing
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Purchase cost")
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Retail sale price")
    service_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Service/repair price charged to customer")
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Staff commission per unit sold")

    # Keep legacy `price` as a computed property for backward compat
    @property
    def price(self):
        return self.sale_price

    # Stock
    stock_quantity = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5, help_text="Alert when stock falls below this level")

    # Optional notes
    issues = models.TextField(blank=True, help_text="Known issues or product description notes")

    @property
    def profit_per_unit(self):
        return self.sale_price - self.cost_price

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.low_stock_threshold

    def __str__(self):
        return f"{self.brand} {self.model_name} ({self.storage_capacity}) - Stock: {self.stock_quantity}"

    class Meta(BaseModel.Meta):
        ordering = ['brand', 'model_name']
        indexes = [
            models.Index(fields=['brand', 'model_name']),
            models.Index(fields=['barcode']),
        ]


class StockMovement(BaseModel):
    MOVEMENT_TYPES = (('IN', 'Stock In'), ('OUT', 'Stock Out'), ('ADJUST', 'Adjustment'))
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='movements')
    quantity = models.IntegerField()
    movement_type = models.CharField(max_length=10, choices=MOVEMENT_TYPES)
    reference = models.CharField(max_length=100, blank=True, help_text="Invoice/PO/Service Order reference")
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.movement_type} {self.quantity} for {self.product.model_name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class Vendor(BaseModel):
    name = models.CharField(max_length=200)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    # Running payable balance — increases when parts ordered, decreases on payment
    balance_due = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Current amount owed to this vendor (total_purchases - total_paid)'
    )
    total_purchases = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cumulative value of all parts/services ordered from vendor'
    )
    total_paid = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cumulative amount paid back to this vendor'
    )

    # Legacy alias — kept for backward compat with any code using vendor.balance
    @property
    def balance(self):
        return self.balance_due

    def __str__(self):
        return f"{self.name} (Payable: PKR {self.balance_due})"

    class Meta(BaseModel.Meta):
        ordering = ['name']


class VendorLedger(BaseModel):
    """Chronological record of all payable/payment transactions for a vendor."""
    TRANSACTION_TYPES = (
        ('DEBIT', 'Debit (Part/Service Ordered)'),
        ('CREDIT', 'Credit (Payment Made to Vendor)'),
    )
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='ledger_entries')
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            import logging
            from django.db.models import F
            logger = logging.getLogger(__name__)
            try:
                with transaction.atomic():
                    if self.transaction_type == 'DEBIT':
                        # Parts/service ordered from vendor — amount owed increases
                        Vendor._default_manager.filter(pk=self.vendor_id).update(
                            total_purchases=F('total_purchases') + self.amount,
                            balance_due=F('balance_due') + self.amount,
                        )
                        logger.info(
                            f"[VENDOR LEDGER] DEBIT +{self.amount} → Vendor {self.vendor_id} "
                            f"(total_purchases & balance_due increased)"
                        )
                    else:
                        # Payment made to vendor — amount owed decreases
                        Vendor._default_manager.filter(pk=self.vendor_id).update(
                            total_paid=F('total_paid') + self.amount,
                            balance_due=F('balance_due') - self.amount,
                        )
                        logger.info(
                            f"[VENDOR LEDGER] CREDIT -{self.amount} → Vendor {self.vendor_id} "
                            f"(total_paid increased, balance_due decreased)"
                        )
            except Exception as e:
                logger.error(f"[VENDOR LEDGER] Failed to update Vendor aggregates for entry {self.pk}: {e}")

    def __str__(self):
        return f"{self.transaction_type} PKR{self.amount} - {self.vendor.name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class PurchaseOrder(BaseModel):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('ORDERED', 'Ordered'),
        ('RECEIVED', 'Received'),
        ('CANCELLED', 'Cancelled')
    )
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='purchase_orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old_status = PurchaseOrder.objects.using(self._state.db).get(pk=self.pk).status
                if old_status != 'RECEIVED' and self.status == 'RECEIVED':
                    for item in self.items.select_related('product').all():
                        item.product.stock_quantity += item.quantity
                        item.product.cost_price = item.unit_cost
                        item.product.save()
                        StockMovement.objects.create(
                            company_id=self.company_id,
                            product=item.product,
                            quantity=item.quantity,
                            movement_type='IN',
                            reference=f"PO-{self.id}",
                            notes=f"Auto-received from Purchase Order {self.id}"
                        )
            except PurchaseOrder.DoesNotExist:
                pass
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PO-{str(self.id)[:8].upper()} | {self.vendor.name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class PurchaseOrderItem(BaseModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost

    def __str__(self):
        return f"{self.quantity}x {self.product.model_name} @ {self.unit_cost}"
