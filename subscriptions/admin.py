from django.contrib import admin
from .models import SubscriptionPlan, CompanySubscription

admin.site.register(SubscriptionPlan)
admin.site.register(CompanySubscription)
