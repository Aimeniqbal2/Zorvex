from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import CustomTokenObtainPairView
from erp_core.search_views import GlobalSearchView
from erp_core import views

urlpatterns = [
    # Frontend Views (Templates)
    path('', views.dashboard_view, name='dashboard'),
    path('login/', views.index_view, name='login'),
    path('pos/', views.pos_view, name='pos'),
    path('inventory/', views.inventory_view, name='inventory'),
    path('services/', views.services_view, name='services'),
    path('service-logs/', views.service_logs_view, name='service_logs'),
    path('vendors/', views.vendors_view, name='vendors'),
    path('credit/', views.credit_view, name='credit'),
    path('team/', views.team_view, name='team'),
    path('transactions/', views.sales_history_view, name='transactions'),

    path('admin/', admin.site.urls),
    
    # JWT Auth Endpoints
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # ERP Module Endpoints
    path('api/companies/', include('companies.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/subscriptions/', include('subscriptions.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/services/', include('services.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/hrm/', include('hrm.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/reports/', include('reports.urls')),

    # Global cross-module search
    path('api/search/', GlobalSearchView.as_view(), name='global_search'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
