from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from .models import Department, EmployeeRecord, Attendance
from .serializers import DepartmentSerializer, EmployeeRecordSerializer, AttendanceSerializer

class DepartmentViewSet(TenantModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]

class EmployeeRecordViewSet(TenantModelViewSet):
    queryset = EmployeeRecord.objects.all()
    serializer_class = EmployeeRecordSerializer
    permission_classes = [IsAuthenticated]

class AttendanceViewSet(TenantModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

