# Moving production to Naar Automations & Dashboard (same server)

From the old `/root/naar-jira-sprint-dashboard` (pm2 `naar-dashboard`, old Meta timer) to the new
`/root/naar_automations` on the **same** server, then the new domain **automations.naar.io**.
The old folder stays as a backup. Do the switch (step 7) between **11:05 AM and 6:30 PM IST**,
so no scheduled job fires during it. Never paste `.env` contents or `repo_url.txt` anywhere.

## 0. On the Mac: get the code onto GitHub

```bash
cd "/Users/Grethena/Downloads/naar-live 3/naar_automations"
git status                                    # should be clean
git push origin feature/naar-automations
```
On GitHub: open the pull request `feature/naar-automations` → `main`, **Squash and merge**.

## 1. Server: look first (changes nothing)

```bash
sudo -i
free -h ; nproc ; df -h /                     # memory, CPUs, disk
node -v ; python3 --version
crontab -l
systemctl list-timers --all | grep -i -E "product|meta"
systemctl cat product-export.service | grep -E "WorkingDirectory|ExecStart"
ls /root/naar-jira-sprint-dashboard /root/naar-jira-sprint-dashboard/backend
```
Note the `WorkingDirectory` of the old Meta report: that folder is `OLD_META` below.

## 2. Swap (only if `free -h` shows Swap: 0B)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. GitHub access: read-only deploy key

```bash
ssh-keygen -t ed25519 -f /root/.ssh/naar_automations -N "" -C "naar-automations-server"
cat /root/.ssh/naar_automations.pub
```
GitHub → naar_automations → Settings → Deploy keys → Add deploy key (paste, leave "Allow write" off).
```bash
printf 'Host github.com\n  IdentityFile /root/.ssh/naar_automations\n  IdentitiesOnly yes\n' >> /root/.ssh/config
ssh -T git@github.com                         # "successfully authenticated"
cd /root && git clone git@github.com:naarsocialecom/naar_automations.git
cd /root/naar_automations && git log --oneline -1
```

## 4. Website

```bash
cd /root/naar_automations
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python -m playwright install --with-deps chromium
mkdir -p data logs
cp -a /root/naar-jira-sprint-dashboard/backend/data/. data/          # day notes, settings
cp /root/naar-jira-sprint-dashboard/backend/.env web/.env && chmod 600 web/.env
# settings the new version knows but the old file doesn't have (names only, no values):
comm -13 <(grep -o '^[A-Z_]*' web/.env | sort -u) <(grep -o '^[A-Z_]*' web/.env.example | sort -u)
nano web/.env
```
In `web/.env` set (add the lines that are missing):
```
APP_ENV=production
DEBUG=false
DASHBOARD_PASSWORD=<the team password>
SESSION_DAYS=30
NDO_DEVELOPER_UPDATES=false
DASHBOARD_URL=https://sprint-status.naar.io      # change to https://automations.naar.io in step 9
CORS_ORIGINS=https://sprint-status.naar.io       # same
SNAPSHOT_BASE_URL=
SNAPSHOT_BROWSER_CHANNEL=
```
(`NDO_POST_TIME_LABEL` and `META_STOCK_RUN_TIME` are no longer used; times are set on the Scheduler page.)

## 5. Meta Campaign Stock job

```bash
OLD_META=<WorkingDirectory from step 1>
cd /root/naar_automations/automations/meta_campaign_stock/job
npm ci --omit=dev
cp "$OLD_META/.env" .env && chmod 600 .env
mkdir -p exports && cp -a "$OLD_META/exports/." exports/ 2>/dev/null || true
npm run export:dry                            # builds the files, sends nothing
```

## 6. Test the new site on a spare port (old site keeps running)

```bash
cd /root/naar_automations
PORT=5006 venv/bin/gunicorn --workers 2 --bind 127.0.0.1:5006 web.app:app &
sleep 5
curl -s localhost:5006/healthz                                        # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" localhost:5006/               # 200 (login page)
SNAPSHOT_BASE_URL=http://127.0.0.1:5006 venv/bin/python -m dashboards.incidents_operations.daily check
SNAPSHOT_BASE_URL=http://127.0.0.1:5006 venv/bin/python -m dashboards.incidents_operations.daily preview /tmp/ndo.png
kill %1                                                                # stop the test copy
```
To look at it in a browser first, from the Mac: `ssh -L 5006:localhost:5006 <your usual ssh login>`
then open http://localhost:5006 (start the test copy again on the server).

## 7. Switch over (11:05 AM – 6:30 PM IST)

```bash
systemctl disable --now product-export.timer                 # old 11 AM job off
pm2 stop naar-dashboard                                       # old site off (kept for rollback)
pm2 start /root/naar_automations/deploy/ecosystem.config.js   # new site on port 5005
pm2 save
curl -s localhost:5005/healthz
```
Open the site, sign in, check every page. Then on **Scheduler** check the times and on/off
(defaults: Incidents & Operations 19:00, Meta 11:00) and switch on the schedule:
```bash
crontab /root/naar_automations/deploy/crontab                # replaces root's crontab (old lines were off)
cd /root/naar_automations && venv/bin/python -m web.scheduler list    # after a minute: "Scheduler running"
```

**Rollback** (if something is wrong): `pm2 stop naar-automations && pm2 start naar-dashboard`,
`crontab -r`, `systemctl enable --now product-export.timer`.

## 8. The next day: check

```bash
pm2 status ; venv/bin/python -m web.scheduler list
tail -30 /root/naar_automations/logs/jobs/meta-campaign-stock.log
tail -30 /root/naar_automations/logs/jobs/incidents-operations-slack.log
```
After a week without problems: `pm2 delete naar-dashboard && pm2 save` (the old folder can stay as an archive).

## 9. New domain automations.naar.io (AWS console)

1. **Certificate** (ACM, same region as the load balancer): use one that covers `automations.naar.io`
   (e.g. an existing `*.naar.io`), or request one and validate it by DNS.
2. **Load balancer** → HTTPS:443 listener → add the certificate; if rules match on host name,
   add `automations.naar.io` to the rule that forwards to the target group.
3. **DNS** (where naar.io is managed): `automations.naar.io` → CNAME / Alias to the load balancer's DNS name.
4. **Old address**: listener rule: host `sprint-status.naar.io` → Redirect 301 to
   `https://automations.naar.io/#{path}?#{query}`.
5. **Server**: in `web/.env` set `DASHBOARD_URL` and `CORS_ORIGINS` to `https://automations.naar.io`, then
   `pm2 restart naar-automations`. (The Slack message's "View full dashboard" link uses this.)

Everyone signs in once more on the new address (the login is per domain).
