from django.db import models
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

    def __str__(self):
        return self.name

    class Meta(BaseModel.Meta):
        ordering = ['name']


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
