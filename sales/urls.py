from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, SaleItemViewSet, CustomerViewSet, CustomerCreditLedgerViewSet, POSSessionViewSet

router = DefaultRouter()
router.register(r'sales', SaleViewSet)
router.register(r'saleitems', SaleItemViewSet)
router.register(r'customers', CustomerViewSet)
router.register(r'ledger', CustomerCreditLedgerViewSet)
router.register(r'sessions', POSSessionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
