import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser, UserManager
from erp_core.middleware import get_current_company

class TenantUserManager(UserManager):
    """Overrides the default User manager to enforce physical multi-tenant data barriers."""
    def get_queryset(self):
        queryset = super().get_queryset()
        company_id = get_current_company()
        if company_id:
            return queryset.filter(company_id=company_id)
        return queryset

class User(AbstractUser):
    objects = TenantUserManager()
    """
    Custom user model for the entire SaaS application.
    Supports RBAC and assigns each user to a company (multi-tenancy).
    Superadmins won't strictly need a company_id.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, null=True, blank=True, related_name='users', db_index=True)
    
    ROLE_CHOICES = (
        ('super_admin', 'Super Admin'),
        ('admin', 'Company Admin'),
        ('manager', 'Manager'),
        ('technician', 'Technician'),
        ('cashier', 'Cashier'),
        ('staff', 'Staff'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='staff')

    class Meta:
        indexes = [
            models.Index(fields=['company', 'role']),
        ]

    def __str__(self):
        return f"{self.username} ({self.role}) - {self.company.name if self.company else 'SuperAdmin'}"
