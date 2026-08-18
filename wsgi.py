"""
WSGI entry point for gunicorn.

Naming note: the variable MUST be called 'application' here because
the Flask package directory is also called 'app' — if we write
  app = create_app()
Python keeps the package reference, not the Flask instance.
We expose both names so gunicorn works with either:
  gunicorn wsgi:application   (preferred)
  gunicorn wsgi:app           (alias)
"""
import os
import sys

# Ensure the repo root is on the path so 'app' package is found
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app  # noqa: E402

application = create_app()
app = application           # alias — gunicorn may look for either name
