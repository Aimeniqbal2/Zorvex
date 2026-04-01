from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

class CustomUserAdmin(UserAdmin):
    """
    Extends the default Django UserAdmin to securely display and handle
    the custom 'company' and 'role' fields in the admin panel.
    """
    list_display = ('username', 'email', 'role', 'company', 'is_staff')
    list_filter = ('role', 'company', 'is_staff', 'is_superuser')
    search_fields = ('username', 'email')
    
    fieldsets = UserAdmin.fieldsets + (
        ('SaaS Multi-Tenant Info', {'fields': ('company', 'role')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('SaaS Multi-Tenant Info', {'fields': ('company', 'role')}),
    )

admin.site.register(User, CustomUserAdmin)
