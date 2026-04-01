from rest_framework import serializers
from .models import SubscriptionPlan, CompanySubscription

class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = '__all__'

class CompanySubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySubscription
        fields = '__all__'

