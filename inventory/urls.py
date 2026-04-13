from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet, StockMovementViewSet, VendorViewSet, VendorLedgerViewSet, PurchaseOrderViewSet, PurchaseOrderItemViewSet

router = DefaultRouter()
router.register(r'categorys', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'stockmovements', StockMovementViewSet)
router.register(r'vendors', VendorViewSet)
router.register(r'vendorledger', VendorLedgerViewSet)
router.register(r'purchaseorders', PurchaseOrderViewSet)
router.register(r'purchaseitems', PurchaseOrderItemViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
