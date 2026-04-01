from django.db.models import Sum
from sales.models import Sale
from services.models import ServiceOrder
from finance.models import Expense
from erp_core.middleware import get_current_company

class ProfitCalculationService:
    @staticmethod
    def get_net_profit(start_date=None, end_date=None, company_id=None):
        if not company_id:
            company_id = get_current_company()
            
        if not company_id:
            return {'revenue': 0, 'expenses': 0, 'profit': 0}
            
        sales = Sale.objects.filter(company_id=company_id)
        services = ServiceOrder.objects.filter(company_id=company_id, status__in=['ready', 'delivered'])
        expenses = Expense.objects.filter(company_id=company_id)
        
        if start_date and end_date:
            sales = sales.filter(created_at__date__range=[start_date, end_date])
            services = services.filter(end_time__date__range=[start_date, end_date])
            expenses = expenses.filter(date__range=[start_date, end_date])

        sales_rev = sales.aggregate(total=Sum('total_amount'))['total'] or 0
        services_rev = services.aggregate(total=Sum('estimated_cost'))['total'] or 0
        total_rev = sales_rev + services_rev
        
        total_exp = expenses.aggregate(total=Sum('amount'))['total'] or 0
        
        return {
            'revenue': float(total_rev),
            'expenses': float(total_exp),
            'profit': float(total_rev - total_exp)
        }
