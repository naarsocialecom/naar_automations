# Naar Scrum Dashboard

Jira sprint progress for the scrum team: sprint selector, issue-type / priority / component
charts, the epic table and the daily highlights ticket.

Page: `/dashboard` · API: `/api/sprints`, `/api/sprint/<id>`, `/api/issues`, `/api/active-sprint`,
`/api/highlights`, `/api/settings` · Branch prefix: `dashboard/scrum/`

- `routes.py`: the page and its API (Flask blueprint)
- `templates/scrum.html`, `static/js/`, `static/css/`: the page; which JS file does what is in `MODULE_MAP.md`

Settings (`.env`): `JIRA_BOARD_ID`, `JIRA_PROJECT_KEY`, `EPIC_TABLE_PAGE_SIZE`,
`JIRA_FIELD_PLATFORM`, `JIRA_FIELD_HIGHLIGHTS`, `JIRA_HIGHLIGHTS_TICKET`.
