from django.contrib import admin
from .models import Department, EmployeeRecord, Attendance

admin.site.register(Department)
admin.site.register(EmployeeRecord)
admin.site.register(Attendance)
