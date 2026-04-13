"""
services/views.py
Complete 3-Phase Service Order Workflow
  Phase 1:   Entry     - create order (admin/manager/staff)
  Phase 1b:  Assign    - admin assigns a specific technician
  Phase 2:   Working   - technician starts phase, adds parts/logs/media
  Phase 3:   Final     - mark ready/delivered, process payment (cashier + admin)
"""
import logging
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
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

User = get_user_model()
logger = logging.getLogger(__name__)


class ServiceOrderViewSet(TenantModelViewSet):
    """
    Main service order management.
    - List uses lightweight serializer.
    - Retrieve uses full serializer with nested logs/parts/media.
    - Technicians see ONLY their assigned orders.
    - Admins/managers see ALL orders.
    """
    queryset = ServiceOrder.objects.select_related(
        'technician', 'assigned_technician'
    ).prefetch_related('work_logs', 'parts_used', 'media').all()
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
        # Role-based data isolation: technicians see ONLY assigned orders
        if getattr(user, 'role', None) == 'technician':
            qs = qs.filter(assigned_technician=user)
        return qs

    # -------------------------------------------------------
    # PHASE 1b ACTION: Assign Technician (Admin only)
    # -------------------------------------------------------
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManagerOrAdmin])
    def assign_technician(self, request, pk=None):
        """
        Admin assigns a technician to a service order.
        Must be called BEFORE technician can start the technical phase.
        Sends a push notification to the assigned technician.
        """
        order = self.get_object()
        technician_id = request.data.get('technician_id')
        if not technician_id:
            return Response({'error': 'technician_id required'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate the user exists and is a technician in this company
        try:
            tech = User.objects.get(pk=technician_id, company_id=request.user.company_id, role='technician')
        except User.DoesNotExist:
            return Response({'error': 'Technician not found in this company'}, status=status.HTTP_404_NOT_FOUND)

        order.assigned_technician = tech
        # Also set legacy technician field for backward compat
        order.technician = tech
        order.save(update_fields=['assigned_technician', 'technician'])

        # Notify the technician
        Notification.objects.create(
            user=tech,
            company_id=order.company_id,
            title="New Service Assignment",
            message=f"You have been assigned: {order.device_brand} {order.device_model} for {order.customer_name}"
        )
        logger.info(f"Technician {tech.username} assigned to service order {order.id} by {request.user.username}")
        return Response(ServiceOrderSerializer(order).data)

    # -------------------------------------------------------
    # PHASE 2 ACTION: Start Technical Phase (Assigned tech or Admin)
    # -------------------------------------------------------
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def start_technical_phase(self, request, pk=None):
        """
        Technician clicks 'Start Technical Phase'.
        Gates the injection of parts/logs/media behind this flag.
        Only the assigned technician (or admin) can trigger this.
        """
        order = self.get_object()
        user = request.user

        # Permission check: must be assigned tech or admin/manager
        is_admin = getattr(user, 'role', '') in ('admin', 'manager', 'super_admin')
        is_assigned = order.assigned_technician_id and str(order.assigned_technician_id) == str(user.pk)
        if not is_admin and not is_assigned:
            return Response(
                {'error': 'Only the assigned technician or an admin can start the technical phase.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if order.technical_phase_started:
            return Response({'message': 'Technical phase already started.'}, status=status.HTTP_200_OK)

        if not order.assigned_technician_id:
            return Response(
                {'error': 'A technician must be assigned before starting the technical phase.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        order.technical_phase_started = True
        order.technical_phase_started_at = timezone.now()
        order.status = 'in_progress'
        if not order.start_time:
            order.start_time = timezone.now()
        order.save(update_fields=['technical_phase_started', 'technical_phase_started_at',
                                   'status', 'start_time'])

        # Auto-log the event
        ServiceWorkLog.objects.create(
            company_id=order.company_id,
            service_order=order,
            technician=user,
            status_change='in_progress',
            notes=f"Technical phase started by {user.username}"
        )
        logger.info(f"Technical phase started on order {order.id} by {user.username}")
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


class TechnicianListView(TenantModelViewSet):
    """
    Read-only endpoint exposing technician users for admin's assignment modal.
    GET /api/services/technicians/
    """
    queryset = User.objects.none()
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]

    def list(self, request, *args, **kwargs):
        company_id = request.user.company_id
        techs = User.objects.filter(company_id=company_id, role='technician').values(
            'id', 'username', 'first_name', 'last_name', 'email'
        )
        data = [
            {
                'id': str(t['id']),
                'username': t['username'],
                'full_name': f"{t['first_name']} {t['last_name']}".strip() or t['username'],
                'email': t['email'],
            }
            for t in techs
        ]
        return Response(data)


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
    queryset = ServicePartUsed.objects.select_related('product', 'vendor', 'service_order').all()
    serializer_class = ServicePartUsedSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager', 'technician']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class ServiceMediaViewSet(TenantModelViewSet):
    """Phase 2: Handle image/video uploads for service evidence (local storage)."""
    queryset = ServiceMedia.objects.select_related('service_order', 'uploaded_by').all()
    serializer_class = ServiceMediaSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            uploaded_by=self.request.user
        )
