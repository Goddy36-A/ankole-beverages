from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.purchases import purchases_bp
from app.models.models import Purchase, PurchaseItem, Product, Supplier, StockMovement, PurchaseReturn, PurchaseReturnItem
from app.extensions import db
from app.utils.helpers import write_audit, ref
from app.utils.decorators import permission_required


@purchases_bp.route('/')
@login_required
@permission_required('purchases.view')
def index():
    purchases = Purchase.query.order_by(Purchase.created_at.desc()).limit(200).all()
    return render_template('purchases/index.html', purchases=purchases)


@purchases_bp.route('/<int:id>')
@login_required
@permission_required('purchases.view')
def detail(id):
    purchase = Purchase.query.get_or_404(id)
    items = PurchaseItem.query.filter_by(purchase_id=id).all()
    return render_template('purchases/detail.html', purchase=purchase, items=items)


@purchases_bp.route('/new', methods=['GET', 'POST'])
@login_required
@permission_required('purchases.manage')
def new_purchase():
    suppliers = Supplier.query.filter_by(is_active=True).order_by(Supplier.name).all()
    products = Product.query.filter_by(is_active=True).order_by(Product.name).all()

    if request.method == 'POST':
        try:
            supplier_id = int(request.form['supplier_id'])
            supplier = Supplier.query.get(supplier_id)
            if not supplier or not supplier.is_active:
                raise ValueError("Active supplier is required.")

            product_ids = request.form.getlist('product_id[]')
            quantities = request.form.getlist('quantity[]')
            unit_costs = request.form.getlist('unit_cost[]')

            if not product_ids:
                raise ValueError("At least one product line is required.")

            normalized = []
            total = 0
            for pid, qty_str, cost_str in zip(product_ids, quantities, unit_costs):
                if not pid or not qty_str:
                    continue
                qty = int(qty_str)
                cost = int(cost_str)
                if qty <= 0 or cost < 0:
                    raise ValueError("Quantity must be positive and cost non-negative.")
                p = Product.query.get(int(pid))
                if not p:
                    raise ValueError(f"Product ID {pid} not found.")
                line_total = qty * cost
                total += line_total
                normalized.append({'product': p, 'quantity': qty, 'unit_cost': cost, 'line_total': line_total})

            if not normalized:
                raise ValueError("At least one item is required.")

            purchase = Purchase(
                purchase_number=ref('PO'),
                supplier_id=supplier_id,
                invoice_number=request.form.get('invoice_number', '').strip() or None,
                notes=request.form.get('notes', '').strip() or None,
                total_amount=total,
                status='DRAFT',
                created_by=current_user.id,
            )
            db.session.add(purchase)
            db.session.flush()

            for item in normalized:
                pi = PurchaseItem(
                    purchase_id=purchase.id,
                    product_id=item['product'].id,
                    quantity=item['quantity'],
                    unit_cost=item['unit_cost'],
                    line_total=item['line_total'],
                )
                db.session.add(pi)

            write_audit(current_user.id, 'CREATE', 'PURCHASE', purchase.id,
                        {'purchase_number': purchase.purchase_number, 'total': total})
            db.session.commit()
            flash(f'Purchase order {purchase.purchase_number} created.', 'success')
            return redirect(url_for('purchases.detail', id=purchase.id))

        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')

    return render_template('purchases/new_purchase.html', suppliers=suppliers, products=products)


@purchases_bp.route('/<int:id>/receive', methods=['POST'])
@login_required
@permission_required('purchases.receive')
def receive(id):
    purchase = Purchase.query.get_or_404(id)
    if purchase.status == 'RECEIVED':
        flash('Purchase has already been received.', 'warning')
        return redirect(url_for('purchases.detail', id=id))

    items = PurchaseItem.query.filter_by(purchase_id=id).all()
    if not items:
        flash('Purchase has no items.', 'danger')
        return redirect(url_for('purchases.detail', id=id))

    try:
        for item in items:
            p = Product.query.get(item.product_id)
            if not p:
                raise ValueError(f"Product ID {item.product_id} no longer exists.")
            p.current_stock += item.quantity
            mv = StockMovement(
                product_id=item.product_id,
                movement_type='PURCHASE',
                quantity=item.quantity,
                reference_type='PURCHASE',
                reference_id=id,
                reason='Confirmed purchase receipt',
                performed_by=current_user.id,
            )
            db.session.add(mv)

        from datetime import datetime
        purchase.status = 'RECEIVED'
        purchase.received_by = current_user.id
        purchase.received_at = datetime.utcnow()
        write_audit(current_user.id, 'RECEIVE', 'PURCHASE', id)
        db.session.commit()
        flash('Stock received and inventory updated.', 'success')
    except ValueError as e:
        db.session.rollback()
        flash(str(e), 'danger')

    return redirect(url_for('purchases.detail', id=id))


@purchases_bp.route('/<int:id>/return', methods=['GET', 'POST'])
@login_required
@permission_required('returns.manage')
def create_return(id):
    purchase = Purchase.query.get_or_404(id)
    if purchase.status != 'RECEIVED':
        flash('Only received purchases can be returned.', 'danger')
        return redirect(url_for('purchases.detail', id=id))
    items = PurchaseItem.query.filter_by(purchase_id=id).all()

    if request.method == 'POST':
        reason = request.form.get('reason', '').strip()
        if len(reason) < 5:
            flash('Please provide a reason (at least 5 characters).', 'danger')
            return render_template('purchases/return_form.html', purchase=purchase, items=items)
        try:
            return_items_data = []
            for pi in items:
                qty_str = request.form.get(f'qty_{pi.id}', '0').strip()
                qty = int(qty_str) if qty_str else 0
                if qty > 0:
                    # Check prior returns
                    prior = sum(
                        r.quantity for r in
                        PurchaseReturnItem.query.filter_by(purchase_item_id=pi.id).all()
                    )
                    if prior + qty > pi.quantity:
                        raise ValueError(f"Return quantity exceeds original received quantity for product ID {pi.product_id}.")
                    return_items_data.append({'pi': pi, 'qty': qty})

            if not return_items_data:
                flash('No return quantities entered.', 'warning')
                return render_template('purchases/return_form.html', purchase=purchase, items=items)

            total = sum(d['qty'] * d['pi'].unit_cost for d in return_items_data)
            pr = PurchaseReturn(
                return_number=ref('PRET'),
                purchase_id=id,
                supplier_id=purchase.supplier_id,
                total_amount=total,
                reason=reason,
                processed_by=current_user.id,
            )
            db.session.add(pr)
            db.session.flush()

            for d in return_items_data:
                pi = d['pi']
                qty = d['qty']
                pri = PurchaseReturnItem(
                    purchase_return_id=pr.id,
                    purchase_item_id=pi.id,
                    product_id=pi.product_id,
                    quantity=qty,
                    unit_cost=pi.unit_cost,
                    line_total=qty * pi.unit_cost,
                )
                db.session.add(pri)
                p = Product.query.get(pi.product_id)
                if not p or qty > p.current_stock:
                    raise ValueError(f"Insufficient stock to return {qty} units.")
                p.current_stock -= qty
                mv = StockMovement(
                    product_id=pi.product_id,
                    movement_type='PURCHASE_RETURN',
                    quantity=-qty,
                    reference_type='PURCHASE_RETURN',
                    reference_id=pr.id,
                    reason=reason,
                    performed_by=current_user.id,
                )
                db.session.add(mv)

            write_audit(current_user.id, 'CREATE', 'PURCHASE_RETURN', pr.id,
                        {'purchase_id': id, 'total': total})
            db.session.commit()
            flash(f'Purchase return {pr.return_number} processed.', 'success')
            return redirect(url_for('purchases.detail', id=id))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')

    return render_template('purchases/return_form.html', purchase=purchase, items=items)
