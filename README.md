# Naar Automations

One website (with a login) and the scheduled jobs behind it. Every dashboard and every
automation has its own folder with everything it needs.

| Part | Page | Runs |
|---|---|---|
| **Incidents & Operations** | `/` and `/ndo` | Website + 7 PM IST summary to Slack |
| **Naar Scrum Dashboard** | `/dashboard` | Website |
| **Meta Campaign Stock** | `/automations/meta-campaign-stock` | 11 AM IST timer, or the page's **Test run** / **Send to Slack** buttons |

## Folders

```
naar_automations/
├── web/                          the website frame: login, sidebar, shared parts
│   ├── app.py                    switches every dashboard / automation on (MODULES list)
│   ├── auth.py  config.py        login · every setting (from web/.env)
│   ├── shared/                   Jira, Slack, page screenshots (used by several modules)
│   ├── templates/  static/       login page, sidebar, base CSS, helpers.js
│   └── .env.example
├── dashboards/                   one folder per dashboard
│   ├── incidents_operations/     routes, logic, page, its 7 PM crontab, README
│   ├── scrum/                    routes, page, charts, README + MODULE_MAP
│   └── _template/                how to add a dashboard
├── automations/                  one folder per automation
│   ├── meta_campaign_stock/
│   │   ├── job/                  the Node.js job (own .env)
│   │   ├── page/                 its page on the website
│   │   └── deploy/               its systemd service + timer
│   └── _template/                how to add an automation
├── deploy/                       server-wide: pm2 file, SERVER_SETUP.md, Slack app manifest
├── docs/BRANCHING.md             how we branch, review and deploy
├── requirements.txt              Python packages for the website
├── data/  logs/                  created at runtime (not in git)
```

Settings with passwords live in `web/.env` and `automations/<name>/job/.env`: never in git
(copy from `.env.example`).

## Run on a laptop

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python -m playwright install chromium        # for the Slack picture
cp web/.env.example web/.env                           # fill in Jira, Slack; DASHBOARD_PASSWORD may stay blank locally
venv/bin/python -m web.app                             # http://localhost:5005 (run from the repo root)
```

Incidents & Operations without posting: `venv/bin/python -m dashboards.incidents_operations.daily preview /tmp/ndo.png`.
The Meta job: see `automations/meta_campaign_stock/README.md`.

## Adding a dashboard or automation

Copy the steps in `dashboards/_template/README.md` or `automations/_template/README.md`.
Work on a branch named after it (see `docs/BRANCHING.md`).

## Server

See `deploy/SERVER_SETUP.md`.
