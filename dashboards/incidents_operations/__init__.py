"""Incidents & Operations dashboard (see README.md)."""
from dashboards.incidents_operations.routes import ndo_bp as blueprint

# Its card on the home page
CARD = {
    'id': 'incidents-operations', 'kind': 'dashboard', 'title': 'Incidents & Operations', 'url': '/ndo',
    'icon': 'fa-headset', 'job': 'incidents-operations-slack',
    'description': 'Open NDO incidents and operations tickets: overall RAG, ages, requirement owners and the daily Slack summary.',
}
