import random
from datetime import timedelta
from django.utils import timezone
from django.core.management.base import BaseCommand
from companies.models import Company
from accounts.models import User
from inventory.models import Category, Product
from subscriptions.models import SubscriptionPlan, CompanySubscription

class Command(BaseCommand):
    help = 'Seeds the database with a test tenant, products, and sales.'

    def handle(self, *args, **kwargs):
        self.stdout.write("Seeding the SaaS ERP Database...")

        # 1. Create a SaaS Subscription Plan
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name='Pro Plan',
            defaults={'price': 49.99, 'max_users': 10}
        )

        # 2. Create a Test Company
        company, _ = Company.objects.get_or_create(
            name='TechFix Mobile Shop',
            domain='techfix.localhost'
        )
        
        # 3. Apply Subscription
        CompanySubscription.objects.get_or_create(
            company=company, plan=plan,
            defaults={'start_date': timezone.now().date(), 'end_date': (timezone.now() + timedelta(days=365)).date()}
        )

        # 4. Create an Admin User (Give them staff access for Native Panel)
        user, created = User.objects.get_or_create(username='admin_techfix', defaults={'company': company, 'role': 'admin'})
        user.set_password('password123')
        user.is_staff = True
        user.is_superuser = True
        user.save()
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created user: {user.username} with pass: password123'))

        # 5. Create Inventory Categories
        cat_phones, _ = Category.objects.get_or_create(name='Smartphones', company=company)
        cat_acc, _ = Category.objects.get_or_create(name='Accessories', company=company)

        # 6. Seed Products
        if Product.objects.filter(company=company).count() == 0:
            products = [
                Product(company=company, category=cat_phones, brand='Apple', model_name='iPhone 14 Pro', price=999.00, stock_quantity=10),
                Product(company=company, category=cat_phones, brand='Samsung', model_name='Galaxy S23', price=899.00, stock_quantity=3),
                Product(company=company, category=cat_acc, brand='Anker', model_name='20W Charger', price=19.99, stock_quantity=50),
                Product(company=company, category=cat_acc, brand='Spigen', model_name='Tough Armor Case', price=14.99, stock_quantity=100)
            ]
            Product.objects.bulk_create(products)
            self.stdout.write(self.style.SUCCESS(f'Injected 4 products into {company.name} inventory.'))

        self.stdout.write(self.style.SUCCESS('Database seeding successful! You can now log into the Dashboard.'))
