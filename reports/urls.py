from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DashboardAPIView, ExportCSVAPIView

# The standard router handles standard CRUD views, while these specialized views map manually.
urlpatterns = [
    path('dashboard/', DashboardAPIView.as_view(), name='api-dashboard'),
    path('export/', ExportCSVAPIView.as_view(), name='api-export-csv'),
]
