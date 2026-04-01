from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ExpenseViewSet, CreditAccountViewSet, JournalEntryViewSet

router = DefaultRouter()
router.register(r'expenses', ExpenseViewSet)
router.register(r'creditaccounts', CreditAccountViewSet)
router.register(r'journal', JournalEntryViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
