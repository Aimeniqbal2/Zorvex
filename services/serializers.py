from rest_framework import serializers
from .models import ServiceOrder, ServiceMedia, ServiceWorkLog, ServicePartUsed


class ServiceWorkLogSerializer(serializers.ModelSerializer):
    technician_name = serializers.CharField(source='technician.get_full_name', read_only=True)
    technician_username = serializers.CharField(source='technician.username', read_only=True)

    class Meta:
        model = ServiceWorkLog
        fields = ['id', 'service_order', 'technician', 'technician_name', 'technician_username',
                  'status_change', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class ServicePartUsedSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='get_product_name', read_only=True)
    product_brand = serializers.CharField(source='product.brand', read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ServicePartUsed
        fields = ['id', 'service_order', 'source', 'product', 'part_name', 'product_name', 'product_brand',
                  'quantity', 'unit_cost', 'total_cost', 'created_at']
        read_only_fields = ['company', 'created_at']


class ServiceMediaSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True)

    class Meta:
        model = ServiceMedia
        fields = ['id', 'service_order', 'file', 'media_type', 'caption',
                  'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['company', 'created_at']


class ServiceOrderSerializer(serializers.ModelSerializer):
    technician_name = serializers.CharField(source='technician.get_full_name', read_only=True)
    work_logs = ServiceWorkLogSerializer(many=True, read_only=True)
    parts_used = ServicePartUsedSerializer(many=True, read_only=True)
    media = ServiceMediaSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceOrder
        fields = [
            'id', 'company',
            # Phase 1 - Entry
            'customer_name', 'customer_phone',
            'device_brand', 'device_model', 'device_color', 'device_imei',
            'quantity', 'screen_condition', 'screen_condition_notes', 'device_appearance',
            'issues', 'department', 'technician', 'technician_name',
            'estimated_cost', 'estimated_minutes', 'technician_comments_initial', 'commission',
            # Phase 2 - Working
            'technician_comments', 'work_logs', 'parts_used', 'media',
            # Phase 3 - Final
            'status', 'delivery_status', 'payment_method', 'final_amount', 'is_paid',
            # Timing
            'start_time', 'end_time', 'hours_worked',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['company', 'created_at', 'updated_at']


class ServiceOrderListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views (no nested objects)."""
    technician_name = serializers.CharField(source='technician.get_full_name', read_only=True)

    class Meta:
        model = ServiceOrder
        fields = [
            'id', 'customer_name', 'customer_phone',
            'device_brand', 'device_model',
            'status', 'department', 'technician_name',
            'estimated_cost', 'is_paid', 'created_at',
        ]
