from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DepartmentViewSet, EmployeeRecordViewSet, AttendanceViewSet

router = DefaultRouter()
router.register(r'departments', DepartmentViewSet)
router.register(r'employeerecords', EmployeeRecordViewSet)
router.register(r'attendances', AttendanceViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
