from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.views import TokenObtainPairView
from subscriptions.models import CompanySubscription
from .models import User
from .serializers import UserSerializer, CustomTokenObtainPairSerializer

class CustomTokenObtainPairView(TokenObtainPairView):
    """Enables generating our cryptographically complex role-embedded API tokens natively."""
    serializer_class = CustomTokenObtainPairSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return User.objects.none()
        
        # Superusers can see all if they physically aren't bound, but when natively testing an active tenancy, bind them securely.
        if user.company_id:
            return User.objects.filter(company_id=user.company_id)
        if user.is_superuser:
            return User.objects.all()
        return User.objects.none()

    def get_permissions(self):
        """
        Locks HR generation/destruction specifically to Admins.
        Permits safe Read-Only listing for dropdown assignments natively elsewhere.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            from erp_core.rbac import IsTenantAdmin
            return [IsAuthenticated(), IsTenantAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        company_id = getattr(user, 'company_id', None)
        
        if user.is_authenticated and company_id:
            # Check SaaS Subscription limits
            active_sub = CompanySubscription.objects.filter(company_id=company_id, is_active=True).first()
            if active_sub:
                max_users = active_sub.plan.max_users
                current_users = User.objects.filter(company_id=company_id).count()
                if current_users >= max_users:
                    raise PermissionDenied(f"Plan limit reached! Max {max_users} users allowed on the '{active_sub.plan.name}' plan.")
            
            serializer.save(company_id=company_id)
        else:
            # Fallback for superadmin or unassociated users
            serializer.save()
