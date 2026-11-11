#!/usr/bin/env bash
# One-time install (safe to run again) of Naar Automations on an Ubuntu server, as root:
#   bash /root/naar_automations/deploy/install.sh
# Installs Python packages, the browser for the Slack picture, and the Meta job's Node packages,
# and creates the two settings files from their templates if they don't exist yet.
set -euo pipefail
ROOT=/root/naar_automations
JOB=$ROOT/automations/meta_campaign_stock/job
cd "$ROOT"

echo "== System packages"
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip git curl >/dev/null
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs; }
command -v pm2 >/dev/null || npm install -g pm2

echo "== Website (Python)"
[ -d venv ] || python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt
venv/bin/python -m playwright install --with-deps chromium
mkdir -p data logs

echo "== Meta Campaign Stock job (Node)"
(cd "$JOB" && npm ci --omit=dev --silent)

echo "== Settings files"
if [ ! -f web/.env ]; then
  cp web/.env.example web/.env
  # A fresh random SECRET_KEY, so nobody has to make one by hand
  sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$(python3 -c 'import secrets;print(secrets.token_hex(32))')/" web/.env
  echo "   created web/.env (SECRET_KEY filled in)"
fi
if [ ! -f "$JOB/.env" ]; then
  cp "$JOB/.env.example" "$JOB/.env"
  echo "   created automations/meta_campaign_stock/job/.env"
fi
chmod 600 web/.env "$JOB/.env"

echo
echo "Installed. Next: fill in the two settings files, then run deploy/start.sh"
echo "   nano $ROOT/web/.env"
echo "   nano $JOB/.env"
