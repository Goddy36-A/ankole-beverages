from datetime import datetime
from flask import render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from app.auth import auth_bp
from app.auth.forms import LoginForm, ChangePasswordForm
from app.extensions import db
from app.models.models import User
from app.utils.helpers import write_audit


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard.index'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data.strip()).first()
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username or password.', 'danger')
            return render_template('auth/login.html', form=form)
        if not user.is_active:
            flash('Your account has been deactivated. Please contact the administrator.', 'warning')
            return render_template('auth/login.html', form=form)
        login_user(user, remember=form.remember_me.data)
        user.last_signed_in = datetime.utcnow()
        write_audit(user.id, 'LOGIN', 'AUTH', ip=request.remote_addr)
        db.session.commit()
        next_page = request.args.get('next')
        return redirect(next_page or url_for('dashboard.index'))
    return render_template('auth/login.html', form=form)


@auth_bp.route('/logout')
@login_required
def logout():
    write_audit(current_user.id, 'LOGOUT', 'AUTH', ip=request.remote_addr)
    db.session.commit()
    logout_user()
    flash('You have been signed out.', 'info')
    return redirect(url_for('auth.login'))


@auth_bp.route('/change-password', methods=['GET', 'POST'])
@login_required
def change_password():
    form = ChangePasswordForm()
    if form.validate_on_submit():
        if not current_user.check_password(form.current_password.data):
            flash('Current password is incorrect.', 'danger')
            return render_template('auth/change_password.html', form=form)
        current_user.set_password(form.new_password.data)
        write_audit(current_user.id, 'CHANGE_PASSWORD', 'AUTH', ip=request.remote_addr)
        db.session.commit()
        flash('Password changed successfully.', 'success')
        return redirect(url_for('dashboard.index'))
    return render_template('auth/change_password.html', form=form)
