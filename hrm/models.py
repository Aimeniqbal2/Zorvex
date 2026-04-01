from django.db import models
from django.conf import settings
from erp_core.models import BaseModel

class Department(BaseModel):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class EmployeeRecord(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='employee_profile')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, related_name='employees')
    salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    def __str__(self):
        return f"Employee details for {self.user.username}"

class Attendance(BaseModel):
    employee = models.ForeignKey(EmployeeRecord, on_delete=models.CASCADE, related_name='attendance_records')
    date = models.DateField()
    check_in = models.TimeField(null=True, blank=True)
    check_out = models.TimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.employee.user.username} on {self.date}"
