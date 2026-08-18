# Ankole Soft Drinks Ltd — Inventory & Sales Management System

A complete, production-grade web application built with **Python Flask + SQLite3** for Ankole Soft Drinks Ltd, Buhweju District, Uganda.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Flask 3.1 (Application Factory + Blueprints) |
| Database | SQLite3 via SQLAlchemy ORM |
| Auth | Local username/password — Flask-Login + Werkzeug |
| CSRF | Flask-WTF |
| Migrations | Flask-Migrate / Alembic |
| UI | Bootstrap 5.3 + Bootstrap Icons |
| Server-side validation | Python / WTForms |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Goddy36-A/ankole-beverages.git
cd ankole-beverages

# 2. Virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Environment file
cp .env.example .env              # Edit SECRET_KEY for production

# 5. Run
python run.py
```

Visit: **http://localhost:5000**

Default login: `admin` / `Admin@1234` *(change immediately in production)*

---

## Modules

| Module | URL | Description |
|---|---|---|
| Dashboard | `/` | KPIs, low stock, recent activity |
| Products | `/products/` | Products, categories, units |
| Inventory | `/inventory/` | Stock levels, movements, adjustments, counts |
| Purchases | `/purchases/` | Purchase orders, receiving, returns |
| Sales | `/sales/` | Sales with multi-item POS form, returns |
| Customers | `/customers/` | Customer management, statements |
| Suppliers | `/suppliers/` | Supplier management, purchase history |
| Payments | `/payments/` | Payment recording, methods |
| Reports | `/reports/` | Sales, inventory, purchase, customer reports + CSV export |
| Admin | `/admin/` | Users, roles, permissions, settings |

---

## Business Rules Enforced (Server-Side)

| Rule | Description |
|---|---|
| BR-001 | Cannot sell more than available stock |
| BR-002 | Cannot sell inactive products |
| BR-003 | Confirmed sale deducts stock and creates movement record |
| BR-004 | Confirmed purchase receipt increases stock and creates movement record |
| BR-005 | Stock adjustments require a reason and manager approval |
| BR-006 | All access enforced server-side via permission decorators |
| BR-007 | Credit sales checked against customer credit limit |
| BR-008 | All adjustments, returns, and cancellations are auditable |
| BR-009 | Sales cannot be directly edited — use returns |
| BR-010 | Full audit trail for all important actions |

---

## Default Roles & Permissions

| Role | Access |
|---|---|
| Administrator | Full access |
| Manager | All operations except user/role management |
| Sales Officer | Customers, sales, payments, reports |
| Store Officer | Products, inventory, purchases |
| Accountant | Sales, payments, financial reports |

---

## Project Structure

```
ankole-beverages/
├── run.py                   # Entry point
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py          # App factory + seed data
│   ├── config.py
│   ├── extensions.py        # db, login_manager, csrf, migrate
│   ├── models/models.py     # All SQLAlchemy models
│   ├── auth/                # Login, logout, password change
│   ├── dashboard/           # KPI dashboard
│   ├── products/            # Products, categories, units
│   ├── inventory/           # Stock management
│   ├── purchases/           # Purchase orders
│   ├── sales/               # Sales with POS form
│   ├── customers/           # Customer management
│   ├── suppliers/           # Supplier management
│   ├── payments/            # Payment recording
│   ├── reports/             # All reports + CSV export
│   ├── admin/               # Users, roles, settings
│   ├── utils/helpers.py     # Business rules & helpers
│   ├── utils/decorators.py  # Permission decorators
│   └── templates/           # Jinja2 templates (Bootstrap 5)
```

---

## Security

- Passwords hashed with Werkzeug PBKDF2
- CSRF protection on all forms (Flask-WTF)
- Session management via Flask-Login
- Server-side role/permission checks on every route
- SQL injection protection via SQLAlchemy ORM
- XSS protection via Jinja2 auto-escaping
- Audit log for all critical actions
