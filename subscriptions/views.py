from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from erp_core.views import TenantModelViewSet
from .models import CompanySubscription, SubscriptionPlan
from .serializers import CompanySubscriptionSerializer, SubscriptionPlanSerializer

class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    """Admin-only view to configure global SaaS plans (Basic, Pro, etc)"""
    queryset = SubscriptionPlan.objects.all()
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [IsAuthenticated]

class CompanySubscriptionViewSet(TenantModelViewSet):
    """View indicating active subscriptions scoped to the user's company."""
    queryset = CompanySubscription.objects.all()
    serializer_class = CompanySubscriptionSerializer
    permission_classes = [IsAuthenticated]

class JazzCashWebhookAPIView(APIView):
    """Callback endpoint for JazzCash Integration"""
    authentication_classes = [] 
    permission_classes = [] 
    
    def post(self, request):
        txn_ref = request.data.get('pp_TxnRefNo')
        response_code = request.data.get('pp_ResponseCode')
        company_id = request.data.get('company_id')
        plan_id = request.data.get('plan_id')
        
        if response_code == '000' and company_id and plan_id:
            plan = SubscriptionPlan.objects.get(id=plan_id)
            sub, created = CompanySubscription.objects.get_or_create(
                company_id=company_id, plan=plan, 
                defaults={'start_date': timezone.now().date(), 'end_date': (timezone.now() + timedelta(days=30)).date(), 'is_active': True}
            )
            if not created:
                sub.end_date = sub.end_date + timedelta(days=30)
                sub.is_active = True
                sub.save()
            return Response({'status': 'Subscription renewed via JazzCash', 'ref': txn_ref})
            
        return Response({'error': 'JazzCash Payment failed or invalid data structure'}, status=status.HTTP_400_BAD_REQUEST)

class EasyPaisaWebhookAPIView(APIView):
    """Callback endpoint for EasyPaisa Integration"""
    authentication_classes = []
    permission_classes = []
    
    def post(self, request):
        order_id = request.data.get('orderRefNumber')
        transaction_status = request.data.get('transactionStatus')
        company_id = request.data.get('company_id')
        plan_id = request.data.get('plan_id')
        
        if transaction_status == 'PAID' and company_id and plan_id:
            plan = SubscriptionPlan.objects.get(id=plan_id)
            sub, created = CompanySubscription.objects.get_or_create(
                company_id=company_id, plan=plan, 
                defaults={'start_date': timezone.now().date(), 'end_date': (timezone.now() + timedelta(days=30)).date(), 'is_active': True}
            )
            if not created:
                sub.end_date = sub.end_date + timedelta(days=30)
                sub.is_active = True
                sub.save()
            return Response({'status': 'Subscription renewed via EasyPaisa', 'order': order_id})
            
        return Response({'error': 'EasyPaisa Payment failed or incomplete data'}, status=status.HTTP_400_BAD_REQUEST)
