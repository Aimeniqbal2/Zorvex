from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from .models import Company
from .serializers import CompanySerializer

class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated]

