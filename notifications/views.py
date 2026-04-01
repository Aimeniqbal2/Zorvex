from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(TenantModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

