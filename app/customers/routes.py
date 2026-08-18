from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.customers import customers_bp
from app.models.models import Customer, Sale, Payment
from app.extensions import db
from app.utils.helpers import write_audit, ref
from app.utils.decorators import permission_required


@customers_bp.route('/')
@login_required
@permission_required('partners.manage')
def index():
    search = request.args.get('q', '').strip()
    q = Customer.query
    if search:
        q = q.filter(db.or_(
            Customer.name.ilike(f'%{search}%'),
            Customer.customer_number.ilike(f'%{search}%'),
            Customer.telephone.ilike(f'%{search}%'),
        ))
    customers = q.order_by(Customer.name).all()
    return render_template('customers/index.html', customers=customers, search=search)


@customers_bp.route('/new', methods=['GET', 'POST'])
@login_required
@permission_required('partners.manage')
def new_customer():
    if request.method == 'POST':
        try:
            name = request.form['name'].strip()
            if len(name) < 2:
                raise ValueError("Name must be at least 2 characters.")
            credit = int(request.form.get('credit_limit', 0))
            if credit < 0:
                raise ValueError("Credit limit cannot be negative.")
            c = Customer(
                customer_number=ref('CUS'),
                name=name,
                customer_type=request.form.get('customer_type', 'Walk-in'),
                telephone=request.form.get('telephone', '').strip() or None,
                email=request.form.get('email', '').strip() or None,
                address=request.form.get('address', '').strip() or None,
                credit_limit=credit,
                payment_terms=request.form.get('payment_terms', '').strip() or None,
            )
            db.session.add(c)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'CUSTOMER', c.id, {'name': name})
            db.session.commit()
            flash(f'Customer "{name}" created.', 'success')
            return redirect(url_for('customers.index'))
        except ValueError as e:
            flash(str(e), 'danger')
    return render_template('customers/customer_form.html', customer=None)


@customers_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('partners.manage')
def edit_customer(id):
    c = Customer.query.get_or_404(id)
    if request.method == 'POST':
        try:
            name = request.form['name'].strip()
            if len(name) < 2:
                raise ValueError("Name must be at least 2 characters.")
            c.name = name
            c.customer_type = request.form.get('customer_type', c.customer_type)
            c.telephone = request.form.get('telephone', '').strip() or None
            c.email = request.form.get('email', '').strip() or None
            c.address = request.form.get('address', '').strip() or None
            c.credit_limit = int(request.form.get('credit_limit', c.credit_limit))
            c.payment_terms = request.form.get('payment_terms', '').strip() or None
            c.is_active = request.form.get('is_active') == '1'
            write_audit(current_user.id, 'UPDATE', 'CUSTOMER', id, {'name': name})
            db.session.commit()
            flash('Customer updated.', 'success')
            return redirect(url_for('customers.index'))
        except ValueError as e:
            flash(str(e), 'danger')
    return render_template('customers/customer_form.html', customer=c)


@customers_bp.route('/<int:id>')
@login_required
@permission_required('partners.manage')
def detail(id):
    c = Customer.query.get_or_404(id)
    sales = Sale.query.filter_by(customer_id=id).order_by(Sale.created_at.desc()).limit(50).all()
    payments = Payment.query.filter_by(customer_id=id).order_by(Payment.created_at.desc()).limit(50).all()
    return render_template('customers/detail.html', customer=c, sales=sales, payments=payments)
