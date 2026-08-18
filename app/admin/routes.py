from flask import render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.admin import admin_bp
from app.models.models import (
    User, Role, Permission, UserRole, RolePermission, SystemSetting
)
from app.extensions import db
from app.utils.helpers import write_audit
from app.utils.decorators import permission_required


# ── Users ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/')
@login_required
@permission_required('users.manage')
def index():
    users = User.query.order_by(User.created_at.desc()).all()
    return render_template('admin/users.html', users=users)


@admin_bp.route('/users/new', methods=['GET', 'POST'])
@login_required
@permission_required('users.manage')
def new_user():
    roles = Role.query.filter_by(is_active=True).order_by(Role.name).all()
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip() or None
        password = request.form.get('password', '')
        role_id = request.form.get('role_id', type=int)

        errors = []
        if len(username) < 3:
            errors.append('Username must be at least 3 characters.')
        if len(password) < 8:
            errors.append('Password must be at least 8 characters.')
        if User.query.filter_by(username=username).first():
            errors.append('Username already taken.')
        if email and User.query.filter_by(email=email).first():
            errors.append('Email already in use.')

        if errors:
            for e in errors:
                flash(e, 'danger')
        else:
            u = User(username=username, name=name or None, email=email)
            u.set_password(password)
            db.session.add(u)
            db.session.flush()

            if role_id:
                role = Role.query.get(role_id)
                if role:
                    ur = UserRole(user_id=u.id, role_id=role_id)
                    db.session.add(ur)
                    u.role = role.name.lower()

            write_audit(current_user.id, 'CREATE', 'USER', u.id, {'username': username})
            db.session.commit()
            flash(f'User "{username}" created.', 'success')
            return redirect(url_for('admin.index'))

    return render_template('admin/user_form.html', user=None, roles=roles)


@admin_bp.route('/users/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('users.manage')
def edit_user(id):
    u = User.query.get_or_404(id)
    roles = Role.query.filter_by(is_active=True).order_by(Role.name).all()
    current_role = UserRole.query.filter_by(user_id=id).first()

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip() or None
        is_active = request.form.get('is_active') == '1'
        role_id = request.form.get('role_id', type=int)
        new_password = request.form.get('new_password', '').strip()

        if id == current_user.id and not is_active:
            flash('You cannot deactivate your own account.', 'danger')
            return render_template('admin/user_form.html', user=u, roles=roles, current_role=current_role)

        u.name = name or None
        u.email = email
        u.is_active = is_active

        if new_password:
            if len(new_password) < 8:
                flash('Password must be at least 8 characters.', 'danger')
                return render_template('admin/user_form.html', user=u, roles=roles, current_role=current_role)
            u.set_password(new_password)

        if role_id:
            UserRole.query.filter_by(user_id=id).delete()
            role = Role.query.get(role_id)
            if role:
                ur = UserRole(user_id=id, role_id=role_id)
                db.session.add(ur)
                u.role = role.name.lower()

        write_audit(current_user.id, 'UPDATE', 'USER', id, {'name': name})
        db.session.commit()
        flash('User updated.', 'success')
        return redirect(url_for('admin.index'))

    return render_template('admin/user_form.html', user=u, roles=roles, current_role=current_role)


@admin_bp.route('/users/<int:id>/toggle', methods=['POST'])
@login_required
@permission_required('users.manage')
def toggle_user(id):
    if id == current_user.id:
        flash('You cannot deactivate your own account.', 'danger')
        return redirect(url_for('admin.index'))
    u = User.query.get_or_404(id)
    u.is_active = not u.is_active
    write_audit(current_user.id, 'ACTIVATE' if u.is_active else 'DEACTIVATE', 'USER', id)
    db.session.commit()
    flash(f'User {"activated" if u.is_active else "deactivated"}.', 'success')
    return redirect(url_for('admin.index'))


# ── Roles ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/roles')
@login_required
@permission_required('users.manage')
def roles():
    all_roles = Role.query.order_by(Role.name).all()
    return render_template('admin/roles.html', roles=all_roles)


@admin_bp.route('/roles/new', methods=['GET', 'POST'])
@login_required
@permission_required('users.manage')
def new_role():
    all_perms = Permission.query.order_by(Permission.code).all()
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        desc = request.form.get('description', '').strip() or None
        perm_ids = request.form.getlist('permissions')

        if len(name) < 2:
            flash('Role name must be at least 2 characters.', 'danger')
        elif Role.query.filter_by(name=name).first():
            flash('A role with that name already exists.', 'danger')
        else:
            role = Role(name=name, description=desc)
            db.session.add(role)
            db.session.flush()
            for pid in perm_ids:
                rp = RolePermission(role_id=role.id, permission_id=int(pid))
                db.session.add(rp)
            write_audit(current_user.id, 'CREATE', 'ROLE', role.id, {'name': name})
            db.session.commit()
            flash(f'Role "{name}" created.', 'success')
            return redirect(url_for('admin.roles'))

    return render_template('admin/role_form.html', role=None, all_perms=all_perms, role_perm_ids=[])


@admin_bp.route('/roles/<int:id>/edit', methods=['GET', 'POST'])
@login_required
@permission_required('users.manage')
def edit_role(id):
    role = Role.query.get_or_404(id)
    all_perms = Permission.query.order_by(Permission.code).all()
    role_perm_ids = [rp.permission_id for rp in role.role_permissions]

    if request.method == 'POST':
        role.name = request.form.get('name', '').strip()
        role.description = request.form.get('description', '').strip() or None
        role.is_active = request.form.get('is_active') == '1'
        perm_ids = request.form.getlist('permissions')

        RolePermission.query.filter_by(role_id=id).delete()
        for pid in perm_ids:
            rp = RolePermission(role_id=id, permission_id=int(pid))
            db.session.add(rp)

        write_audit(current_user.id, 'UPDATE', 'ROLE', id)
        db.session.commit()
        flash('Role updated.', 'success')
        return redirect(url_for('admin.roles'))

    return render_template('admin/role_form.html', role=role, all_perms=all_perms, role_perm_ids=role_perm_ids)


# ── System Settings ───────────────────────────────────────────────────────────

@admin_bp.route('/settings')
@login_required
@permission_required('settings.manage')
def settings():
    all_settings = SystemSetting.query.order_by(SystemSetting.setting_key).all()
    return render_template('admin/settings.html', settings=all_settings)


@admin_bp.route('/settings/save', methods=['POST'])
@login_required
@permission_required('settings.manage')
def save_setting():
    key = request.form.get('setting_key', '').strip()
    value = request.form.get('setting_value', '').strip()
    desc = request.form.get('description', '').strip() or None

    if not key or not value:
        flash('Key and value are required.', 'danger')
        return redirect(url_for('admin.settings'))

    setting = SystemSetting.query.filter_by(setting_key=key).first()
    if setting:
        setting.setting_value = value
        setting.description = desc
        setting.updated_by = current_user.id
    else:
        setting = SystemSetting(
            setting_key=key, setting_value=value,
            description=desc, updated_by=current_user.id
        )
        db.session.add(setting)

    write_audit(current_user.id, 'UPDATE', 'SYSTEM_SETTING', None, {'key': key, 'value': value})
    db.session.commit()
    flash(f'Setting "{key}" saved.', 'success')
    return redirect(url_for('admin.settings'))
