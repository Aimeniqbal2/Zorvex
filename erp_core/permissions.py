import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class RolePermission(BasePermission):
    """
    Dynamic role-based permission class.
    Views set `allowed_roles` list attribute to control who can write.
    GET requests are allowed for admin, manager, cashier, and technician by default.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        role = getattr(request.user, 'role', None)

        # Superadmin check by role field
        if role == 'super_admin':
            return True

        # For safe GET methods — allow all authenticated company members
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            allowed_reads = getattr(view, 'allowed_reads', ['admin', 'manager', 'cashier', 'technician', 'staff'])
            allowed = role in allowed_reads
            if not allowed:
                logger.warning(f"Role {role} blocked from GET on {view.__class__.__name__}")
            return allowed

        # For write methods — check specific allowed_roles
        allowed_roles = getattr(view, 'allowed_roles', ['admin'])
        allowed = role in allowed_roles
        if not allowed:
            logger.warning(f"Role {role} blocked from {request.method} on {view.__class__.__name__}")
        return allowed