from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.payments import payments_bp
from app.models.models import Payment, Sale, Customer, PaymentMethod
from app.extensions import db
from app.utils.helpers import write_audit, ref
from app.utils.decorators import permission_required


@payments_bp.route('/')
@login_required
@permission_required('payments.manage')
def index():
    payments = Payment.query.order_by(Payment.created_at.desc()).limit(200).all()
    return render_template('payments/index.html', payments=payments)


@payments_bp.route('/record/<int:sale_id>', methods=['GET', 'POST'])
@login_required
@permission_required('payments.manage')
def record_payment(sale_id):
    sale = Sale.query.get_or_404(sale_id)
    methods = PaymentMethod.query.filter_by(is_active=True).all()

    if request.method == 'POST':
        try:
            amount = int(request.form['amount'])
            method_id = int(request.form['payment_method_id'])
            reference = request.form.get('reference_number', '').strip() or None
            notes = request.form.get('notes', '').strip() or None

            if amount <= 0:
                raise ValueError("Payment amount must be positive.")
            if amount > sale.balance:
                raise ValueError(f"Payment ({amount:,}) cannot exceed outstanding balance ({sale.balance:,}).")

            method = PaymentMethod.query.filter_by(id=method_id, is_active=True).first()
            if not method:
                raise ValueError("Payment method is not active.")

            new_balance = sale.balance - amount
            sale.amount_paid += amount
            sale.balance = new_balance

            cust = Customer.query.get(sale.customer_id)
            cust.outstanding_balance = max(0, cust.outstanding_balance - amount)

            pmt = Payment(
                receipt_number=ref('RCT'),
                sale_id=sale_id,
                customer_id=sale.customer_id,
                payment_method_id=method_id,
                amount=amount,
                reference_number=reference,
                notes=notes,
                received_by=current_user.id,
            )
            db.session.add(pmt)
            write_audit(current_user.id, 'RECORD_PAYMENT', 'PAYMENT', None,
                        {'sale_id': sale_id, 'amount': amount})
            db.session.commit()
            flash(f'Payment of UGX {amount:,} recorded. Receipt: {pmt.receipt_number}', 'success')
            return redirect(url_for('sales.detail', id=sale_id))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')

    return render_template('payments/record_payment.html', sale=sale, methods=methods)


@payments_bp.route('/methods')
@login_required
@permission_required('settings.manage')
def methods():
    pm = PaymentMethod.query.order_by(PaymentMethod.name).all()
    return render_template('payments/methods.html', methods=pm)


@payments_bp.route('/methods/new', methods=['GET', 'POST'])
@login_required
@permission_required('settings.manage')
def new_method():
    if request.method == 'POST':
        name = request.form['name'].strip()
        desc = request.form.get('description', '').strip() or None
        if len(name) < 2:
            flash('Name must be at least 2 characters.', 'danger')
        elif PaymentMethod.query.filter_by(name=name).first():
            flash('A payment method with that name already exists.', 'danger')
        else:
            pm = PaymentMethod(name=name, description=desc)
            db.session.add(pm)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'PAYMENT_METHOD', pm.id)
            db.session.commit()
            flash(f'Payment method "{name}" created.', 'success')
            return redirect(url_for('payments.methods'))
    return render_template('payments/method_form.html', method=None)
