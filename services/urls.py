from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ServiceOrderViewSet, ServiceMediaViewSet, ServiceWorkLogViewSet, ServicePartUsedViewSet, TechnicianListView

router = DefaultRouter()
router.register(r'serviceorders', ServiceOrderViewSet)
router.register(r'servicemedias', ServiceMediaViewSet)
router.register(r'servicelogs', ServiceWorkLogViewSet)
router.register(r'serviceparts', ServicePartUsedViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # Standalone technician list for assignment modal (admin only)
    path('technicians/', TechnicianListView.as_view({'get': 'list'})),
]
