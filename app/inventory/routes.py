from datetime import datetime, timedelta
from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.inventory import inventory_bp
from app.models.models import Product, StockMovement, StockAdjustment, StockCount, StockCountItem, PurchaseItem
from app.extensions import db
from app.utils.helpers import write_audit, ref, validate_adjustment
from app.utils.decorators import permission_required


@inventory_bp.route('/')
@login_required
@permission_required('inventory.view')
def index():
    products = Product.query.order_by(Product.name).all()
    return render_template('inventory/index.html', products=products)


@inventory_bp.route('/movements')
@login_required
@permission_required('inventory.view')
def movements():
    product_id = request.args.get('product_id', type=int)
    q = StockMovement.query
    if product_id:
        q = q.filter_by(product_id=product_id)
    movements = q.order_by(StockMovement.created_at.desc()).limit(300).all()
    products = Product.query.order_by(Product.name).all()
    return render_template('inventory/movements.html',
        movements=movements, products=products, selected_product_id=product_id)


@inventory_bp.route('/adjustments')
@login_required
@permission_required('inventory.view')
def adjustments():
    adjs = StockAdjustment.query.order_by(StockAdjustment.created_at.desc()).limit(200).all()
    return render_template('inventory/adjustments.html', adjustments=adjs)


@inventory_bp.route('/adjustments/request', methods=['GET', 'POST'])
@login_required
@permission_required('inventory.adjust')
def request_adjustment():
    products = Product.query.filter_by(is_active=True).order_by(Product.name).all()
    if request.method == 'POST':
        try:
            product_id = int(request.form['product_id'])
            adj_type = request.form['adjustment_type']
            quantity = int(request.form['quantity'])
            reason = request.form.get('reason', '').strip()
            if adj_type not in ('IN', 'OUT'):
                raise ValueError("Invalid adjustment type.")
            product = Product.query.get(product_id)
            if not product:
                raise ValueError("Product not found.")
            # Validate without applying
            if adj_type == 'OUT' and quantity > product.current_stock:
                raise ValueError("Adjustment quantity exceeds available stock.")
            if quantity <= 0:
                raise ValueError("Quantity must be positive.")
            if not reason or len(reason) < 5:
                raise ValueError("A reason of at least 5 characters is required.")

            adj = StockAdjustment(
                adjustment_number=ref('ADJ'),
                product_id=product_id,
                adjustment_type=adj_type,
                quantity=quantity,
                reason=reason,
                status='PENDING',
                requested_by=current_user.id,
            )
            db.session.add(adj)
            db.session.flush()
            write_audit(current_user.id, 'REQUEST', 'STOCK_ADJUSTMENT', adj.id,
                        {'product': product.name, 'type': adj_type, 'qty': quantity})
            db.session.commit()
            flash(f'Adjustment {adj.adjustment_number} submitted for approval.', 'success')
            return redirect(url_for('inventory.adjustments'))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')
    return render_template('inventory/adjustment_form.html', products=products)


@inventory_bp.route('/adjustments/<int:id>/approve', methods=['POST'])
@login_required
@permission_required('inventory.adjust.approve')
def approve_adjustment(id):
    adj = StockAdjustment.query.get_or_404(id)
    if adj.status != 'PENDING':
        flash('Adjustment is not pending.', 'warning')
        return redirect(url_for('inventory.adjustments'))

    product = Product.query.get(adj.product_id)
    if not product:
        flash('Product not found.', 'danger')
        return redirect(url_for('inventory.adjustments'))

    try:
        next_stock = validate_adjustment(adj.adjustment_type, adj.quantity, adj.reason, product.current_stock)
        product.current_stock = next_stock
        mv_type = 'ADJUSTMENT_IN' if adj.adjustment_type == 'IN' else 'ADJUSTMENT_OUT'
        mv_qty = adj.quantity if adj.adjustment_type == 'IN' else -adj.quantity
        mv = StockMovement(
            product_id=product.id,
            movement_type=mv_type,
            quantity=mv_qty,
            reference_type='STOCK_ADJUSTMENT',
            reference_id=id,
            reason=adj.reason,
            performed_by=current_user.id,
        )
        db.session.add(mv)
        adj.status = 'APPROVED'
        adj.approved_by = current_user.id
        adj.approved_at = datetime.utcnow()
        write_audit(current_user.id, 'APPROVE', 'STOCK_ADJUSTMENT', id)
        db.session.commit()
        flash(f'Adjustment approved. New stock: {next_stock}', 'success')
    except ValueError as e:
        db.session.rollback()
        flash(str(e), 'danger')

    return redirect(url_for('inventory.adjustments'))


@inventory_bp.route('/adjustments/<int:id>/reject', methods=['POST'])
@login_required
@permission_required('inventory.adjust.approve')
def reject_adjustment(id):
    adj = StockAdjustment.query.get_or_404(id)
    if adj.status != 'PENDING':
        flash('Adjustment is not pending.', 'warning')
    else:
        adj.status = 'REJECTED'
        adj.approved_by = current_user.id
        adj.approved_at = datetime.utcnow()
        write_audit(current_user.id, 'REJECT', 'STOCK_ADJUSTMENT', id)
        db.session.commit()
        flash('Adjustment rejected.', 'info')
    return redirect(url_for('inventory.adjustments'))


@inventory_bp.route('/losses/record', methods=['GET', 'POST'])
@login_required
@permission_required('inventory.adjust.approve')
def record_loss():
    products = Product.query.filter_by(is_active=True).order_by(Product.name).all()
    if request.method == 'POST':
        try:
            product_id = int(request.form['product_id'])
            movement_type = request.form['movement_type']
            quantity = int(request.form['quantity'])
            reason = request.form.get('reason', '').strip()
            if movement_type not in ('DAMAGE', 'EXPIRY', 'LOSS'):
                raise ValueError("Invalid movement type.")
            if quantity <= 0:
                raise ValueError("Quantity must be positive.")
            if len(reason) < 5:
                raise ValueError("A reason of at least 5 characters is required.")
            product = Product.query.get(product_id)
            if not product:
                raise ValueError("Product not found.")
            if quantity > product.current_stock:
                raise ValueError("Loss quantity cannot exceed available stock.")

            product.current_stock -= quantity
            mv = StockMovement(
                product_id=product_id,
                movement_type=movement_type,
                quantity=-quantity,
                reason=reason,
                performed_by=current_user.id,
            )
            db.session.add(mv)
            write_audit(current_user.id, 'RECORD', movement_type, None,
                        {'product': product.name, 'qty': quantity})
            db.session.commit()
            flash(f'{movement_type.title()} of {quantity} units recorded for {product.name}.', 'success')
            return redirect(url_for('inventory.index'))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')
    return render_template('inventory/loss_form.html', products=products)


@inventory_bp.route('/counts')
@login_required
@permission_required('inventory.count')
def counts():
    counts = StockCount.query.order_by(StockCount.created_at.desc()).limit(50).all()
    return render_template('inventory/counts.html', counts=counts)


@inventory_bp.route('/counts/new', methods=['GET', 'POST'])
@login_required
@permission_required('inventory.count')
def new_count():
    products = Product.query.filter_by(is_active=True).order_by(Product.name).all()
    if request.method == 'POST':
        try:
            items_data = []
            for p in products:
                qty_str = request.form.get(f'counted_{p.id}', '').strip()
                if qty_str == '':
                    continue
                counted = int(qty_str)
                if counted < 0:
                    raise ValueError(f"Counted quantity for {p.name} cannot be negative.")
                items_data.append({
                    'product': p,
                    'system_qty': p.current_stock,
                    'counted_qty': counted,
                    'variance': counted - p.current_stock,
                    'reason': request.form.get(f'reason_{p.id}', '').strip() or None,
                })

            if not items_data:
                raise ValueError("No products counted.")

            sc = StockCount(
                count_number=ref('COUNT'),
                status='OPEN',
                counted_by=current_user.id,
            )
            db.session.add(sc)
            db.session.flush()

            for d in items_data:
                sci = StockCountItem(
                    stock_count_id=sc.id,
                    product_id=d['product'].id,
                    system_quantity=d['system_qty'],
                    counted_quantity=d['counted_qty'],
                    variance=d['variance'],
                    reason=d['reason'],
                )
                db.session.add(sci)

            write_audit(current_user.id, 'CREATE', 'STOCK_COUNT', sc.id)
            db.session.commit()
            flash(f'Stock count {sc.count_number} submitted for approval.', 'success')
            return redirect(url_for('inventory.counts'))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')
    return render_template('inventory/count_form.html', products=products)


@inventory_bp.route('/counts/<int:id>/approve', methods=['POST'])
@login_required
@permission_required('inventory.adjust.approve')
def approve_count(id):
    sc = StockCount.query.get_or_404(id)
    if sc.status != 'OPEN':
        flash('Stock count is not open.', 'warning')
        return redirect(url_for('inventory.counts'))

    items = StockCountItem.query.filter_by(stock_count_id=id).all()
    for item in items:
        if item.variance == 0:
            continue
        p = Product.query.get(item.product_id)
        if not p:
            continue
        p.current_stock = item.counted_quantity
        mv_type = 'ADJUSTMENT_IN' if item.variance > 0 else 'ADJUSTMENT_OUT'
        mv = StockMovement(
            product_id=item.product_id,
            movement_type=mv_type,
            quantity=item.variance,
            reference_type='STOCK_COUNT',
            reference_id=id,
            reason=item.reason or 'Approved physical stock count variance',
            performed_by=current_user.id,
        )
        db.session.add(mv)

    sc.status = 'APPROVED'
    sc.approved_by = current_user.id
    sc.approved_at = datetime.utcnow()
    write_audit(current_user.id, 'APPROVE', 'STOCK_COUNT', id)
    db.session.commit()
    flash('Stock count approved and inventory updated.', 'success')
    return redirect(url_for('inventory.counts'))


@inventory_bp.route('/alerts')
@login_required
@permission_required('inventory.view')
def alerts():
    all_products = Product.query.all()
    low_stock = [p for p in all_products if p.current_stock > 0 and p.current_stock <= p.reorder_level and p.is_active]
    out_of_stock = [p for p in all_products if p.current_stock == 0 and p.is_active]
    threshold = datetime.utcnow() + timedelta(days=30)
    expiring = (PurchaseItem.query
                .filter(PurchaseItem.expiry_date != None,
                        PurchaseItem.expiry_date <= threshold,
                        PurchaseItem.expiry_date >= datetime.utcnow())
                .all())
    return render_template('inventory/alerts.html',
        low_stock=low_stock, out_of_stock=out_of_stock, expiring=expiring)
