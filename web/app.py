"""
Naar Automations website: the frame (login, sidebar, shared CSS/JS) plus every dashboard and
automation page. Each one lives in its own folder and brings its own routes, template and
JS/CSS as a Flask blueprint; this file only switches them on (MODULES below).

    python -m web.app                         # local, from the repo root
    gunicorn web.app:app                      # server (deploy/ecosystem.config.js)
"""
import importlib
import logging
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify, request
from flask_cors import CORS

from web.auth import init_auth
from web.config import config, Config

# Dashboards and automations shown on the site. Adding one = its folder + one line here
# (+ a sidebar link in web/templates/partials/sidebar.html).
MODULES = [
    'dashboards.incidents_operations',          # Incidents & Operations (also the landing page)
    'dashboards.scrum',                         # Naar Scrum Dashboard
    'automations.meta_campaign_stock.page',     # Meta Campaign Stock
]

app = Flask(__name__, template_folder='templates', static_folder='static')

# Load configuration (all values come from web/.env — see config.py)
app.config.from_object(config.get(Config.APP_ENV, config['default']))
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024   # reject request bodies over 1 MB

CORS(app, origins=Config.CORS_ORIGINS)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
if not app.debug:
    Config.LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(Config.LOG_DIR / 'website.log', maxBytes=1_000_000, backupCount=10)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
    app.logger.info('Naar Automations startup')

# Site login (DASHBOARD_PASSWORD) first, then every module's pages
init_auth(app)
for module in MODULES:
    app.register_blueprint(importlib.import_module(module).blueprint)


@app.context_processor
def shell_context():
    # The sidebar shows "Sign out" only when the login is on
    return {'login_enabled': bool(Config.DASHBOARD_PASSWORD)}

@app.after_request
def security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    if request.path.startswith('/api/'):
        response.headers.setdefault('Cache-Control', 'no-store')
    return response

@app.route('/healthz')
def healthz():
    return jsonify({'status': 'ok'})

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'Server Error: {error}')
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=Config.PORT, debug=app.config['DEBUG'])