# Adding a dashboard

Branch: `dashboard/<name>/init` (see `docs/BRANCHING.md`).

1. Create `dashboards/<name>/` (lowercase, underscores) with:
   ```
   __init__.py        from dashboards.<name>.routes import <name>_bp as blueprint
   routes.py          <name>_bp = Blueprint('<name>', __name__, template_folder='templates',
                                            static_folder='static', static_url_path='/static/<name-with-dashes>')
   templates/<name>.html
   static/<name>.js  static/<name>.css
   README.md          what it shows, page URL, settings it needs, how to test
   ```
2. In the template: include the sidebar (`{% include 'partials/sidebar.html' %}`), load the
   shared `url_for('static', filename='css/style.css')` and `css/app-shell.css`, and your own
   files with `url_for('<name>.static', filename='<name>.js')`. Shared JS: `import … from '/static/js/helpers.js'`.
3. Render with `active_nav='<name>'`.
4. Switch it on: add `'dashboards.<name>'` to `MODULES` in `web/modules.py`, and a link under
   DASHBOARDS in `web/templates/partials/sidebar.html`.
5. A daily job (e.g. a Slack post)? Add a `jobs.py` (see `dashboards/incidents_operations/jobs.py`) and
   `'dashboards.<name>.jobs'` to `JOB_MODULES`; its time is then set on Automations → Schedules.
6. New settings go in `web/config.py` with a default and in `web/.env.example` (never real values).
