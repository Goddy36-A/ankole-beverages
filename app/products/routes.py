from flask import render_template, redirect, url_for, flash, request, abort
from flask_login import login_required, current_user
from app.products import products_bp
from app.models.models import Product, Category, Unit, Packaging
from app.extensions import db
from app.utils.helpers import write_audit, ref
from app.utils.decorators import permission_required


# ── Categories ────────────────────────────────────────────────────────────────

@products_bp.route('/categories')
@login_required
@permission_required('catalog.view')
def categories():
    cats = Category.query.order_by(Category.name).all()
    return render_template('products/categories.html', categories=cats)


@products_bp.route('/categories/new', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def new_category():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        desc = request.form.get('description', '').strip()
        if len(name) < 2:
            flash('Category name must be at least 2 characters.', 'danger')
        elif Category.query.filter_by(name=name).first():
            flash('A category with that name already exists.', 'danger')
        else:
            cat = Category(name=name, description=desc or None)
            db.session.add(cat)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'CATEGORY', cat.id, {'name': name})
            db.session.commit()
            flash(f'Category "{name}" created.', 'success')
            return redirect(url_for('products.categories'))
    return render_template('products/category_form.html', category=None)


@products_bp.route('/categories/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def edit_category(id):
    cat = Category.query.get_or_404(id)
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        desc = request.form.get('description', '').strip()
        is_active = request.form.get('is_active') == '1'
        existing = Category.query.filter(Category.name == name, Category.id != id).first()
        if len(name) < 2:
            flash('Category name must be at least 2 characters.', 'danger')
        elif existing:
            flash('Another category with that name already exists.', 'danger')
        else:
            cat.name = name
            cat.description = desc or None
            cat.is_active = is_active
            write_audit(current_user.id, 'UPDATE', 'CATEGORY', id, {'name': name})
            db.session.commit()
            flash('Category updated.', 'success')
            return redirect(url_for('products.categories'))
    return render_template('products/category_form.html', category=cat)


# ── Units ─────────────────────────────────────────────────────────────────────

@products_bp.route('/units')
@login_required
@permission_required('catalog.view')
def units():
    all_units = Unit.query.order_by(Unit.name).all()
    return render_template('products/units.html', units=all_units)


@products_bp.route('/units/new', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def new_unit():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        symbol = request.form.get('symbol', '').strip()
        if not name or not symbol:
            flash('Name and symbol are required.', 'danger')
        elif Unit.query.filter_by(name=name).first():
            flash('A unit with that name already exists.', 'danger')
        else:
            u = Unit(name=name, symbol=symbol)
            db.session.add(u)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'UNIT', u.id, {'name': name})
            db.session.commit()
            flash(f'Unit "{name}" created.', 'success')
            return redirect(url_for('products.units'))
    return render_template('products/unit_form.html', unit=None)


@products_bp.route('/units/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def edit_unit(id):
    u = Unit.query.get_or_404(id)
    if request.method == 'POST':
        u.name = request.form.get('name', '').strip()
        u.symbol = request.form.get('symbol', '').strip()
        u.is_active = request.form.get('is_active') == '1'
        write_audit(current_user.id, 'UPDATE', 'UNIT', id)
        db.session.commit()
        flash('Unit updated.', 'success')
        return redirect(url_for('products.units'))
    return render_template('products/unit_form.html', unit=u)


# ── Products ──────────────────────────────────────────────────────────────────

@products_bp.route('/')
@login_required
@permission_required('catalog.view')
def index():
    search = request.args.get('q', '').strip()
    active_only = request.args.get('active') == '1'
    q = Product.query
    if search:
        q = q.filter(
            db.or_(Product.name.ilike(f'%{search}%'), Product.sku.ilike(f'%{search}%'))
        )
    if active_only:
        q = q.filter_by(is_active=True)
    prods = q.order_by(Product.name).all()
    return render_template('products/index.html', products=prods, search=search, active_only=active_only)


@products_bp.route('/new', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def new_product():
    categories = Category.query.filter_by(is_active=True).order_by(Category.name).all()
    all_units = Unit.query.filter_by(is_active=True).order_by(Unit.name).all()
    packagings = Packaging.query.filter_by(is_active=True).order_by(Packaging.name).all()
    if request.method == 'POST':
        try:
            sku = request.form['sku'].strip()
            name = request.form['name'].strip()
            cost = int(request.form['cost_price'])
            selling = int(request.form['selling_price'])
            if cost < 0 or selling < 0:
                raise ValueError("Prices cannot be negative.")
            if selling < cost:
                raise ValueError("Selling price cannot be below cost price.")
            if Product.query.filter_by(sku=sku).first():
                flash('A product with that SKU already exists.', 'danger')
                raise ValueError()
            p = Product(
                sku=sku,
                name=name,
                category_id=int(request.form['category_id']),
                unit_id=int(request.form['unit_id']),
                packaging_id=int(request.form['packaging_id']) if request.form.get('packaging_id') else None,
                brand=request.form.get('brand', '').strip() or None,
                size=request.form.get('size', '').strip() or None,
                description=request.form.get('description', '').strip() or None,
                cost_price=cost,
                selling_price=selling,
                reorder_level=int(request.form.get('reorder_level', 0)),
                expiry_tracking=request.form.get('expiry_tracking') == '1',
            )
            db.session.add(p)
            db.session.flush()
            write_audit(current_user.id, 'CREATE', 'PRODUCT', p.id, {'sku': sku, 'name': name})
            db.session.commit()
            flash(f'Product "{name}" created.', 'success')
            return redirect(url_for('products.index'))
        except ValueError as e:
            if str(e):
                flash(str(e), 'danger')
    return render_template('products/product_form.html',
        product=None, categories=categories, units=all_units, packagings=packagings)


@products_bp.route('/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('catalog.manage')
def edit_product(id):
    p = Product.query.get_or_404(id)
    categories = Category.query.filter_by(is_active=True).order_by(Category.name).all()
    all_units = Unit.query.filter_by(is_active=True).order_by(Unit.name).all()
    packagings = Packaging.query.filter_by(is_active=True).order_by(Packaging.name).all()
    if request.method == 'POST':
        try:
            cost = int(request.form['cost_price'])
            selling = int(request.form['selling_price'])
            if selling < cost:
                raise ValueError("Selling price cannot be below cost price.")
            p.name = request.form['name'].strip()
            p.category_id = int(request.form['category_id'])
            p.unit_id = int(request.form['unit_id'])
            p.packaging_id = int(request.form['packaging_id']) if request.form.get('packaging_id') else None
            p.brand = request.form.get('brand', '').strip() or None
            p.size = request.form.get('size', '').strip() or None
            p.description = request.form.get('description', '').strip() or None
            p.cost_price = cost
            p.selling_price = selling
            p.reorder_level = int(request.form.get('reorder_level', 0))
            p.expiry_tracking = request.form.get('expiry_tracking') == '1'
            p.is_active = request.form.get('is_active') == '1'
            write_audit(current_user.id, 'UPDATE', 'PRODUCT', id)
            db.session.commit()
            flash('Product updated.', 'success')
            return redirect(url_for('products.index'))
        except ValueError as e:
            flash(str(e) or 'Invalid input.', 'danger')
    return render_template('products/product_form.html',
        product=p, categories=categories, units=all_units, packagings=packagings)
