import json
from datetime import datetime, timedelta
from flask import render_template, redirect, url_for, flash, request, jsonify, abort
from flask_login import login_required, current_user
from app.sales import sales_bp
from app.models.models import (
    Sale, SaleItem, Customer, Product, Payment, PaymentMethod,
    StockMovement, SalesReturn, SalesReturnItem
)
from app.extensions import db
from app.utils.helpers import write_audit, ref, validate_sale_line, calculate_sale_totals, validate_credit_exposure, validate_return_quantity
from app.utils.decorators import permission_required


@sales_bp.route('/')
@login_required
@permission_required('sales.view')
def index():
    sales = Sale.query.order_by(Sale.created_at.desc()).limit(200).all()
    return render_template('sales/index.html', sales=sales)


@sales_bp.route('/<int:id>')
@login_required
@permission_required('sales.view')
def detail(id):
    sale = Sale.query.get_or_404(id)
    items = (SaleItem.query.filter_by(sale_id=id)
             .join(Product, Product.id == SaleItem.product_id).all())
    payments = Payment.query.filter_by(sale_id=id).all()
    return render_template('sales/detail.html', sale=sale, items=items, payments=payments)


@sales_bp.route('/new', methods=['GET', 'POST'])
@login_required
@permission_required('sales.create')
def new_sale():
    customers = Customer.query.filter_by(is_active=True).order_by(Customer.name).all()
    products = Product.query.filter_by(is_active=True).order_by(Product.name).all()
    methods = PaymentMethod.query.filter_by(is_active=True).order_by(PaymentMethod.name).all()

    if request.method == 'POST':
        try:
            customer_id = int(request.form['customer_id'])
            sale_type = request.form.get('sale_type', 'CASH')
            discount = int(request.form.get('discount', 0))
            tax = int(request.form.get('tax', 0))
            amount_paid = int(request.form.get('amount_paid', 0))
            notes = request.form.get('notes', '').strip() or None
            payment_method_id = request.form.get('payment_method_id')
            payment_method_id = int(payment_method_id) if payment_method_id else None

            # Parse line items from form
            product_ids = request.form.getlist('product_id[]')
            quantities = request.form.getlist('quantity[]')
            unit_prices = request.form.getlist('unit_price[]')

            if not product_ids:
                raise ValueError("At least one product is required.")
            if amount_paid > 0 and not payment_method_id:
                raise ValueError("A payment method is required when amount paid is greater than zero.")

            customer = Customer.query.get(customer_id)
            if not customer or not customer.is_active:
                raise ValueError("Active customer is required.")

            if payment_method_id:
                pm = PaymentMethod.query.filter_by(id=payment_method_id, is_active=True).first()
                if not pm:
                    raise ValueError("Payment method is not active.")

            normalized = []
            lines_for_total = []
            for pid, qty_str, uprice_str in zip(product_ids, quantities, unit_prices):
                if not pid or not qty_str:
                    continue
                pid = int(pid)
                qty = int(qty_str)
                uprice = int(uprice_str) if uprice_str else None
                product = Product.query.get(pid)
                if not product:
                    raise ValueError(f"Product ID {pid} not found.")

                # Discount permission check
                if uprice is not None and uprice != product.selling_price:
                    if not current_user.has_permission('sales.discount'):
                        raise ValueError("You do not have permission to override the price.")

                price, line_total = validate_sale_line(product, qty, uprice)
                normalized.append({
                    'product': product,
                    'quantity': qty,
                    'unit_price': price,
                    'unit_cost': product.cost_price,
                    'line_total': line_total,
                })
                lines_for_total.append((qty, price))

            if not normalized:
                raise ValueError("At least one product line is required.")

            subtotal, total_amount = calculate_sale_totals(lines_for_total, discount, tax)

            if amount_paid > total_amount:
                raise ValueError("Amount paid cannot exceed the invoice total.")

            balance = total_amount - amount_paid

            if sale_type == 'CASH' and balance > 0:
                raise ValueError("Cash sales must be fully paid. Use credit for an outstanding balance.")

            if sale_type == 'CREDIT':
                validate_credit_exposure(
                    customer.outstanding_balance,
                    balance,
                    customer.credit_limit,
                    manager_override=current_user.has_permission('sales.credit.override'),
                )

            # --- Persist inside a transaction ---
            invoice_number = ref('INV')
            sale = Sale(
                invoice_number=invoice_number,
                customer_id=customer_id,
                sale_type=sale_type,
                subtotal=subtotal,
                discount=discount,
                tax=tax,
                total_amount=total_amount,
                amount_paid=amount_paid,
                balance=balance,
                due_date=datetime.utcnow() + timedelta(days=30) if sale_type == 'CREDIT' else None,
                notes=notes,
                created_by=current_user.id,
            )
            db.session.add(sale)
            db.session.flush()

            for item in normalized:
                si = SaleItem(
                    sale_id=sale.id,
                    product_id=item['product'].id,
                    quantity=item['quantity'],
                    unit_price=item['unit_price'],
                    unit_cost=item['unit_cost'],
                    line_total=item['line_total'],
                )
                db.session.add(si)
                # Deduct stock (BR-003)
                item['product'].current_stock -= item['quantity']
                mv = StockMovement(
                    product_id=item['product'].id,
                    movement_type='SALE',
                    quantity=-item['quantity'],
                    reference_type='SALE',
                    reference_id=sale.id,
                    reason='Confirmed sale',
                    performed_by=current_user.id,
                )
                db.session.add(mv)

            if amount_paid > 0:
                pmt = Payment(
                    receipt_number=ref('RCT'),
                    sale_id=sale.id,
                    customer_id=customer_id,
                    payment_method_id=payment_method_id,
                    amount=amount_paid,
                    reference_number=request.form.get('payment_reference', '').strip() or None,
                    received_by=current_user.id,
                )
                db.session.add(pmt)

            if balance > 0:
                customer.outstanding_balance += balance

            write_audit(current_user.id, 'CREATE', 'SALE', sale.id,
                        {'invoice': invoice_number, 'total': total_amount})
            db.session.commit()
            flash(f'Sale {invoice_number} recorded successfully.', 'success')
            return redirect(url_for('sales.detail', id=sale.id))

        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')

    return render_template('sales/new_sale.html',
        customers=customers, products=products, methods=methods)


@sales_bp.route('/<int:id>/return', methods=['GET', 'POST'])
@login_required
@permission_required('returns.manage')
def create_return(id):
    sale = Sale.query.get_or_404(id)
    if sale.status != 'COMPLETED':
        flash('Only completed sales can be returned.', 'danger')
        return redirect(url_for('sales.detail', id=id))
    items = SaleItem.query.filter_by(sale_id=id).all()

    if request.method == 'POST':
        reason = request.form.get('reason', '').strip()
        if len(reason) < 5:
            flash('Please provide a reason (at least 5 characters).', 'danger')
            return render_template('sales/return_form.html', sale=sale, items=items)
        try:
            return_items_data = []
            for si in items:
                qty_str = request.form.get(f'qty_{si.id}', '0').strip()
                qty = int(qty_str) if qty_str else 0
                if qty > 0:
                    validate_return_quantity(si.quantity, si.returned_quantity, qty)
                    return_items_data.append({'sale_item': si, 'quantity': qty})

            if not return_items_data:
                flash('No return quantities entered.', 'warning')
                return render_template('sales/return_form.html', sale=sale, items=items)

            total_amount = sum(d['quantity'] * d['sale_item'].unit_price for d in return_items_data)
            sr = SalesReturn(
                return_number=ref('SRET'),
                sale_id=id,
                customer_id=sale.customer_id,
                total_amount=total_amount,
                reason=reason,
                processed_by=current_user.id,
            )
            db.session.add(sr)
            db.session.flush()

            for d in return_items_data:
                si = d['sale_item']
                qty = d['quantity']
                sri = SalesReturnItem(
                    sales_return_id=sr.id,
                    sale_item_id=si.id,
                    product_id=si.product_id,
                    quantity=qty,
                    unit_price=si.unit_price,
                    line_total=qty * si.unit_price,
                )
                db.session.add(sri)
                si.returned_quantity += qty
                p = Product.query.get(si.product_id)
                p.current_stock += qty
                mv = StockMovement(
                    product_id=si.product_id,
                    movement_type='SALE_RETURN',
                    quantity=qty,
                    reference_type='SALES_RETURN',
                    reference_id=sr.id,
                    reason=reason,
                    performed_by=current_user.id,
                )
                db.session.add(mv)

            # Reduce outstanding balance if credit
            if sale.balance > 0:
                credit_reduction = min(sale.balance, total_amount)
                sale.balance -= credit_reduction
                cust = Customer.query.get(sale.customer_id)
                cust.outstanding_balance = max(0, cust.outstanding_balance - credit_reduction)

            write_audit(current_user.id, 'CREATE', 'SALES_RETURN', sr.id,
                        {'sale_id': id, 'total': total_amount})
            db.session.commit()
            flash(f'Sales return {sr.return_number} processed.', 'success')
            return redirect(url_for('sales.detail', id=id))
        except ValueError as e:
            db.session.rollback()
            flash(str(e), 'danger')

    return render_template('sales/return_form.html', sale=sale, items=items)


# AJAX: product info for POS-style form
@sales_bp.route('/api/product/<int:id>')
@login_required
def api_product(id):
    p = Product.query.get_or_404(id)
    return jsonify({
        'id': p.id,
        'name': p.name,
        'sku': p.sku,
        'selling_price': p.selling_price,
        'cost_price': p.cost_price,
        'current_stock': p.current_stock,
        'is_active': p.is_active,
    })
