from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Integrates Employee role boundaries and physical tracking data natively into JWT matrix."""
    remember_me = serializers.BooleanField(default=False, required=False, write_only=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['company_id'] = str(user.company_id) if user.company_id else None
        return token

    def validate(self, attrs):
        # Must pop explicitly before DRF simplejwt's parent super().validate() complains about extra unexpected fields
        remember_me = attrs.pop('remember_me', False)
        
        data = super().validate(attrs)
        
        if remember_me:
            from datetime import timedelta
            # Gain raw access to the JWT primitive object bound to self.user
            refresh = self.get_token(self.user)
            refresh.set_exp(lifetime=timedelta(days=30))
            data['refresh'] = str(refresh)
            data['access'] = str(refresh.access_token)
            
        return data

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}
        }
        
    def create(self, validated_data):
        user = User(**validated_data)
        user.set_password(validated_data['password'])
        user.save()
        return user
