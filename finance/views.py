from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from django.db.models import Sum
from .models import Expense, CreditAccount, JournalEntry
from .serializers import ExpenseSerializer, CreditAccountSerializer, JournalEntrySerializer


class ExpenseViewSet(TenantModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'amount']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class CreditAccountViewSet(TenantModelViewSet):
    queryset = CreditAccount.objects.all()
    serializer_class = CreditAccountSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class JournalEntryViewSet(TenantModelViewSet):
    """
    Auto-populated P&L journal. Read-only for most roles.
    Only creates via Sale/Service signals.
    """
    queryset = JournalEntry.objects.all()
    serializer_class = JournalEntrySerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin']
    allowed_reads = ['admin', 'manager']
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['date', 'amount']
    http_method_names = ['get', 'head', 'options']  # Read-only

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Return total revenue, profit, and expense summary."""
        revenue = JournalEntry.objects.filter(
            entry_type__in=['REVENUE', 'SERVICE']
        ).aggregate(total=Sum('amount'), profit=Sum('profit'))
        expenses = Expense.objects.aggregate(total=Sum('amount'))
        return Response({
            'total_revenue': revenue['total'] or 0,
            'total_profit': revenue['profit'] or 0,
            'total_expenses': expenses['total'] or 0,
            'net': (revenue['total'] or 0) - (expenses['total'] or 0),
        })
