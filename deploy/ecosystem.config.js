// PM2 setup for the Naar Automations website (Sprint Dashboard, Data Operations, Automations).
// The AWS load balancer forwards straight to port 5005; there is no Nginx.
//   pm2 start /root/naar_automations/deploy/ecosystem.config.js && pm2 save
const ROOT = "/root/naar_automations/web/backend";

module.exports = {
  apps: [
    {
      name: "naar-dashboard",
      cwd: ROOT,
      script: `${ROOT}/venv/bin/gunicorn`,
      args: "--workers 4 --bind 0.0.0.0:5005 --timeout 120 app:app",
      interpreter: "none",
      autorestart: true,
      out_file: `${ROOT}/logs/pm2-out.log`,
      error_file: `${ROOT}/logs/pm2-error.log`,
      time: true,
    },
  ],
};
