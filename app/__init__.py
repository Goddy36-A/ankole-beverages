import os
from flask import Flask, render_template
from app.config import config as config_map
from app.extensions import db, login_manager, migrate, csrf


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
