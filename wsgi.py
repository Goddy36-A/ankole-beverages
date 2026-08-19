# Re-export the package-level Flask instance under the names
# gunicorn may look for: wsgi:application or wsgi:app
from app import app as application  # noqa: F401
app = application                   # noqa: F401
