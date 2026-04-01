"""
services/views.py
Complete 3-Phase Service Order Workflow
  Phase 1: Entry - create order (admin/manager/staff)
  Phase 2: Working - add parts, logs, media (technician + admin)
  Phase 3: Final - mark ready/delivered, process payment (cashier + admin)
"""
import logging
from django.utils import timezone
from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from erp_core.rbac import IsManagerOrAdmin, IsTechnician, IsCashier
from notifications.models import Notification
from .models import ServiceOrder, ServiceMedia, ServiceWorkLog, ServicePartUsed
from .serializers import (
    ServiceOrderSerializer, ServiceOrderListSerializer,
    ServiceMediaSerializer, ServiceWorkLogSerializer, ServicePartUsedSerializer
)

logger = logging.getLogger(__name__)


class ServiceOrderViewSet(TenantModelViewSet):
    """
    Main service order management.
    - List uses lightweight serializer.
    - Retrieve uses full serializer with nested logs/parts/media.
    """
    queryset = ServiceOrder.objects.select_related('technician').prefetch_related(
        'work_logs', 'parts_used', 'media'
    ).all()
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager', 'staff', 'cashier']
    allowed_reads = ['admin', 'manager', 'technician', 'cashier', 'staff']

    def get_serializer_class(self):
        if self.action == 'list':
            return ServiceOrderListSerializer
        return ServiceOrderSerializer

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(company_id=user.company_id, status='pending')
        logger.info(f"Service order created by {user.username}")

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Technicians only see their own assigned orders
        if getattr(user, 'role', None) == 'technician':
            qs = qs.filter(technician=user)
        return qs

    # -------------------------------------------------------
    # PHASE 2 ACTIONS: Working Phase
    # -------------------------------------------------------
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def assign_technician(self, request, pk=None):
        """Assign a technician to an order and move it to in_progress."""
        order = self.get_object()
        technician_id = request.data.get('technician_id')
        if not technician_id:
            return Response({'error': 'technician_id required'}, status=status.HTTP_400_BAD_REQUEST)

        order.technician_id = technician_id
        order.status = 'in_progress'
        if not order.start_time:
            order.start_time = timezone.now()
        order.save()

        Notification.objects.create(
            user_id=technician_id,
            company_id=order.company_id,
            title="New Service Assignment",
            message=f"Assigned to: {order.device_brand} {order.device_model} for {order.customer_name}"
        )
        logger.info(f"Technician {technician_id} assigned to service order {order.id}")
        return Response(ServiceOrderSerializer(order).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def update_status(self, request, pk=None):
        """Phase 2 & 3: Update order status with optional comment."""
        order = self.get_object()
        new_status = request.data.get('status')
        comments = request.data.get('comments', '')

        valid_statuses = dict(ServiceOrder.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
            return Response({'error': f'Invalid status. Use: {list(valid_statuses)}'}, status=400)

        order.status = new_status
        if comments:
            order.technician_comments = comments
        if new_status in ('ready', 'delivered', 'return') and not order.end_time:
            order.end_time = timezone.now()
            if order.start_time:
                diff = (order.end_time - order.start_time).total_seconds()
                order.hours_worked = round(diff / 3600.0, 2)

        order.save()

        # Log this status change
        ServiceWorkLog.objects.create(
            company_id=order.company_id,
            service_order=order,
            technician=request.user,
            status_change=new_status,
            notes=comments or f"Status updated to {new_status}"
        )
        logger.info(f"Service order {order.id} status → {new_status} by {request.user.username}")
        return Response(ServiceOrderSerializer(order).data)

    # -------------------------------------------------------
    # PHASE 3 ACTION: Final Payment
    # -------------------------------------------------------
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsCashier])
    @transaction.atomic
    def process_payment(self, request, pk=None):
        """
        Phase 3 final payment.
        Creates a Sale record linked to the service order and marks as paid.
        """
        order = self.get_object()
        if order.is_paid:
            return Response({'error': 'This order is already paid.'}, status=400)

        payment_method = request.data.get('payment_method', 'cash')
        final_amount = request.data.get('final_amount', order.estimated_cost)

        # Update order
        order.payment_method = payment_method
        order.final_amount = final_amount
        order.is_paid = True
        order.status = 'delivered'
        order.delivery_status = 'delivered'
        if not order.end_time:
            order.end_time = timezone.now()
        order.save()

        # Create a finance (Sale) record
        from sales.models import Sale, Customer
        customer, _ = Customer.objects.get_or_create(
            company_id=order.company_id,
            phone=order.customer_phone,
            defaults={'name': order.customer_name}
        )
        from sales.models import POSSession
        session = POSSession.objects.filter(cashier=request.user, status='OPEN').first()
        sale = Sale.objects.create(
            company_id=order.company_id,
            cashier=request.user,
            customer=customer,
            subtotal=final_amount,
            total_amount=final_amount,
            payment_method=payment_method,
            service_order=order,
            pos_session=session
        )

        logger.info(f"Service order {order.id} paid via {payment_method}. Sale created: {sale.id}")
        return Response({
            'status': 'paid',
            'sale_id': str(sale.id),
            'order': ServiceOrderSerializer(order).data
        })


class ServiceWorkLogViewSet(TenantModelViewSet):
    queryset = ServiceWorkLog.objects.select_related('technician').all()
    serializer_class = ServiceWorkLogSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            technician=self.request.user
        )


class ServicePartUsedViewSet(TenantModelViewSet):
    queryset = ServicePartUsed.objects.select_related('product', 'service_order').all()
    serializer_class = ServicePartUsedSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager', 'technician']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class ServiceMediaViewSet(TenantModelViewSet):
    """Phase 2: Handle image/video uploads for service evidence."""
    queryset = ServiceMedia.objects.select_related('service_order', 'uploaded_by').all()
    serializer_class = ServiceMediaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            uploaded_by=self.request.user
        )
