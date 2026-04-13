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
    """
    Manager to globally apply tenant + soft-delete filtering.
    - Filters company_id from request thread.
    - Excludes is_deleted=True records from all queryset results.
    """
    def get_queryset(self):
        queryset = TenantQuerySet(self.model, using=self._db)
        # Always exclude soft-deleted records
        queryset = queryset.filter(is_deleted=False)
        # Apply tenant isolation
        company_id = get_current_company()
        if company_id:
            return queryset.filter(company_id=company_id)
        return queryset


class BaseModel(models.Model):
    """
    Abstract base model providing:
    - UUID primary key
    - Company foreign key (multi-tenant isolation)
    - Audit timestamps (created_at, updated_at)
    - Soft-delete flag (is_deleted) — use destroy() on viewsets, never hard-delete
    - TenantManager that auto-filters by company + is_deleted=False
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_related",
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    objects = TenantManager()

    class Meta:
        abstract = True
