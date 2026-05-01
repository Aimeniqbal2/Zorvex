from django.urls import path
from .views import DashboardAPIView, ExportCSVAPIView, MonthlyAnalyticsAPIView

urlpatterns = [
    path('dashboard/', DashboardAPIView.as_view(), name='api-dashboard'),
    path('export/', ExportCSVAPIView.as_view(), name='api-export-csv'),
    path('monthly/', MonthlyAnalyticsAPIView.as_view(), name='api-monthly-analytics'),
]
