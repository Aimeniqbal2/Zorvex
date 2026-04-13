from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.response import Response


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
    - Automatically assigns the logged-in user's company on record creation.
    - Soft-deletes on destroy() — sets is_deleted=True instead of hard DELETE.
    - Read isolation handled by TenantManager + is_deleted filter globally.
    """
    def perform_create(self, serializer):
        user = self.request.user
        if user and user.is_authenticated and getattr(user, 'company_id', None):
            serializer.save(company_id=user.company_id)
        else:
            serializer.save()

    def get_queryset(self):
        """
        Forces all queries to be scoped to the authenticated user's company.
        is_deleted=False is handled automatically by TenantManager.
        """
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()

        if getattr(user, 'company_id', None):
            return qs.filter(company_id=user.company_id)

        if getattr(user, 'is_superuser', False):
            return qs

        return qs.none()

    def destroy(self, request, *args, **kwargs):
        """
        Soft delete — sets is_deleted=True rather than issuing a SQL DELETE.
        Financial history (Sales, Ledger entries) remains intact for reporting.
        """
        instance = self.get_object()
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted', 'updated_at'])
        return Response(
            {'status': 'deleted', 'id': str(instance.id)},
            status=status.HTTP_200_OK
        )
