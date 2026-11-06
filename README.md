# Naar Automations

One website and the scheduled jobs behind it.

| Part | What it does | Runs |
|---|---|---|
| **Sprint Dashboard** (`/`) | Jira sprint progress, highlights, charts | Website |
| **Data Operations** (`/ndo`) | NDO incidents and operations, daily summary to Slack | Website + 6 PM reminder and 7 PM post |
| **Meta Campaign Stock** (`/automations/meta-campaign-stock`) | Active Meta campaigns and their stores' low stock, posted to Slack | 11 AM IST timer; the page shows its runs |

## Folders

```
naar_automations/
├── web/                         the website (Flask + gunicorn, port 5005)
│   ├── backend/                 Python: pages, APIs, Jira, Slack, login; settings in backend/.env
│   ├── frontend/                templates, CSS, JS
│   └── requirements.txt
├── automations/
│   └── meta-campaign-stock/     Node.js job: MongoDB (read only) + Meta → Slack; settings in its .env
├── deploy/                      how the server runs it: PM2, cron, systemd timer, Slack app, setup guide
└── docs/                        MODULE_MAP.md (which frontend file does what)
```

Each part keeps its own `.env` (never in git; copy from `.env.example`).

## Run on a laptop

```bash
cd web/backend
python3 -m venv venv && venv/bin/pip install -r ../requirements.txt
cp .env.example .env            # fill in Jira, Slack, AI; DASHBOARD_PASSWORD can stay blank locally
venv/bin/python app.py          # http://localhost:5005
```

The report job: see `automations/meta-campaign-stock/README.md`.

## Server

See `deploy/SERVER_SETUP.md`.
