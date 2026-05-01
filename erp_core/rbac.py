"""
erp_core/rbac.py
Complete RBAC permission classes for the multi-tenant ERP system.
Every class enforces both role AND company isolation.

Technician roles (v2):
  - hardware_technician: physical repairs
  - software_technician: OS / software fixes
"""
import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)

# All technician-like roles (used for filtering across the codebase)
TECHNICIAN_ROLES = ('hardware_technician', 'software_technician')

ROLE_HIERARCHY = {
    'super_admin':          5,
    'admin':                4,
    'manager':              3,
    'hardware_technician':  2,
    'software_technician':  2,
    'cashier':              1,
    'staff':                0,
}


def has_min_role(user, min_role):
    """Check if user has at least the minimum required role level."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    user_level = ROLE_HIERARCHY.get(user.role, 0)
    min_level = ROLE_HIERARCHY.get(min_role, 99)
    return user_level >= min_level


def is_technician(user):
    """Return True if the user is any kind of technician."""
    return getattr(user, 'role', '') in TECHNICIAN_ROLES


class IsSuperAdmin(BasePermission):
    """Only Django superusers (platform-level)."""
    message = "Super Admin access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsTenantAdmin(BasePermission):
    """Company Admin+ — full control within the company, or superuser."""
    message = "Company Admin access required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ('admin', 'super_admin')


class IsManagerOrAdmin(BasePermission):
    """Manager or Admin within company."""
    message = "Manager or Admin access required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        return request.user.role in ('admin', 'super_admin', 'manager')


# Explicit alias
IsTenantManagerOrAdmin = IsManagerOrAdmin


class IsTechnician(BasePermission):
    """Technicians (hardware OR software) — service-related access only."""
    message = "Technician role required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.role in (*TECHNICIAN_ROLES, 'admin', 'super_admin')


class IsCashier(BasePermission):
    """Cashier — POS and payment access. Also admin/manager allowed."""
    message = "Cashier role required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.role in ('cashier', 'admin', 'super_admin', 'manager')


class IsCompanyMember(BasePermission):
    """Any authenticated user belonging to a company."""
    message = "You must be a company member."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (request.user.company_id or request.user.is_superuser)
        )
