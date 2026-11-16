#!/usr/bin/env bash
# Update the live site to the newest code on GitHub, as root:
#   bash /root/naar_automations/deploy/deploy.sh             # pull, update packages if needed, restart, check
#   bash /root/naar_automations/deploy/deploy.sh --force     # restart even when there is no new code
#   bash /root/naar_automations/deploy/deploy.sh --rollback  # go back to the code before the last deploy
#
# Safe to run any time: it stops (and changes nothing) when files were edited on the server, and
# it never touches .env, data/ or logs/. The scheduler crontab is not changed (start.sh does that).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the repo: /root/naar_automations on the server
JOB=$ROOT/automations/meta_campaign_stock/job
APP=naar-automations
PORT=5005
LAST=$ROOT/logs/last-deploy          # the commit that was live before the latest deploy
cd "$ROOT"
mkdir -p logs

step() { echo; echo "== $*"; }
note() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> logs/deploy.log; }

restart_and_check() {
  step "Restarting the website (pm2: $APP)"
  pm2 restart "$APP" --update-env >/dev/null
  step "Checking the website answers (port $PORT)"
  for _ in $(seq 1 15); do
    if curl -fsS "localhost:$PORT/healthz" >/dev/null 2>&1; then
      echo "   OK: the site is up"
      return 0
    fi
    sleep 2
  done
  echo "   NOT OK: the site does not answer. Last error lines:"
  pm2 logs "$APP" --err --lines 25 --nostream || true
  return 1
}

# ── Go back to the previous version
if [ "${1:-}" = "--rollback" ]; then
  [ -s "$LAST" ] || { echo "No earlier deploy saved, nothing to go back to."; exit 1; }
  prev=$(cat "$LAST")
  step "Going back to $(git log -1 --format='%h %s' "$prev")"
  git reset --hard --quiet "$prev"
  note "rollback to $(git rev-parse --short HEAD)"
  restart_and_check && echo && echo "Rolled back. Fix the problem on GitHub, then run deploy.sh again." || exit 1
  exit 0
fi

# ── 1. Nothing edited by hand on the server?
step "1/5 Checking the server copy"
branch=$(git rev-parse --abbrev-ref HEAD)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "   These files were changed on the server:"
  git status --short --untracked-files=no | sed 's/^/     /'
  echo "   Nothing was deployed. Undo them (git checkout -- <file>) or ask, then run this again."
  exit 1
fi
echo "   Clean, on branch $branch"

# ── 2. Newest code
step "2/5 Getting the newest code from GitHub ($branch)"
before=$(git rev-parse HEAD)
git fetch --quiet origin "$branch"
after=$(git rev-parse "origin/$branch")
if [ "$before" = "$after" ]; then
  echo "   Already up to date: $(git log -1 --format='%h %s')"
  if [ "${1:-}" != "--force" ]; then
    echo "   Nothing to do. (Add --force to restart anyway.)"
    exit 0
  fi
else
  git merge --ff-only --quiet "origin/$branch"
  echo "$before" > "$LAST"
  echo "   New:"
  git log --format='     %h %s' "$before..$after"
fi
changed=$(git diff --name-only "$before" "$after")

# ── 3. Packages, only when their lists changed
step "3/5 Packages"
if grep -qx 'requirements.txt' <<<"$changed"; then
  venv/bin/pip install -q -r requirements.txt && echo "   Python packages updated"
else
  echo "   Python: no change"
fi
if grep -q '^automations/meta_campaign_stock/job/package' <<<"$changed"; then
  (cd "$JOB" && npm ci --omit=dev --silent) && echo "   Meta job Node packages updated"
else
  echo "   Node: no change"
fi

# ── 4 + 5. Restart and check
if restart_and_check; then
  note "deploy $(git rev-parse --short "$before") -> $(git rev-parse --short HEAD) OK"
  echo
  echo "Done: $(git log -1 --format='%h %s')"
  echo "Open https://automations.naar.io and do a hard refresh (Cmd+Shift+R) to see page changes."
else
  note "deploy $(git rev-parse --short "$before") -> $(git rev-parse --short HEAD) FAILED health check"
  echo
  echo "The new code is in place but the site is not answering."
  echo "To go back to the version that worked:  bash $ROOT/deploy/deploy.sh --rollback"
  exit 1
fi
