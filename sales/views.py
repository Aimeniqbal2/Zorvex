"""
sales/views.py
POS Sales System — atomic checkout with inventory deduction, profit tracking, and finance integration.
"""
import logging
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from rest_framework.exceptions import ValidationError
from erp_core.views import TenantModelViewSet
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession
from .serializers import SaleSerializer, SaleItemSerializer, CustomerSerializer, CustomerCreditLedgerSerializer, POSSessionSerializer

logger = logging.getLogger(__name__)


class CustomerViewSet(TenantModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class CustomerCreditLedgerViewSet(TenantModelViewSet):
    queryset = CustomerCreditLedger.objects.select_related('customer', 'sale').all()
    serializer_class = CustomerCreditLedgerSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class POSSessionViewSet(TenantModelViewSet):
    queryset = POSSession.objects.all()
    serializer_class = POSSessionSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        active = POSSession.objects.filter(cashier=self.request.user, status='OPEN').first()
        if active:
            raise ValidationError("You already have an active POS session. Please close it first.")
        serializer.save(cashier=self.request.user, company_id=self.request.user.company_id)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        session = self.get_object()
        if 'status' in request.data and request.data['status'] == 'CLOSED':
            if session.status == 'CLOSED':
                return Response({"error": "Session already closed"}, status=status.HTTP_400_BAD_REQUEST)

            closing_cash = request.data.get('closing_cash')
            if closing_cash is None:
                raise ValidationError("Closing cash amount is required to end the session.")

            from django.db.models import Sum
            total_sales = Sale.objects.filter(
                pos_session=session, payment_method='cash'
            ).aggregate(total=Sum('total_amount'))['total'] or 0
            expected = float(session.opening_cash) + float(total_sales)
            diff = float(closing_cash) - expected

            session.closing_cash = closing_cash
            session.difference = diff
            session.status = 'CLOSED'
            session.end_time = timezone.now()
            session.save()
            return Response(POSSessionSerializer(session).data)

        return super().update(request, *args, **kwargs)


class SaleViewSet(TenantModelViewSet):
    queryset = Sale.objects.select_related('cashier', 'customer', 'service_order').prefetch_related('items').all()
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager', 'cashier']
    allowed_reads = ['admin', 'manager', 'cashier']

    def perform_create(self, serializer):
        session = POSSession.objects.filter(cashier=self.request.user, status='OPEN').first()
        if not session:
            raise ValidationError("No active POS Session. Please open a session before transacting.")

        serializer.save(
            cashier=self.request.user,
            pos_session=session,
            company_id=self.request.user.company_id
        )


class SaleItemViewSet(TenantModelViewSet):
    queryset = SaleItem.objects.select_related('sale', 'product').all()
    serializer_class = SaleItemSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        with transaction.atomic():
            product = serializer.validated_data['product']
            quantity = serializer.validated_data.get('quantity', 1)

            if product.stock_quantity < quantity:
                raise ValidationError(
                    f"Insufficient stock for {product.brand} {product.model_name}. "
                    f"Available: {product.stock_quantity}"
                )

            # Capture cost_price at time of sale for profit calculation
            unit_cost = product.cost_price

            # Deduct inventory stock and record movement
            product.stock_quantity -= quantity
            product.save()

            from inventory.models import StockMovement
            sale = serializer.validated_data.get('sale')
            StockMovement.objects.create(
                company_id=self.request.user.company_id,
                product=product,
                quantity=quantity,
                movement_type='OUT',
                reference=f"SALE-{str(sale.id)[:8].upper()}" if sale else "",
                notes=f"POS Sale deduction"
            )

            # Save item with captured cost
            item = serializer.save(
                company_id=self.request.user.company_id,
                unit_cost=unit_cost
            )

            # Update profit on the parent sale
            sale = item.sale
            total_profit = sum(
                i.quantity * (i.unit_price - i.unit_cost)
                for i in sale.items.all()
            )
            sale.profit = total_profit
            sale.save(update_fields=['profit'])
            logger.info(f"SaleItem saved: {product.model_name} x{quantity} | Profit: {item.line_profit}")
