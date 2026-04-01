import uuid
from django.db import models
from erp_core.models import BaseModel

class SubscriptionPlan(models.Model):
    """
    Global SaaS Plan. Does NOT inherit from BaseModel because 
    plans are provided by the SaaS owner globally to all companies.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    max_users = models.IntegerField(default=10)
    features = models.JSONField(default=dict)
    
    def __str__(self):
        return self.name

class CompanySubscription(BaseModel):
    """
    Tracks which plan a company is currently subscribed to.
    Inherits from BaseModel to automatically associate with the tenant company.
    """
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.RESTRICT)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.company.name} - {self.plan.name}"
