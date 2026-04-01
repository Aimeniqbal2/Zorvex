from rest_framework import viewsets

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
