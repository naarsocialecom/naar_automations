// PM2 setup for the Naar Automations website (every dashboard and automation page).
// Runs gunicorn from the repo root; the AWS load balancer forwards straight to port 5005 (no Nginx).
//   pm2 start /root/naar_automations/deploy/ecosystem.config.js && pm2 save
const ROOT = "/root/naar_automations";

module.exports = {
  apps: [
    {
      name: "naar-automations",
      cwd: ROOT,
      script: `${ROOT}/venv/bin/gunicorn`,
      // 2 workers: enough for the team and fits a 1 GB server (Chromium for the Slack picture needs room)
      args: "--workers 2 --bind 0.0.0.0:5005 --timeout 120 web.app:app",
      interpreter: "none",
      autorestart: true,
      out_file: `${ROOT}/logs/pm2-out.log`,
      error_file: `${ROOT}/logs/pm2-error.log`,
      time: true,
    },
  ],
};
