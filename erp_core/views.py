from django.shortcuts import render
from rest_framework import viewsets

def index_view(request):
    return render(request, 'index.html')

def dashboard_view(request):
    return render(request, 'dashboard.html')

def pos_view(request):
    return render(request, 'pos.html')

def inventory_view(request):
    return render(request, 'inventory.html')

def services_view(request):
    return render(request, 'services.html')

def service_logs_view(request):
    return render(request, 'service-logs.html')

def vendors_view(request):
    return render(request, 'vendors.html')

def credit_view(request):
    return render(request, 'credit.html')

def team_view(request):
    return render(request, 'team.html')

def sales_history_view(request):
    return render(request, 'sales-history.html')


class TenantModelViewSet(viewsets.ModelViewSet):
    """
    Base ViewSet for all tenant-specific models.
    Automatically assigns the logged-in user's company on record creation.
    (Read isolation is already handled by TenantManager globally via Middleware).
    """
    def perform_create(self, serializer):
        user = self.request.user
        if user and user.is_authenticated and getattr(user, 'company_id', None):
            serializer.save(company_id=user.company_id)
        else:
            serializer.save()

    def get_queryset(self):
        """
        Dynamically strips DRF's cached global module-load view scopes.
        Strictly forces ORM querysets to isolate to the active user's company payload.
        """
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
            
        if getattr(user, 'company_id', None):
            return qs.filter(company_id=user.company_id)
            
        # Admin / SaaS owners with no physical bound can inspect the full table if designed so
        if getattr(user, 'is_superuser', False):
            return qs
            
        return qs.none()
