"""
Automations pages: status of the scheduled jobs in automations/.

Meta campaign stock report (automations/meta-campaign-stock): each run appends to
exports/run-history.json; the page shows that history, the next run, the latest
dashboard image and a download of the latest Excel file. Read-only: nothing here
runs the job or posts to Slack.
"""
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, jsonify, render_template, send_file

from config import Config

logger = logging.getLogger(__name__)

automations_bp = Blueprint('automations', __name__)

HISTORY_FILE = 'run-history.json'


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
    return render_template('automation_meta_stock.html')


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
    })


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
