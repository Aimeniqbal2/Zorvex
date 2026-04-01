"""
finance/models.py
Finance module — tracks expenses, credit accounts, and auto-journal entries from sales/services.
"""
from django.db import models
from erp_core.models import BaseModel


class Expense(BaseModel):
    CATEGORY_CHOICES = (
        ('food', 'Food'),
        ('charity', 'Charity'),
        ('shop', 'Shop Utilities'),
        ('vendor', 'Vendor Payment'),
        ('salary', 'Salary'),
        ('other', 'Other'),
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    date = models.DateField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Expense: {self.title} - PKR{self.amount}"

    class Meta(BaseModel.Meta):
        ordering = ['-date']


class CreditAccount(BaseModel):
    """Tracks customers who buy or service on credit."""
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"Credit: {self.customer_name} (PKR{self.balance_due} due)"

    class Meta(BaseModel.Meta):
        ordering = ['customer_name']


class JournalEntry(BaseModel):
    """
    Auto-created finance ledger entry for every sale and service payment.
    This gives real-time P&L tracking without manual bookkeeping.
    """
    ENTRY_TYPES = (
        ('REVENUE', 'Revenue (Sale)'),
        ('SERVICE', 'Service Revenue'),
        ('EXPENSE', 'Expense'),
        ('ADJUSTMENT', 'Adjustment'),
    )
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=100, blank=True, help_text="Sale ID, Service ID, etc.")
    description = models.TextField(blank=True)
    date = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.entry_type} | PKR{self.amount} | Ref: {self.reference}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entry_type', 'date']),
        ]
