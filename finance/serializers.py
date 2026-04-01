from rest_framework import serializers
from .models import Expense, CreditAccount, JournalEntry


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'title', 'amount', 'category', 'date', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class CreditAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditAccount
        fields = ['id', 'customer_name', 'customer_phone', 'balance_due', 'created_at']
        read_only_fields = ['company', 'created_at']


class JournalEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalEntry
        fields = ['id', 'entry_type', 'amount', 'profit', 'reference', 'description', 'date', 'created_at']
        read_only_fields = ['company', 'created_at']
