from app.utils.pagination import paginate
from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.suppliers import suppliers_bp
from app.models.models import Supplier, Purchase
from app.extensions import db
from app.utils.helpers import write_audit, ref
from app.utils.decorators import permission_required


@suppliers_bp.route('/')
@login_required
@permission_required('partners.manage')
def index():
    search = request.args.get('q', '').strip()
    q = Supplier.query
    if search:
        q = q.filter(db.or_(
            Supplier.name.ilike(f'%{search}%'),
            Supplier.supplier_number.ilike(f'%{search}%'),
        ))
    pg, suppliers = paginate(q.order_by(Supplier.name), per_page=30)
    return render_template('suppliers/index.html', suppliers=suppliers, search=search, pg=pg)


@suppliers_bp.route('/new', methods=['GET', 'POST'])
@login_required
@permission_required('partners.manage')
def new_supplier():
    if request.method == 'POST':
        try:
            name = request.form['name'].strip()
            if len(name) < 2:
                raise ValueError("Name must be at least 2 characters.")
            s = Supplier(
                supplier_number=ref('SUP'),
                name=name,
                contact_person=request.form.get('contact_person', '').strip() or None,
                telephone=request.form.get('telephone', '').strip() or None,
                email=request.form.get('email', '').strip() or None,
                address=request.form.get('address', '').strip() or None,
                location=request.form.get('location', '').strip() or None,
                tax_number=request.form.get('tax_number', '').strip() or None,
                payment_terms=request.form.get('payment_terms', '').strip() or None,
            )
            db.session.add(s)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'SUPPLIER', s.id, {'name': name})
            db.session.commit()
            flash(f'Supplier "{name}" created.', 'success')
            return redirect(url_for('suppliers.index'))
        except ValueError as e:
            flash(str(e), 'danger')
    return render_template('suppliers/supplier_form.html', supplier=None)


@suppliers_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('partners.manage')
def edit_supplier(id):
    s = Supplier.query.get_or_404(id)
    if request.method == 'POST':
        try:
            name = request.form['name'].strip()
            if len(name) < 2:
                raise ValueError("Name must be at least 2 characters.")
            s.name = name
            s.contact_person = request.form.get('contact_person', '').strip() or None
            s.telephone = request.form.get('telephone', '').strip() or None
            s.email = request.form.get('email', '').strip() or None
            s.address = request.form.get('address', '').strip() or None
            s.location = request.form.get('location', '').strip() or None
            s.is_active = request.form.get('is_active') == '1'
            write_audit(current_user.id, 'UPDATE', 'SUPPLIER', id)
            db.session.commit()
            flash('Supplier updated.', 'success')
            return redirect(url_for('suppliers.index'))
        except ValueError as e:
            flash(str(e), 'danger')
    return render_template('suppliers/supplier_form.html', supplier=s)


@suppliers_bp.route('/<int:id>')
@login_required
@permission_required('partners.manage')
def detail(id):
    s = Supplier.query.get_or_404(id)
    purchases = Purchase.query.filter_by(supplier_id=id).order_by(Purchase.created_at.desc()).limit(50).all()
    return render_template('suppliers/detail.html', supplier=s, purchases=purchases)
