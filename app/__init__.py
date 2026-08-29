import os
from flask import Flask, render_template
from app.config import config as config_map
from app.extensions import db, login_manager, migrate, csrf



def _register_context_processors(app):
    """Inject global template variables available on every page."""
    from app.models.models import Product

    @app.context_processor
    def global_vars():
        try:
            low_stock_count = Product.query.filter(
                Product.current_stock <= Product.reorder_level,
                Product.is_active == True,
            ).count()
        except Exception:
            low_stock_count = 0
        return dict(low_stock_count=low_stock_count)


def create_app(config_class=None):
    if config_class is None:
        env = os.environ.get('FLASK_ENV', 'development')
        config_class = config_map.get(env, config_map['default'])
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)

    # ── User loader ───────────────────────────────────────────────────────────
    from app.models.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # ── Blueprints ────────────────────────────────────────────────────────────
    from app.auth import auth_bp
    from app.dashboard import dashboard_bp
    from app.products import products_bp
    from app.sales import sales_bp
    from app.purchases import purchases_bp
    from app.customers import customers_bp
    from app.suppliers import suppliers_bp
    from app.payments import payments_bp
    from app.inventory import inventory_bp
    from app.reports import reports_bp
    from app.admin import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(products_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(purchases_bp)
    app.register_blueprint(customers_bp)
    app.register_blueprint(suppliers_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')

    # ── Template filters ──────────────────────────────────────────────────────
    @app.template_filter('ugx')
    def ugx_filter(value):
        if value is None:
            return 'UGX 0'
        return f'UGX {int(value):,}'

    @app.template_filter('short_dt')
    def short_dt(value):
        if not value:
            return '—'
        return value.strftime('%d %b %Y %H:%M')

    @app.template_filter('short_date')
    def short_date(value):
        if not value:
            return '—'
        return value.strftime('%d %b %Y')



    # ── Error handlers ────────────────────────────────────────────────────────
    @app.errorhandler(403)
    def forbidden(e):
        return render_template('errors/403.html'), 403

    @app.errorhandler(404)
    def not_found(e):
        return render_template('errors/404.html'), 404

    @app.errorhandler(500)
    def server_error(e):
        return render_template('errors/500.html'), 500

    # ── DB init + seed ────────────────────────────────────────────────────────
    with app.app_context():
        db.create_all()
        _seed_defaults()
    # ── Manual download route (public — no login required) ────────────────────
    import os as _os
    from flask import send_from_directory as _sfd, request as _req

    @app.route('/manual')
    def download_manual():
        _static = _os.path.join(app.root_path, 'static')
        _fname  = 'BISMS_User_Manual_v1.pdf'
        if _req.args.get('dl') == '1':
            return _sfd(_static, _fname, as_attachment=True, download_name=_fname)
        _page = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BISMS User Manual</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.11.3/font/bootstrap-icons.min.css">
<style>body{background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{border-radius:16px;border:none;box-shadow:0 4px 24px rgba(0,0,0,.10);max-width:460px;width:100%}
.top{background:#025E36;border-radius:16px 16px 0 0;padding:28px 24px}</style>
</head><body>
<div class="card">
  <div class="top text-center">
    <i class="bi bi-book" style="font-size:42px;color:#F5D674"></i>
    <h4 class="fw-bold text-white mt-2 mb-1">BISMS User Manual</h4>
    <div class="text-white opacity-75 small">Ankole Soft Drinks Ltd &middot; Buhweju District</div>
  </div>
  <div class="card-body p-4 text-center">
    <span class="badge rounded-pill" style="background:#B8960C;color:#fff">Version 1.0 &mdash; August 2026</span>
    <p class="mt-3 text-secondary small">30 pages &middot; 16 sections &middot; PDF</p>
    <a href="/manual?dl=1" class="btn btn-success btn-lg w-100 fw-semibold mb-2">
      <i class="bi bi-download me-2"></i>Download PDF
    </a>
    <a href="/static/BISMS_User_Manual_v1.pdf" target="_blank" class="btn btn-outline-secondary w-100">
      <i class="bi bi-eye me-2"></i>View in Browser
    </a>
    <hr class="my-3">
    <div class="text-muted" style="font-size:11px">
      Developed by Metropolitan International University<br>
      &copy; 2026 Ankole Soft Drinks Ltd
    </div>
  </div>
</div></body></html>"""
        from flask import make_response
        return make_response(_page, 200)

    _register_context_processors(app)
    return app


def _seed_defaults():
    """Idempotent: seed permissions, roles, and the admin user on first boot."""
    from app.models.models import Permission, Role, RolePermission, User, UserRole
    from app.utils.helpers import ref

    ALL_PERMISSIONS = [
        ('dashboard.view',          'View dashboard'),
        ('catalog.view',            'View products and categories'),
        ('catalog.manage',          'Create and edit products/categories'),
        ('inventory.view',          'View stock and movements'),
        ('inventory.adjust',        'Request stock adjustments'),
        ('inventory.adjust.approve','Approve stock adjustments'),
        ('inventory.count',         'Perform physical stock counts'),
        ('purchases.view',          'View purchase orders'),
        ('purchases.manage',        'Create purchase orders'),
        ('purchases.receive',       'Receive/confirm purchase orders'),
        ('sales.view',              'View sales'),
        ('sales.create',            'Create new sales'),
        ('sales.discount',          'Apply discounts or override prices'),
        ('sales.credit.override',   'Override customer credit limit'),
        ('returns.manage',          'Process sales and purchase returns'),
        ('partners.manage',         'Manage customers and suppliers'),
        ('payments.manage',         'Record and view payments'),
        ('reports.view',            'Access reports'),
        ('reports.export',          'Export reports to CSV'),
        ('users.manage',            'Manage users and roles'),
        ('settings.manage',         'Manage system settings'),
        ('audit.view',              'View audit logs'),
    ]

    ROLE_PERMISSIONS = {
        'Administrator': [p[0] for p in ALL_PERMISSIONS],
        'Manager': [
            'dashboard.view','catalog.view','catalog.manage',
            'inventory.view','inventory.adjust','inventory.adjust.approve','inventory.count',
            'purchases.view','purchases.manage','purchases.receive',
            'sales.view','sales.create','sales.discount','returns.manage',
            'partners.manage','payments.manage','reports.view','reports.export','audit.view',
        ],
        'Sales Officer': [
            'dashboard.view','catalog.view','sales.view','sales.create',
            'partners.manage','payments.manage','reports.view',
        ],
        'Store Officer': [
            'dashboard.view','catalog.view','catalog.manage',
            'inventory.view','inventory.adjust','inventory.count',
            'purchases.view','purchases.manage','purchases.receive',
        ],
        'Accountant': [
            'dashboard.view','sales.view','payments.manage',
            'reports.view','reports.export',
        ],
    }

    # Seed permissions
    for code, desc in ALL_PERMISSIONS:
        if not Permission.query.filter_by(code=code).first():
            db.session.add(Permission(code=code, description=desc))
    db.session.flush()

    # Seed roles
    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        role = Role.query.filter_by(name=role_name).first()
        if not role:
            role = Role(name=role_name, description=f'{role_name} role')
            db.session.add(role)
            db.session.flush()
        # Assign permissions
        existing_perm_ids = {rp.permission_id for rp in role.role_permissions}
        for code in perm_codes:
            perm = Permission.query.filter_by(code=code).first()
            if perm and perm.id not in existing_perm_ids:
                db.session.add(RolePermission(role_id=role.id, permission_id=perm.id))

    db.session.flush()

    # Seed default admin user
    if not User.query.filter_by(username='admin').first():
        admin_role = Role.query.filter_by(name='Administrator').first()
        admin = User(
            username='admin',
            name='System Administrator',
            email='admin@ankole.local',
            role='admin',
        )
        admin.set_password('Admin@1234')
        db.session.add(admin)
        db.session.flush()
        if admin_role:
            db.session.add(UserRole(user_id=admin.id, role_id=admin_role.id))

    # Seed default payment methods
    from app.models.models import PaymentMethod
    for pm_name in ['Cash', 'Mobile Money', 'Bank Transfer']:
        if not PaymentMethod.query.filter_by(name=pm_name).first():
            db.session.add(PaymentMethod(name=pm_name))

    # Seed default categories
    from app.models.models import Category
    for cat_name in ['Soft Drinks', 'Energy Drinks', 'Water', 'Juice', 'Other']:
        if not Category.query.filter_by(name=cat_name).first():
            db.session.add(Category(name=cat_name))

    # Seed default units
    from app.models.models import Unit
    for uname, symbol in [('Piece', 'pcs'), ('Crate', 'crt'), ('Case', 'cs'), ('Litre', 'L'), ('Millilitre', 'ml')]:
        if not Unit.query.filter_by(name=uname).first():
            db.session.add(Unit(name=uname, symbol=symbol))

    # Seed default packagings
    from app.models.models import Packaging
    for pkg in ['Bottle', 'Can', 'Plastic Bottle', 'Tetra Pack', 'Sachet']:
        if not Packaging.query.filter_by(name=pkg).first():
            db.session.add(Packaging(name=pkg))

    # Seed currency setting
    from app.models.models import SystemSetting
    if not SystemSetting.query.filter_by(setting_key='currency').first():
        db.session.add(SystemSetting(setting_key='currency', setting_value='UGX', description='Default currency'))

    db.session.commit()


# ── Module-level Flask instance ───────────────────────────────────────────────
# Render auto-detects "gunicorn app:app" and ignores Procfile/render.yaml.
# Exposing `app` here makes that command work without any dashboard changes.
app = create_app()

