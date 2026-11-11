"""Naar Scrum Dashboard (see README.md)."""
from dashboards.scrum.routes import scrum_bp as blueprint

# Its card on the home page
CARD = {
    'id': 'scrum', 'kind': 'dashboard', 'title': 'Naar Scrum Dashboard', 'url': '/dashboard', 'icon': 'fa-columns',
    'description': 'Sprint progress from Jira: issue types, priorities, components, platforms and epics.',
}
