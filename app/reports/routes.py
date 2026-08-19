import csv
import io
from datetime import datetime
from flask import render_template, request, make_response, url_for
from flask_login import login_required
from app.reports import reports_bp
from app.models.models import (
    Sale, Purchase, Product, Customer,
    Supplier, Payment, StockMovement, AuditLog
)
from app.extensions import db
from app.utils.decorators import permission_required


def _parse_date(s, default):
    try:
        return datetime.strptime(s, '%Y-%m-%d') if s else default
    except ValueError:
        return default


def _csv_export(headers, rows, filename):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv; charset=utf-8'
    response.headers['Content-Disposition'] = f'attachment; filename={filename}'
    return response


def _csv_url(endpoint):
    """Build CSV export URL that preserves current filter args."""
    args = request.args.to_dict()
    args['export'] = 'csv'
    return url_for(endpoint, **args)


# ── Index ─────────────────────────────────────────────────────────────────────

@reports_bp.route('/')
@login_required
@permission_required('reports.view')
def index():
    return render_template('reports/index.html')


# ── Sales Report ──────────────────────────────────────────────────────────────

@reports_bp.route('/sales')
@login_required
@permission_required('reports.view')
def sales_report():
    from_str = request.args.get('from', '')
    to_str   = request.args.get('to',   '')
    customer_id = request.args.get('customer_id', type=int)

    from_dt = _parse_date(from_str, datetime.min)
    to_dt   = _parse_date(to_str,   datetime.utcnow())
    if to_str:
        to_dt = to_dt.replace(hour=23, minute=59, second=59)

    q = Sale.query.filter(Sale.created_at >= from_dt, Sale.created_at <= to_dt)
    if customer_id:
        q = q.filter_by(customer_id=customer_id)
    sales = q.order_by(Sale.created_at.desc()).all()

    total_revenue = sum(s.total_amount for s in sales)
    total_paid    = sum(s.amount_paid  for s in sales)
    total_balance = sum(s.balance      for s in sales)
    customers = Customer.query.order_by(Customer.name).all()

    if request.args.get('export') == 'csv':
        return _csv_export(
            ['Invoice', 'Date', 'Customer', 'Type', 'Subtotal',
             'Discount', 'Tax', 'Total', 'Paid', 'Balance'],
            [[s.invoice_number, s.created_at.date(), s.customer.name,
              s.sale_type, s.subtotal, s.discount, s.tax,
              s.total_amount, s.amount_paid, s.balance]
             for s in sales],
            'sales_report.csv'
        )

    return render_template('reports/sales_report.html',
        sales=sales,
        total_revenue=total_revenue,
        total_paid=total_paid,
        total_balance=total_balance,
        customers=customers,
        from_str=from_str,
        to_str=to_str,
        customer_id=customer_id,
        csv_url=_csv_url('reports.sales_report'),
    )


# ── Inventory Report ──────────────────────────────────────────────────────────

@reports_bp.route('/inventory')
@login_required
@permission_required('reports.view')
def inventory_report():
    low_only = request.args.get('low_only') == '1'
    q = Product.query
    if low_only:
        q = q.filter(Product.current_stock <= Product.reorder_level)
    products = q.order_by(Product.name).all()

    total_value  = sum(p.stock_value for p in products)
    low_count    = sum(1 for p in products if p.is_low_stock)

    if request.args.get('export') == 'csv':
        return _csv_export(
            ['SKU', 'Product', 'Category', 'Stock', 'Reorder Level',
             'Cost Price', 'Stock Value', 'Status'],
            [[p.sku, p.name, p.category.name, p.current_stock,
              p.reorder_level, p.cost_price, p.stock_value,
              'Active' if p.is_active else 'Inactive']
             for p in products],
            'inventory_report.csv'
        )

    return render_template('reports/inventory_report.html',
        products=products,
        total_value=total_value,
        low_count=low_count,
        low_only=low_only,
        csv_url=_csv_url('reports.inventory_report'),
    )


# ── Purchase Report ───────────────────────────────────────────────────────────

@reports_bp.route('/purchases')
@login_required
@permission_required('reports.view')
def purchase_report():
    from_str = request.args.get('from', '')
    to_str   = request.args.get('to',   '')
    supplier_id = request.args.get('supplier_id', type=int)

    from_dt = _parse_date(from_str, datetime.min)
    to_dt   = _parse_date(to_str,   datetime.utcnow())
    if to_str:
        to_dt = to_dt.replace(hour=23, minute=59, second=59)

    q = Purchase.query.filter(Purchase.created_at >= from_dt,
                              Purchase.created_at <= to_dt)
    if supplier_id:
        q = q.filter_by(supplier_id=supplier_id)
    purchases = q.order_by(Purchase.created_at.desc()).all()
    suppliers = Supplier.query.order_by(Supplier.name).all()

    total          = sum(p.total_amount for p in purchases)
    received_count = sum(1 for p in purchases if p.status == 'RECEIVED')

    if request.args.get('export') == 'csv':
        return _csv_export(
            ['PO Number', 'Date', 'Supplier', 'Invoice #', 'Status', 'Total'],
            [[p.purchase_number, p.created_at.date(), p.supplier.name,
              p.invoice_number or '', p.status, p.total_amount]
             for p in purchases],
            'purchase_report.csv'
        )

    return render_template('reports/purchase_report.html',
        purchases=purchases,
        suppliers=suppliers,
        total=total,
        received_count=received_count,
        from_str=from_str,
        to_str=to_str,
        supplier_id=supplier_id,
        csv_url=_csv_url('reports.purchase_report'),
    )


# ── Customer Balances ─────────────────────────────────────────────────────────

@reports_bp.route('/customer-balances')
@login_required
@permission_required('reports.view')
def customer_balances():
    overdue_only = request.args.get('overdue') == '1'
    customers = Customer.query.order_by(Customer.name).all()
    now = datetime.utcnow()
    rows = []
    for c in customers:
        invoices = Sale.query.filter(
            Sale.customer_id == c.id, Sale.balance > 0
        ).all()
        overdue = sum(
            s.balance for s in invoices
            if s.due_date and s.due_date < now
        )
        if overdue_only and overdue == 0:
            continue
        rows.append({'customer': c, 'overdue': overdue})
    return render_template('reports/customer_balances.html',
        rows=rows, overdue_only=overdue_only)


# ── Customer Statement ────────────────────────────────────────────────────────

@reports_bp.route('/customer-statement/<int:id>')
@login_required
@permission_required('reports.view')
def customer_statement(id):
    customer = Customer.query.get_or_404(id)
    from_str = request.args.get('from', '')
    to_str   = request.args.get('to',   '')
    from_dt  = _parse_date(from_str, datetime.min)
    to_dt    = _parse_date(to_str,   datetime.utcnow())
    if to_str:
        to_dt = to_dt.replace(hour=23, minute=59, second=59)

    sales = (Sale.query
             .filter(Sale.customer_id == id,
                     Sale.created_at >= from_dt,
                     Sale.created_at <= to_dt)
             .order_by(Sale.created_at).all())
    payments = (Payment.query
                .filter(Payment.customer_id == id,
                        Payment.created_at >= from_dt,
                        Payment.created_at <= to_dt)
                .order_by(Payment.created_at).all())

    total_invoiced = sum(s.total_amount for s in sales)
    total_paid_amt = sum(p.amount for p in payments)

    return render_template('reports/customer_statement.html',
        customer=customer,
        sales=sales,
        payments=payments,
        total_invoiced=total_invoiced,
        total_paid_amt=total_paid_amt,
        from_str=from_str,
        to_str=to_str,
    )


# ── Stock Movements ───────────────────────────────────────────────────────────

@reports_bp.route('/movements')
@login_required
@permission_required('reports.view')
def movements_report():
    from_str = request.args.get('from', '')
    to_str   = request.args.get('to',   '')
    mv_type  = request.args.get('type', '')

    from_dt = _parse_date(from_str, datetime.min)
    to_dt   = _parse_date(to_str,   datetime.utcnow())
    if to_str:
        to_dt = to_dt.replace(hour=23, minute=59, second=59)

    q = StockMovement.query.filter(
        StockMovement.created_at >= from_dt,
        StockMovement.created_at <= to_dt,
    )
    if mv_type:
        q = q.filter_by(movement_type=mv_type)
    movements = q.order_by(StockMovement.created_at.desc()).limit(500).all()
    movement_types = [
        'PURCHASE', 'SALE', 'SALE_RETURN', 'PURCHASE_RETURN',
        'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'LOSS',
    ]
    return render_template('reports/movements_report.html',
        movements=movements,
        movement_types=movement_types,
        from_str=from_str,
        to_str=to_str,
        mv_type=mv_type,
    )


# ── Audit Log ─────────────────────────────────────────────────────────────────

@reports_bp.route('/audit')
@login_required
@permission_required('audit.view')
def audit_logs():
    limit = min(int(request.args.get('limit', 100)), 500)
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return render_template('reports/audit_logs.html', logs=logs, limit=limit)
