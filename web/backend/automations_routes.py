"""
Automations pages: status of the scheduled jobs in automations/.

Meta campaign stock report (automations/meta-campaign-stock): each run appends to
exports/run-history.json; the page shows that history, the next run, the latest
dashboard image and a download of the latest Excel file. Its buttons start a test run
(nothing sent) or a real run (posts to Slack) in the background; the job's own lock
file keeps it to one run at a time, also against the 11 AM timer.
"""
import json
import logging
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, jsonify, render_template, request, send_file

from config import Config

logger = logging.getLogger(__name__)

automations_bp = Blueprint('automations', __name__)

HISTORY_FILE = 'run-history.json'
LOCK_FILE = '.run.lock'
# Output of the latest run started from the website
RUN_LOG = 'dashboard-run.log'
WHATSAPP_PREVIEW = 'whatsapp-preview.json'
# Only these reach the job; it reads everything else (Slack channel, tokens) from its own .env
PASS_ENV = ('PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ')


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


def _node() -> Optional[str]:
    return Config.NODE_BIN or shutil.which('node') or next(
        (p for p in ('/usr/bin/node', '/usr/local/bin/node', '/opt/homebrew/bin/node') if os.path.exists(p)), None)


def _next_run(now: datetime) -> datetime:
    hour, minute = (int(x) for x in Config.META_STOCK_RUN_TIME.split(':'))
    run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return run if run > now else run + timedelta(days=1)


def _file_info(path: Optional[Path]) -> Optional[dict]:
    if not path:
        return None
    return {'name': path.name, 'updated_at': datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat()}


@automations_bp.route('/automations/meta-campaign-stock')
def meta_stock_page():
    return render_template('automation_meta_stock.html', active_nav='meta-stock')


@automations_bp.route('/api/automations/meta-campaign-stock', methods=['GET'])
def meta_stock_status():
    tz = ZoneInfo(Config.REPORT_TIMEZONE)
    now = datetime.now(tz)
    return jsonify({
        'runs': _history(),
        'next_run': _next_run(now).isoformat(),
        'run_time_label': f"{Config.META_STOCK_RUN_TIME} {now.strftime('%Z')}",
        'timezone': Config.REPORT_TIMEZONE,
        'image': _file_info(_latest_image()),
        'excel': _file_info(_latest_excel()),
        'running': _running_pid() is not None,
        'whatsapp': _whatsapp_preview(),
        'run_log': _log_tail(),
    })


@automations_bp.route('/api/automations/meta-campaign-stock/run', methods=['POST'])
def meta_stock_run():
    mode = (request.get_json(silent=True) or {}).get('mode')
    if mode not in ('dry', 'send'):
        return jsonify({'error': "mode must be 'dry' or 'send'"}), 400
    if _running_pid():
        return jsonify({'error': 'A run is already in progress. Wait for it to finish.'}), 409
    node = _node()
    if not node:
        return jsonify({'error': 'Node.js was not found on the server (set NODE_BIN in web/backend/.env).'}), 500

    env = {k: os.environ[k] for k in PASS_ENV if k in os.environ}
    env.update(DRY_RUN='true' if mode == 'dry' else 'false', RUN_TRIGGER='dashboard')
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
