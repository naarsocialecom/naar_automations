"""
What the site is made of. Adding a dashboard or automation = its folder + a line here
(+ a sidebar link in web/templates/partials/sidebar.html).
"""

# Pages: each package exports `blueprint` (its routes, template and JS/CSS)
MODULES = [
    'dashboards.incidents_operations',          # Incidents & Operations (also the landing page)
    'dashboards.scrum',                         # Naar Scrum Dashboard
    'automations.meta_campaign_stock.page',     # Meta Campaign Stock
]

# Scheduled jobs: each module exports `JOBS` (see web/scheduler.py). Their times are set on
# the website (Automations → Schedules) and run by web/scheduler.py, started every minute by cron.
JOB_MODULES = [
    'dashboards.incidents_operations.jobs',
    'automations.meta_campaign_stock.jobs',
]
