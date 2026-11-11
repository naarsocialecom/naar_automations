#!/usr/bin/env bash
# Daily run of the report on a laptop (cron / launchd). On the server use only the systemd
# timer in ../deploy/meta-campaign-stock.timer. Output goes to logs/daily.log.
cd "$(dirname "$0")/.." || exit 1
# cron and launchd start with a bare PATH; add the usual places node is installed
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
mkdir -p logs
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> logs/daily.log
node src/index.js >> logs/daily.log 2>&1
