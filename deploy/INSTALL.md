# Install on the server from scratch

Removes the old setup completely and installs Naar Automations fresh. Run as root. Do it between
11:05 AM and 6:30 PM IST. Never paste `.env` contents anywhere.

## 1. Keep the old settings files (to copy values from), then remove the old setup

```bash
mkdir -p /root/old-settings && chmod 700 /root/old-settings
cp /root/naar-jira-sprint-dashboard/backend/.env        /root/old-settings/website.env
cp /root/naar-jira-sprint-dashboard/product-export/.env /root/old-settings/meta.env

pm2 delete naar-dashboard && pm2 save --force
systemctl disable --now product-export.timer
rm -f /etc/systemd/system/product-export.service /etc/systemd/system/product-export.timer && systemctl daemon-reload
crontab -r
rm -rf /root/naar-jira-sprint-dashboard
```

## 2. Download and install

```bash
ssh-keygen -t ed25519 -f /root/.ssh/naar_automations -N "" -C "naar-automations-server"
cat /root/.ssh/naar_automations.pub        # GitHub → naar_automations → Settings → Deploy keys → Add (write off)
printf 'Host github.com\n  IdentityFile /root/.ssh/naar_automations\n  IdentitiesOnly yes\n' >> /root/.ssh/config
ssh -T git@github.com

cd /root && git clone git@github.com:naarsocialecom/naar_automations.git
bash /root/naar_automations/deploy/install.sh
```

## 3. Fill in the two settings files

Open the old file next to the new one and copy the values across:
```bash
cat /root/old-settings/website.env         # look only, don't share
nano /root/naar_automations/web/.env
```
`web/.env`: JIRA_* (domain, email, API token, board ID, project key), SLACK_BOT_TOKEN, SLACK_CHANNEL_ID,
DASHBOARD_PASSWORD (the team password), DASHBOARD_URL and CORS_ORIGINS = https://automations.naar.io
(or https://sprint-status.naar.io until the new domain works). SECRET_KEY is already filled in.

```bash
cat /root/old-settings/meta.env
nano /root/naar_automations/automations/meta_campaign_stock/job/.env
```
Meta `.env`: MONGO_URI, MONGO_DB_NAME, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, META_ACCESS_TOKEN,
META_AD_ACCOUNT_ID (and the other values from the old file). Keep `EXPORT_DIR=./exports` and `DRY_RUN=false`.

Test the Meta job without sending: `cd /root/naar_automations/automations/meta_campaign_stock/job && npm run export:dry`

## 4. Start

```bash
bash /root/naar_automations/deploy/start.sh
```
It refuses to start if a required setting is empty (and says which). Then open the site, sign in, and
check the times on the **Scheduler** page (switch a job off there if it shouldn't run yet).
When everything works: `rm -rf /root/old-settings`.

## Later: deploy new code

```bash
cd /root/naar_automations && git pull && bash deploy/install.sh && bash deploy/start.sh
```

## New domain automations.naar.io (AWS)

1. ACM certificate covering `automations.naar.io` (an existing `*.naar.io` works).
2. Load balancer HTTPS:443 listener: add the certificate; if rules match host names, add `automations.naar.io`.
3. DNS: `automations.naar.io` → CNAME / Alias to the load balancer.
4. Listener rule: host `sprint-status.naar.io` → Redirect 301 to `https://automations.naar.io/#{path}?#{query}`.
5. `web/.env`: DASHBOARD_URL and CORS_ORIGINS = `https://automations.naar.io`, then `bash deploy/start.sh`.
