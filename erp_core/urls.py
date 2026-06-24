from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import CustomTokenObtainPairView
from erp_core.search_views import GlobalSearchView
from django.views.generic import TemplateView
from erp_core import views

urlpatterns = [
    # PWA Service Worker (Served at root level)
    path('sw.js', TemplateView.as_view(template_name='sw.js', content_type='application/javascript'), name='sw.js'),
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
    path('analytics/', views.analytics_view, name='analytics'),


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
]

# Serve media files in all environments (including DEBUG=False)
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
