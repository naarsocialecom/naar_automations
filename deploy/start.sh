#!/usr/bin/env bash
# Start (or restart) Naar Automations and switch on its scheduler, as root:
#   bash /root/naar_automations/deploy/start.sh
# Checks that the required settings are filled in (prints names only, never values).
set -euo pipefail
ROOT=/root/naar_automations
JOB=$ROOT/automations/meta_campaign_stock/job
cd "$ROOT"

missing=0
need() {   # need <file> <NAME>...: each NAME must have a value
  local file=$1; shift
  for name in "$@"; do
    if ! grep -qE "^${name}=.+" "$file" || grep -qE "^${name}=(https://your-site|https://dashboard.example.com|http://localhost)" "$file"; then
      echo "   missing in ${file#$ROOT/}: $name"; missing=1
    fi
  done
}
echo "== Checking settings"
need web/.env SECRET_KEY DASHBOARD_PASSWORD JIRA_DOMAIN JIRA_EMAIL JIRA_API_TOKEN JIRA_BOARD_ID JIRA_PROJECT_KEY \
     SLACK_BOT_TOKEN SLACK_CHANNEL_ID DASHBOARD_URL CORS_ORIGINS
need "$JOB/.env" MONGO_URI MONGO_DB_NAME SLACK_BOT_TOKEN SLACK_CHANNEL_ID META_ACCESS_TOKEN META_AD_ACCOUNT_ID
[ "$missing" = 0 ] || { echo "Fill these in, then run this again. Nothing was started."; exit 1; }

echo "== Website (pm2: naar-automations, port 5005)"
if pm2 describe naar-automations >/dev/null 2>&1; then
  pm2 restart naar-automations
else
  pm2 start "$ROOT/deploy/ecosystem.config.js"
fi
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null      # start again after a reboot
sleep 5
curl -fsS localhost:5005/healthz && echo

echo "== Scheduler (one crontab line, every minute)"
crontab "$ROOT/deploy/crontab"
venv/bin/python -m web.scheduler list
echo
echo "Running. Open the site, sign in, and check the times on the Scheduler page."
