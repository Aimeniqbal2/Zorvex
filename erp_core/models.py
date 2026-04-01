import uuid
from django.db import models
from erp_core.middleware import get_current_company

class TenantQuerySet(models.QuerySet):
    """QuerySet that automatically filters by the current thread's company if defined."""
    def filter_tenant(self):
        company_id = get_current_company()
        if company_id:
            return self.filter(company_id=company_id)
        return self

class TenantManager(models.Manager):
    """Manager to globally apply tenant filtering to prevent SaaS data leaks."""
    def get_queryset(self):
        # We auto-filter on every query if a company is active in the current request.
        # This completely isolates the data per tenant natively via the ORM.
        queryset = TenantQuerySet(self.model, using=self._db)
        company_id = get_current_company()
        if company_id:
            return queryset.filter(company_id=company_id)
        return queryset

class BaseModel(models.Model):
    """
    Abstract base model that provides UUID primary key, company relations, 
    audit timestamps, and tenant-aware isolation via TenantManager.
    All SaaS module models should inherit from this.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Using string reference to 'companies.Company' to avoid circular imports
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name="%(app_label)s_%(class)s_related", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()

    class Meta:
        abstract = True
