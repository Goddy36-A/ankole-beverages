import os
from dotenv import load_dotenv

load_dotenv()


def _fix_db_url(url: str) -> str:
    """
    Render (and older Heroku) return postgres:// connection strings.
    SQLAlchemy 1.4+ requires postgresql://.
    """
    if url and url.startswith('postgres://'):
        return url.replace('postgres://', 'postgresql://', 1)
    return url


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
    SQLALCHEMY_DATABASE_URI = _fix_db_url(
        os.environ.get('DATABASE_URL', 'sqlite:///ankole_beverages.db')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    WTF_CSRF_ENABLED = True
    CURRENCY = os.environ.get('CURRENCY', 'UGX')
    APP_NAME = 'Ankole Soft Drinks Ltd'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = True   # HTTPS only in production


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
