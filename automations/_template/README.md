# Adding an automation

Branch: `automation/<name>/init` (see `docs/BRANCHING.md`).

```
automations/<name>/
├── README.md        what it does, what it reads/sends, settings, how to test, schedule
├── job/             the job itself (Node.js or Python) with its own .env.example; never sends
│                    anything in its dry run (DRY_RUN=true)
├── page/            optional: its page on the website (same layout as a dashboard:
│                    __init__.py exporting `blueprint`, routes.py, templates/, static/)
└── deploy/          its schedule: a systemd service + timer (preferred) or a crontab line
```

1. Build and test the job with its dry run first; real sends go to a test channel / number.
2. If it has a page: add `'automations.<name>.page'` to `MODULES` in `web/app.py` and a link under
   AUTOMATIONS in `web/templates/partials/sidebar.html`.
3. On the server: `npm ci --omit=dev` (Node) in `job/`, create `job/.env`, install `deploy/` files,
   and add it to the table in `deploy/SERVER_SETUP.md`.
4. One schedule only (timer *or* cron), so it never runs twice.
