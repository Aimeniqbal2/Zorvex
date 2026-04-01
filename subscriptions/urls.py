from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubscriptionPlanViewSet, CompanySubscriptionViewSet, JazzCashWebhookAPIView, EasyPaisaWebhookAPIView

router = DefaultRouter()
router.register(r'plans', SubscriptionPlanViewSet)
router.register(r'companysubscriptions', CompanySubscriptionViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('webhook/jazzcash/', JazzCashWebhookAPIView.as_view(), name='webhook-jazzcash'),
    path('webhook/easypaisa/', EasyPaisaWebhookAPIView.as_view(), name='webhook-easypaisa'),
]
