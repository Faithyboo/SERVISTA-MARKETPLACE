from decimal import Decimal

from .models import Transaction, Wallet


def transaction_balance_effect(transaction):
    amount = Decimal(transaction.amount)
    if transaction.type in {'topup', 'refund'}:
        return amount
    if transaction.type == 'payment':
        booking = transaction.booking
        if booking and transaction.wallet.user_id == booking.client_id:
            return -amount
        return amount
    return Decimal('0.00')


def reconcile_wallet_balance(wallet):
    transactions = Transaction.objects.select_related('booking', 'wallet__user').filter(wallet=wallet)
    expected_balance = sum((transaction_balance_effect(tx) for tx in transactions), Decimal('0.00'))
    if wallet.balance != expected_balance:
        wallet.balance = expected_balance
        wallet.save(update_fields=['balance', 'updated_at'])
    return wallet


def get_reconciled_wallet(user):
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return reconcile_wallet_balance(wallet)
