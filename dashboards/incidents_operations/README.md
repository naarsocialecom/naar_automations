# Incidents & Operations

Open Jira tickets of the NDO project (Incidents and Operations) with the Overall RAG, age and
requirement-owner charts, and a short daily summary posted to Slack at 7 PM IST.

Page: `/` and `/ndo` · API: `/api/ndo/*` · Branch prefix: `dashboard/incidents-operations/`

| File | What it does |
|---|---|
| `routes.py` | The page and its API (Flask blueprint) |
| `service.py` | Jira query + cache, the daily post, Slack (uses `web/shared`) |
| `report.py` | Pure logic: RAG by incident priority, age buckets, the Slack text |
| `snapshot.py` | Back-up picture (Pillow) when the page screenshot fails |
| `store.py` | Per-day state in `data/ndo_state.json` |
| `ai_rephrase.py` | AI wording for developer updates (only when `NDO_DEVELOPER_UPDATES=true`) |
| `daily.py` | Command line: `check` / `preview` / `post` |
| `jobs.py` | Its scheduled job (default 19:00; change it on Scheduler) |
| `templates/ndo.html`, `static/ndo.js`, `static/ndo.css` | The page |

Overall RAG (incident priority only): **Critical** = a Critical incident is open ·
**Moderate** = a High incident is open · **On Track** = neither.

## Settings (`web/.env`)

`NDO_PROJECT_KEY`, `NDO_ISSUE_TYPES`, `NDO_EXCLUDED_STATUSES`, `JIRA_FIELD_SEVERITY`,
`JIRA_FIELD_REQUIREMENT_OWNER`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` (channel `C…` or a person `U…`),
`NDO_DEVELOPER_UPDATES` (default `false`).

## Test without posting (from the repo root)

```bash
venv/bin/python -m dashboards.incidents_operations.daily check              # Slack token and channel
venv/bin/python -m dashboards.incidents_operations.daily preview /tmp/ndo.png   # picture + message, nothing sent
```

## Schedule

The 7 PM post is the job `incidents-operations-slack` in `jobs.py`, run by `web/scheduler.py`.
Change its time or switch it off on the website: **Scheduler**.
