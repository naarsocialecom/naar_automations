"""
Site-wide login: one shared password (DASHBOARD_PASSWORD) for every page and API.

- Pages without a session show the sign-in form (HTTP 200, so the load balancer's health
  check on "/" keeps passing); API calls get 401.
- The server's own screenshot job (Slack image) sends INTERNAL_HEADER with a token derived
  from SECRET_KEY, so it gets in without a password.
- Changing DASHBOARD_PASSWORD signs everyone out.
- View links (Slack "View full dashboard"): <page>?view=<expiry>.<signature> opens that one page
  read-only without the password until the expiry (VIEW_LINK_DAYS). Viewers can only GET that page
  and its own data API; posting, other pages and settings still need the password.
"""
import hashlib
import hmac
import logging
import time
from datetime import timedelta

from flask import Blueprint, g, jsonify, redirect, render_template, request, session

from web.config import Config, ConfigError

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

INTERNAL_HEADER = 'X-Naar-Internal'
OPEN_PATHS = {'/login', '/logout', '/healthz'}
# What a view link may open, per page: the page itself and the GET API it loads its data from
VIEW_SCOPES = {
    '/ndo': ('/ndo', '/api/ndo/report'),
    '/automations/meta-campaign-stock': ('/automations/meta-campaign-stock', '/api/automations/meta-campaign-stock',
                                         '/api/automations/meta-campaign-stock/image.png',
                                         '/api/automations/meta-campaign-stock/report.xlsx'),
}


def internal_token() -> str:
    return hmac.new(Config.SECRET_KEY.encode(), b'internal-snapshot', hashlib.sha256).hexdigest()


def _password_id() -> str:
    """Stored in the session: a new password no longer matches, so old sessions end."""
    return hashlib.sha256(f"{Config.SECRET_KEY}:{Config.DASHBOARD_PASSWORD}".encode()).hexdigest()[:16]


def _safe_next(target: str) -> str:
    """Only same-site paths, never another host ("//evil.com", "https://...")."""
    if target and target.startswith('/') and not target.startswith('//') and '\\' not in target:
        return target
    return '/'


def _view_sig(page: str, expires: int) -> str:
    return hmac.new(Config.SECRET_KEY.encode(), f"view:{page}:{expires}".encode(), hashlib.sha256).hexdigest()[:32]


def view_link(page: str) -> str:
    """'/ndo?view=…': opens the page read-only, no password, for VIEW_LINK_DAYS."""
    expires = int(time.time()) + Config.VIEW_LINK_DAYS * 86400
    return f"{page}?view={expires}.{_view_sig(page, expires)}"


def _valid_view(page: str, token: str) -> int:
    """The expiry time when the token is valid for this page, else 0."""
    try:
        expires_s, sig = token.split('.', 1)
        expires = int(expires_s)
    except (ValueError, AttributeError):
        return 0
    if expires < time.time() or not hmac.compare_digest(sig, _view_sig(page, expires)):
        return 0
    return expires


def viewing_only() -> bool:
    """True for someone who came in through a view link (not signed in)."""
    return bool(getattr(g, 'view_only', False))


def signed_in() -> bool:
    return not Config.DASHBOARD_PASSWORD or session.get('pw') == _password_id()


def init_auth(app):
    app.register_blueprint(auth_bp)
    if not Config.DASHBOARD_PASSWORD:
        if Config.APP_ENV == 'production':
            raise ConfigError("Set DASHBOARD_PASSWORD in .env: the site needs a login in production.")
        logger.warning('DASHBOARD_PASSWORD is not set: no login (fine on a laptop, not on a server)')
        return

    app.permanent_session_lifetime = timedelta(days=Config.SESSION_DAYS)
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Lax',
                      SESSION_COOKIE_SECURE=Config.APP_ENV == 'production')

    @app.before_request
    def require_login():
        if request.path in OPEN_PATHS or request.path.startswith('/static/') or signed_in():
            return None
        if hmac.compare_digest(request.headers.get(INTERNAL_HEADER, ''), internal_token()):
            return None
        # A view link: remember it in this browser until it expires, then show the clean address
        token = request.args.get('view')
        if token and request.method == 'GET' and request.path in VIEW_SCOPES:
            expires = _valid_view(request.path, token)
            if expires:
                session['view'] = {'page': request.path, 'until': expires}
                return redirect(request.path)
        view = session.get('view') or {}
        if request.method == 'GET' and view.get('until', 0) > time.time() \
                and request.path in VIEW_SCOPES.get(view.get('page'), ()):
            g.view_only = True
            return None
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Sign in required'}), 401
        query = request.query_string.decode()
        return render_template('login.html', next=request.path + (f'?{query}' if query else ''))


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if not Config.DASHBOARD_PASSWORD:
        return redirect('/')
    next_url = _safe_next(request.values.get('next', '/'))
    if request.method == 'POST':
        if hmac.compare_digest(request.form.get('password', '').encode(), Config.DASHBOARD_PASSWORD.encode()):
            session.clear()
            session.permanent = True
            session['pw'] = _password_id()
            return redirect(next_url)
        time.sleep(1)   # slows down password guessing
        logger.warning(f"Failed sign-in from {request.headers.get('X-Forwarded-For', request.remote_addr)}")
        return render_template('login.html', next=next_url, error='Wrong password, try again.'), 401
    if signed_in():
        return redirect(next_url)
    return render_template('login.html', next=next_url)


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect('/')
