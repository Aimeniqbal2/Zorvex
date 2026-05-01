"""
Data migration: Migrate all users with role='technician' to 'hardware_technician'.
This runs after the schema migration (0004) that adds the new role choices.
"""
from django.db import migrations


def migrate_technicians_to_hardware(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    updated = User.objects.filter(role='technician').update(role='hardware_technician')
    print(f"[DATA MIGRATION] Migrated {updated} technician(s) -> hardware_technician")


def reverse_migration(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='hardware_technician').update(role='technician')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_split_technician_roles'),
    ]

    operations = [
        migrations.RunPython(
            migrate_technicians_to_hardware,
            reverse_code=reverse_migration,
        ),
    ]
