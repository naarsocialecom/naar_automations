"""Scheduled job of this automation (run by web/scheduler.py; time set on the Scheduler page)."""
from web.config import Config
from web.shared.system import find_node

JOBS = [{
    'id': 'meta-campaign-stock',
    'name': 'Meta Campaign Stock · Slack report',
    'description': 'Checks the stores in active Meta campaigns for low stock and posts the report + Excel to Slack.',
    'kind': 'Automation',
    'page': '/automations/meta-campaign-stock',
    'default_time': '11:00',
    # The job reads its own job/.env; RUN_TRIGGER marks the run as scheduled in its history
    'command': lambda: [find_node(Config.NODE_BIN) or 'node', 'src/index.js'],
    'cwd': Config.META_STOCK_DIR,
    'env': {'RUN_TRIGGER': 'schedule'},
}]
