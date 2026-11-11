"""Scheduled job of this dashboard (run by web/scheduler.py; time set on the Scheduler page)."""
import sys

from web.config import ROOT_DIR

JOBS = [{
    'id': 'incidents-operations-slack',
    'name': 'Incidents & Operations · Slack summary',
    'description': 'Posts the daily incidents & operations summary with the dashboard picture to Slack.',
    'kind': 'Dashboard',
    'page': '/ndo',
    'default_time': '19:00',
    'command': lambda: [sys.executable, '-m', 'dashboards.incidents_operations.daily', 'post'],
    'cwd': ROOT_DIR,
}]
