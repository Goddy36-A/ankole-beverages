from datetime import datetime, timedelta
from flask import render_template
from flask_login import login_required
from sqlalchemy import func
from app.dashboard import dashboard_bp
from app.models.models import Product, Sale, SaleItem, Purchase, Customer, StockMovement
from app.extensions import db


@dashboard_bp.route('/')
@dashboard_bp.route('/dashboard')
@login_required
def index():
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    month_start = datetime(now.year, now.month, 1)

    # Product stats
    total_products = Product.query.filter_by(is_active=True).count()
    products = Product.query.all()
    stock_units = sum(p.current_stock for p in products)
    stock_value = sum(p.current_stock * p.cost_price for p in products)

    # Low stock
    low_stock = (Product.query
                 .filter(Product.current_stock <= Product.reorder_level, Product.is_active == True)
                 .order_by(Product.current_stock.asc())
                 .limit(8).all())

    # Sales stats
    today_sales = Sale.query.filter(
        Sale.status == 'COMPLETED', Sale.created_at >= today_start
    ).all()
    today_count = len(today_sales)
    today_revenue = sum(s.total_amount for s in today_sales)

    month_sales = Sale.query.filter(
        Sale.status == 'COMPLETED', Sale.created_at >= month_start
    ).all()
    monthly_revenue = sum(s.total_amount for s in month_sales)

    # Outstanding balances
    outstanding = db.session.query(func.sum(Customer.outstanding_balance)).scalar() or 0

    # Recent sales & purchases
    recent_sales = (Sale.query.order_by(Sale.created_at.desc()).limit(6).all())
    recent_purchases = (Purchase.query.order_by(Purchase.created_at.desc()).limit(6).all())

    # Top selling products (last 30 days)
    cutoff = now - timedelta(days=30)
    top_raw = (
        db.session.query(
            SaleItem.product_id,
            func.sum(SaleItem.quantity).label('total_qty'),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status == 'COMPLETED', Sale.created_at >= cutoff)
        .group_by(SaleItem.product_id)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
        .all()
    )
    top_products = []
    for row in top_raw:
        p = Product.query.get(row.product_id)
        if p:
            top_products.append({'product': p, 'qty': row.total_qty})

    return render_template('dashboard/index.html',
        total_products=total_products,
        stock_units=stock_units,
        stock_value=stock_value,
        low_stock=low_stock,
        today_count=today_count,
        today_revenue=today_revenue,
        monthly_revenue=monthly_revenue,
        outstanding=outstanding,
        recent_sales=recent_sales,
        recent_purchases=recent_purchases,
        top_products=top_products,
    )
