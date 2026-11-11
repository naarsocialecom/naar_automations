# Naar Automations & Dashboard

One website (with a login) and the scheduled jobs behind it. Every dashboard and every
automation has its own folder with everything it needs.

| Part | Page | Runs |
|---|---|---|
| **Home** | `/` | A card with a live thumbnail for every dashboard and automation |
| **Incidents & Operations** | `/ndo` | Website + daily Slack summary (19:00 IST) |
| **Naar Scrum Dashboard** | `/dashboard` | Website |
| **Scheduler** | `/scheduler` | Every scheduled job: change its time or switch it off |
| **Meta Campaign Stock** | `/automations/meta-campaign-stock` | Daily Slack report (11:00 IST), or the page's **Test run** / **Send to Slack** buttons |

## Folders

```
naar_automations/
├── web/                          the website frame: login, sidebar, shared parts
│   ├── app.py  modules.py        the website · which dashboards/automations and jobs are on
│   ├── scheduler.py  schedules.py  runs every job at its time · the Scheduler page
│   ├── home.py                   the home page (cards from each module's CARD)
│   ├── auth.py  config.py        login · every setting (from web/.env)
│   ├── shared/                   Jira, Slack, page screenshots (used by several modules)
│   ├── templates/  static/       login page, sidebar, base CSS, helpers.js
│   └── .env.example
├── dashboards/                   one folder per dashboard
│   ├── incidents_operations/     routes, logic, page, jobs.py (7 PM post), README
│   ├── scrum/                    routes, page, charts, README + MODULE_MAP
│   └── _template/                how to add a dashboard
├── automations/                  one folder per automation
│   ├── meta_campaign_stock/
│   │   ├── job/                  the Node.js job (own .env)
│   │   ├── page/                 its page on the website
│   │   └── jobs.py               its daily run (11 AM)
│   └── _template/                how to add an automation
├── deploy/                       server: pm2 file, crontab (scheduler), SERVER_SETUP.md, Slack app manifest
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
cd web && ../venv/bin/python app.py                  # http://localhost:5005 · Ctrl+C stops it
```

Scheduled jobs don't run on a laptop unless you start the scheduler yourself
(`venv/bin/python -m web.scheduler`, once per minute). Incidents & Operations without posting: `venv/bin/python -m dashboards.incidents_operations.daily preview /tmp/ndo.png`.
The Meta job: see `automations/meta_campaign_stock/README.md`.

## Adding a dashboard or automation

Copy the steps in `dashboards/_template/README.md` or `automations/_template/README.md`.
Work on a branch named after it (see `docs/BRANCHING.md`).

## Server

See `deploy/SERVER_SETUP.md`.
