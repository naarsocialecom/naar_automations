# Naar Automations — Server Setup

How production runs (EC2, ap-south-2, behind the AWS load balancer for https://sprint-status.naar.io).
Everything lives in `/root/naar_automations` and runs as root. The load balancer sends traffic
straight to port 5005 (no Nginx).

| Part | How it runs | File |
|---|---|---|
| Website, port 5005 (every page) | PM2 → gunicorn, 4 workers | `deploy/ecosystem.config.js` |
| Incidents & Operations 7 PM post | root's crontab (UTC) | `dashboards/incidents_operations/crontab` |
| Meta Campaign Stock, 11 AM IST | systemd timer | `automations/meta_campaign_stock/deploy/` |
| Slack app permissions | Slack app manifest | `deploy/slack-app-manifest.yaml` |

---

## 0. Fresh Ubuntu server (t2.medium, Ubuntu 22.04/24.04) — one time

```bash
sudo -i                                             # everything runs as root
apt update && apt upgrade -y
apt install -y git curl python3-venv python3-pip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2
# 2 GB swap: headroom for Chromium (7 PM picture) next to the website
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Keep the server clock on UTC (the crontab times are UTC). In AWS: give the instance an
Elastic IP (MongoDB Atlas allows it by IP), the same security group as the old server (load
balancer → port 5005), and register it in the load balancer's target group.

GitHub access (read-only deploy key, so no personal password sits on the server):

```bash
ssh-keygen -t ed25519 -f /root/.ssh/naar_automations -N "" -C "naar-automations-server"
cat /root/.ssh/naar_automations.pub     # GitHub → repo → Settings → Deploy keys → Add (leave "write" off)
printf 'Host github.com\n  IdentityFile /root/.ssh/naar_automations\n  IdentitiesOnly yes\n' >> /root/.ssh/config
ssh -T git@github.com                   # "successfully authenticated"
```

## 1. Get the code

```bash
cd /root
git clone git@github.com:naarsocialecom/naar_automations.git
cd naar_automations
```

## 2. Website

```bash
cd /root/naar_automations
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python -m playwright install --with-deps chromium     # for the 7 PM Slack picture
cp web/.env.example web/.env && chmod 600 web/.env && nano web/.env
```

In `web/.env` for production: `APP_ENV=production`, `DEBUG=false`, a fresh `SECRET_KEY`,
`DASHBOARD_PASSWORD` (the team password; the site won't start without it),
`DASHBOARD_URL=https://sprint-status.naar.io`, `CORS_ORIGINS` = that URL,
`SNAPSHOT_BASE_URL` and `SNAPSHOT_BROWSER_CHANNEL` blank, `NDO_DEVELOPER_UPDATES=false`,
plus the Jira and Slack values.

```bash
mkdir -p logs data
pm2 start /root/naar_automations/deploy/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root     # start again after a reboot
curl -s localhost:5005/healthz             # {"status": "ok"}
```

The 7 PM screenshot opens `http://127.0.0.1:5005/ndo` itself and gets past the login with an
internal key derived from `SECRET_KEY`.

## 3. Incidents & Operations: 7 PM post

Test first (posts nothing):

```bash
cd /root/naar_automations
venv/bin/python -m dashboards.incidents_operations.daily check
venv/bin/python -m dashboards.incidents_operations.daily preview /tmp/ndo.png
```

Switch the schedule on (only once the old server's crontab is off):

```bash
crontab -l                                     # check nothing else is in there you need to keep
crontab /root/naar_automations/dashboards/incidents_operations/crontab
crontab -l
```

Slack: the bot needs `chat:write`, `chat:write.customize`, `files:write`, `users:read`, `im:write`
(see `slack-app-manifest.yaml`) and must be invited to the channel. `SLACK_CHANNEL_ID` can be a
channel ID (C…) or a person's member ID (U…) for a direct message.

## 4. Meta Campaign Stock (11 AM IST)

```bash
cd /root/naar_automations/automations/meta_campaign_stock/job
npm ci --omit=dev                                   # Node 18+
cp .env.example .env && chmod 600 .env && nano .env  # MongoDB (read only), Slack, Meta
npm run export:dry                                  # builds the files, sends nothing
```

Switch the timer on (only once the old server's timer is off):

```bash
cp /root/naar_automations/automations/meta_campaign_stock/deploy/meta-campaign-stock.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now meta-campaign-stock.timer
systemctl list-timers meta-campaign-stock.timer     # NEXT = 05:30 UTC (11:00 IST)
```

The server's IP must be allowed in MongoDB Atlas → Network Access. Use only this timer
(not cron or PM2 as well), or the report posts twice.

---

## Everyday commands

| Task | Command |
|---|---|
| Deploy new code (after a merge into `main`) | `cd /root/naar_automations && git pull && pm2 restart naar-automations` |
| …if an automation's `job/` changed | also `cd automations/<name>/job && npm ci --omit=dev` |
| …if a crontab or timer changed | install it again (sections 3 / 4) |
| Website status / logs | `pm2 status` · `pm2 logs naar-automations` · `tail -50 logs/website.log` |
| 7 PM job log | `tail -50 /root/naar_automations/logs/incidents-operations-daily.log` |
| Meta report: next run / logs | `systemctl list-timers meta-campaign-stock.timer` · `journalctl -u meta-campaign-stock -n 50` |
| Meta report: run once now (posts!) | `systemctl start meta-campaign-stock.service` |

## Troubleshooting

- **Site down after a deploy:** `pm2 logs naar-automations --lines 50`. "Set DASHBOARD_PASSWORD" means
  it's missing from `web/.env`.
- **Slack picture is the plain drawn card:** Chromium is missing — rerun the Playwright install above.
- **Report fails with a MongoDB timeout:** the server IP isn't in Atlas → Network Access.
- **Charts empty / Jira errors:** the `JIRA_API_TOKEN` in `web/.env` expired.
