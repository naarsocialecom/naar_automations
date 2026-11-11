# Adding an automation

Branch: `automation/<name>/init` (see `docs/BRANCHING.md`).

```
automations/<name>/
├── README.md        what it does, what it reads/sends, settings, how to test, schedule
├── job/             the job itself (Node.js or Python) with its own .env.example; never sends
│                    anything in its dry run (DRY_RUN=true)
├── page/            optional: its page on the website (same layout as a dashboard:
│                    __init__.py exporting `blueprint` and `CARD` (kind: 'automation'), routes.py,
│                    templates/, static/)
└── jobs.py          its schedule: JOBS = [{id, name, description, kind, page, default_time,
                     command, cwd, env}] (see automations/meta_campaign_stock/jobs.py)
```

1. Build and test the job with its dry run first; real sends go to a test channel / number.
2. Add `'automations.<name>.jobs'` to `JOB_MODULES` in `web/modules.py`: it then shows on
   **Scheduler**, where its time is set and it can be switched off.
3. If it has a page: add `'automations.<name>.page'` to `MODULES` in `web/modules.py` and a link under
   AUTOMATIONS in `web/templates/partials/sidebar.html`.
4. On the server: `npm ci --omit=dev` (Node) in `job/` and create `job/.env`. No cron or timer of
   its own: the scheduler runs it.
