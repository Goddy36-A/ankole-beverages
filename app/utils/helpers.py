import json
import time
import random
from datetime import datetime
from functools import wraps
from flask import abort
from flask_login import current_user
from app.extensions import db
from app.models.models import AuditLog


def ref(prefix: str) -> str:
    """Generate a short unique reference number."""
    ts = str(int(time.time()))[-8:]
    rnd = random.randint(10, 99)
    return f"{prefix}-{ts}-{rnd}"


def write_audit(user_id, action, entity_type, entity_id=None, details=None, ip=None):
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=json.dumps(details) if details else None,
        ip_address=ip,
    )
    db.session.add(log)
    # Caller is responsible for committing


def format_ugx(value):
    """Format integer value as UGX currency string."""
    if value is None:
        return 'UGX 0'
    return f"UGX {value:,}"


# ── Business Rules ────────────────────────────────────────────────────────────

def validate_sale_line(product, quantity, unit_price=None):
    """
    BR-001: Cannot sell more than available stock.
    BR-002: Cannot sell inactive products.
    Returns (unit_price, line_total) or raises ValueError.
    """
    if not product.is_active:
        raise ValueError(f"{product.name} is inactive and cannot be sold.")
    if not isinstance(quantity, int) or quantity <= 0:
        raise ValueError("Quantity must be a positive whole number.")
    price = unit_price if unit_price is not None else product.selling_price
    if price < 0:
        raise ValueError("Unit price cannot be negative.")
    if price < product.cost_price:
        raise ValueError(f"Sale price for {product.name} cannot be below cost price.")
    if quantity > product.current_stock:
        raise ValueError(
            f"Insufficient stock for {product.name}. "
            f"Available: {product.current_stock}, requested: {quantity}."
        )
    return price, quantity * price


def calculate_sale_totals(lines, discount, tax):
    """Returns (subtotal, total_amount)."""
    if discount < 0:
        raise ValueError("Discount cannot be negative.")
    if tax < 0:
        raise ValueError("Tax cannot be negative.")
    subtotal = sum(q * p for q, p in lines)
    total = subtotal - discount + tax
    if total < 0:
        raise ValueError("Discount cannot exceed the sale subtotal plus tax.")
    return subtotal, total


def validate_credit_exposure(existing_balance, new_balance, credit_limit, manager_override=False):
    """BR-007: Credit sale cannot exceed credit limit without manager override."""
    if existing_balance + new_balance > credit_limit and not manager_override:
        raise ValueError(
            f"Customer credit limit of {credit_limit:,} UGX would be exceeded. "
            f"Current balance: {existing_balance:,}, new balance: {new_balance:,}."
        )
    return True


def validate_adjustment(adj_type, quantity, reason, current_stock):
    """BR-005: Adjustments require reason; OUT cannot exceed stock."""
    if quantity <= 0:
        raise ValueError("Adjustment quantity must be a positive whole number.")
    if not reason or not reason.strip():
        raise ValueError("An adjustment reason is required.")
    if adj_type == 'OUT' and quantity > current_stock:
        raise ValueError("Adjustment would create negative stock.")
    return current_stock + (quantity if adj_type == 'IN' else -quantity)


def validate_return_quantity(original_qty, already_returned, requested_qty):
    if requested_qty <= 0:
        raise ValueError("Return quantity must be positive.")
    if already_returned + requested_qty > original_qty:
        raise ValueError("Return quantity exceeds the original unreturned quantity.")
    return True
