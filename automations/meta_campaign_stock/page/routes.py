"""
Automations pages: status of the scheduled jobs in automations/.

Meta campaign stock report (automations/meta_campaign_stock/job): each run appends to
exports/run-history.json; the page shows that history, the next run, the latest
dashboard image and a download of the latest Excel file. Its buttons start a test run
(nothing sent) or a real run (posts to Slack) in the background; the job's own lock
file keeps it to one run at a time, also against the 11 AM timer.
"""
import json
import logging
import os
import re
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from flask import Blueprint, abort, jsonify, render_template, request, send_file

from web import scheduler
from web.auth import viewing_only
from web.config import Config
from web.shared.system import clean_env, find_node

logger = logging.getLogger(__name__)

automations_bp = Blueprint('meta_campaign_stock', __name__, template_folder='templates',
                           static_folder='static', static_url_path='/static/meta-campaign-stock')

HISTORY_FILE = 'run-history.json'
LOCK_FILE = '.run.lock'
# Output of the latest run started from the website
RUN_LOG = 'dashboard-run.log'
WHATSAPP_PREVIEW = 'whatsapp-preview.json'
# Seller emails as the latest run built them (addresses masked; the page's Off/Test/On says if they are sent)
EMAIL_PREVIEW = 'email-preview.json'
# What the page's dashboard shows: campaigns, stores, low-stock products (written by every run)
DASHBOARD_DATA = 'dashboard.json'
# Settings changed on this page (kept on the server, survive restarts and deploys); the job reads them too
SETTINGS_FILE = 'meta-campaign-stock.json'
SELLER_EMAIL_MODES = ('off', 'test', 'on')
# PDFs with a store's full list, attached when the list is too long for the message
SELLER_PDFS = 'seller-pdfs'
PDF_NAME = re.compile(r'^[A-Za-z0-9_-]{1,80}\.pdf$')
# The scheduled job's id (automations/meta_campaign_stock/jobs.py): its time is set on the Scheduler page
JOB_ID = 'meta-campaign-stock'


def _latest(pattern: str) -> Optional[Path]:
    """Newest file in the export folder matching the pattern (None when there is none)."""
    files = [f for f in Config.META_STOCK_EXPORT_DIR.glob(pattern) if f.is_file()]
    return max(files, key=lambda f: f.stat().st_mtime) if files else None


def _latest_excel() -> Optional[Path]:
    return _latest(f"{Config.META_STOCK_FILE_PREFIX}_*.xlsx")


def _latest_image() -> Optional[Path]:
    return _latest(f"{Config.META_STOCK_FILE_PREFIX}_*_dashboard.png")


def _history() -> list:
    file = Config.META_STOCK_EXPORT_DIR / HISTORY_FILE
    try:
        runs = json.loads(file.read_text())
        return runs if isinstance(runs, list) else []
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as e:
        logger.warning(f"Could not read {file}: {e}")
        return []


EMAIL_RE = re.compile(r'^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$')


def _read_settings() -> dict:
    try:
        saved = json.loads((Config.DATA_DIR / SETTINGS_FILE).read_text())
        return saved if isinstance(saved, dict) else {}
    except (OSError, ValueError):
        return {}


def _settings() -> dict:
    """Seller emails: mode (off|test|on) and the test inbox(es), both chosen on this page."""
    saved = _read_settings()
    mode = saved.get('seller_email_mode')
    return {'seller_email_mode': mode if mode in SELLER_EMAIL_MODES else 'off',
            'test_to': [a for a in saved.get('test_to') or [] if isinstance(a, str)],
            'updated_at': saved.get('updated_at')}


def _email_setup() -> dict:
    """Whether sending can work at all (Microsoft 365 app + sender filled in in .env)."""
    sender = os.getenv('SELLER_EMAIL_FROM') or ''
    ready = bool(sender) and all(os.getenv(k) for k in ('GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET'))
    # Test emails carry every seller's list, so they may only go to the company's own domain
    return {'ready': ready, 'from': sender, 'domain': sender.split('@')[-1].lower() if '@' in sender else ''}


def _dashboard() -> Optional[dict]:
    try:
        return json.loads((Config.META_STOCK_EXPORT_DIR / DASHBOARD_DATA).read_text())
    except (OSError, ValueError):
        return None


def _email_preview() -> Optional[dict]:
    try:
        return json.loads((Config.META_STOCK_EXPORT_DIR / EMAIL_PREVIEW).read_text())
    except (OSError, ValueError):
        return None


def _whatsapp_preview() -> Optional[dict]:
    """Latest WhatsApp preview from the job (numbers already masked; nothing has been sent)."""
    try:
        return json.loads((Config.META_STOCK_EXPORT_DIR / WHATSAPP_PREVIEW).read_text())
    except (OSError, ValueError):
        return None


def _running_pid() -> Optional[int]:
    """Process ID of the run in progress (timer or website), None when idle."""
    try:
        pid = int((Config.META_STOCK_EXPORT_DIR / LOCK_FILE).read_text().strip())
        os.kill(pid, 0)
        return pid
    except PermissionError:
        return pid
    except (OSError, ValueError):
        return None


def _log_tail(lines: int = 40) -> Optional[dict]:
    log = Config.META_STOCK_EXPORT_DIR / RUN_LOG
    try:
        text = log.read_text(errors='replace').splitlines()[-lines:]
        return {'lines': text, 'updated_at': datetime.fromtimestamp(log.stat().st_mtime).astimezone().isoformat()}
    except OSError:
        return None


def _file_info(path: Optional[Path]) -> Optional[dict]:
    if not path:
        return None
    return {'name': path.name, 'updated_at': datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat()}


@automations_bp.route('/automations/meta-campaign-stock')
def meta_stock_page():
    return render_template('meta_campaign_stock.html', active_nav='meta-stock', viewer=viewing_only())


@automations_bp.route('/api/automations/meta-campaign-stock', methods=['GET'])
def meta_stock_status():
    job = scheduler.job(JOB_ID)
    plan = scheduler.settings(job)
    nxt = scheduler.next_run(job)
    return jsonify({
        'runs': _history(),
        'next_run': nxt.isoformat() if nxt else None,
        'run_time_label': scheduler.time_label(plan['time']) if plan['enabled'] else 'Off',
        'timezone': Config.REPORT_TIMEZONE,
        'image': _file_info(_latest_image()),
        'excel': _file_info(_latest_excel()),
        'running': _running_pid() is not None,
        'whatsapp': _whatsapp_preview(),
        'dashboard': _dashboard(),
        # Seller addresses (masked) and the email texts are for the team, not for view-link visitors
        'seller_email': None if viewing_only() else _email_preview(),
        'settings': None if viewing_only() else {**_settings(), 'email': _email_setup()},
        'viewer': viewing_only(),
        'run_log': _log_tail(),
    })


@automations_bp.route('/api/automations/meta-campaign-stock/settings', methods=['POST'])
def meta_stock_settings():
    """Seller emails Off / Test / On and the test inbox, from the page. Signed-in team only."""
    if request.headers.get('X-Naar-Request') != '1':
        return jsonify({'error': 'Missing X-Naar-Request header'}), 403
    body = request.get_json(silent=True) or {}
    current = _settings()
    setup = _email_setup()
    mode = body.get('seller_email_mode', current['seller_email_mode'])
    if mode not in SELLER_EMAIL_MODES:
        return jsonify({'error': "seller_email_mode must be 'off', 'test' or 'on'"}), 400
    test_to = current['test_to']
    if 'test_to' in body:
        raw = body['test_to'] if isinstance(body['test_to'], str) else ''
        test_to = list(dict.fromkeys(a.strip().lower() for a in re.split(r'[,;\s]+', raw) if a.strip()))
        bad = [a for a in test_to if not EMAIL_RE.match(a)]
        if bad:
            return jsonify({'error': f"Not an email address: {', '.join(bad)}"}), 400
        outside = [a for a in test_to if setup['domain'] and not a.endswith('@' + setup['domain'])]
        if outside:
            return jsonify({'error': f"Test emails can only go to @{setup['domain']} addresses (they contain every seller's list)"}), 400
    if mode != 'off' and not setup['ready']:
        return jsonify({'error': 'Email is not set up yet: fill in GRAPH_* and SELLER_EMAIL_FROM in .env'}), 400
    if mode == 'test' and not test_to:
        return jsonify({'error': 'Type the email address the test emails should go to'}), 400
    file = Config.DATA_DIR / SETTINGS_FILE
    file.parent.mkdir(parents=True, exist_ok=True)
    saved = {**_read_settings(), 'seller_email_mode': mode, 'test_to': test_to,
             'updated_at': datetime.now().astimezone().isoformat(timespec='seconds')}
    tmp = file.with_suffix('.tmp')
    tmp.write_text(json.dumps(saved, indent=2))
    os.replace(tmp, file)
    logger.info(f"Meta Campaign Stock: seller emails {mode}, {len(test_to)} test address(es), set from the page")
    return jsonify({**_settings(), 'email': setup})


@automations_bp.route('/api/automations/meta-campaign-stock/run', methods=['POST'])
def meta_stock_run():
    mode = (request.get_json(silent=True) or {}).get('mode')
    if mode not in ('dry', 'send'):
        return jsonify({'error': "mode must be 'dry' or 'send'"}), 400
    if _running_pid():
        return jsonify({'error': 'A run is already in progress. Wait for it to finish.'}), 409
    node = find_node(Config.NODE_BIN)
    if not node:
        return jsonify({'error': 'Node.js was not found on the server (set NODE_BIN in .env).'}), 500

    env = clean_env(DRY_RUN='true' if mode == 'dry' else 'false', RUN_TRIGGER='dashboard')
    Config.META_STOCK_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    with open(Config.META_STOCK_EXPORT_DIR / RUN_LOG, 'w') as log:
        log.write(f"{'Test run (nothing sent)' if mode == 'dry' else 'Real run (posts to Slack)'} "
                  f"started {datetime.now().astimezone():%d %b %Y %H:%M}\n")
        log.flush()
        proc = subprocess.Popen([node, 'src/index.js'], cwd=Config.META_STOCK_DIR, env=env,
                                stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                start_new_session=True)
    # Reap the process when it ends so it doesn't linger as a zombie
    threading.Thread(target=proc.wait, daemon=True).start()
    # Answer once the job holds its lock, so a second click right away sees "running"
    for _ in range(50):
        if _running_pid() or proc.poll() is not None:
            break
        time.sleep(0.1)
    logger.info(f"Meta campaign stock {mode} run started from the dashboard (pid {proc.pid})")
    return jsonify({'started': True, 'mode': mode}), 202


@automations_bp.route('/api/automations/meta-campaign-stock/seller-pdf/<name>', methods=['GET'])
def meta_stock_seller_pdf(name):
    """The PDF a seller would get with the WhatsApp message (team only, behind the login)."""
    path = Config.META_STOCK_EXPORT_DIR / SELLER_PDFS / name
    if not PDF_NAME.match(name) or not path.is_file():
        abort(404)
    return send_file(path, mimetype='application/pdf', max_age=0)


@automations_bp.route('/api/automations/meta-campaign-stock/image.png', methods=['GET'])
def meta_stock_image():
    path = _latest_image()
    if not path:
        abort(404)
    return send_file(path, mimetype='image/png', max_age=0)


@automations_bp.route('/api/automations/meta-campaign-stock/report.xlsx', methods=['GET'])
def meta_stock_excel():
    path = _latest_excel()
    if not path:
        abort(404)
    return send_file(path, as_attachment=True, download_name=path.name, max_age=0,
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
