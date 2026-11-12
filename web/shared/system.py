"""Small helpers for starting jobs: finding Node.js and a clean environment."""
import os
import shutil
from typing import Dict, Optional

# Only these reach a job; each job reads everything else (Slack channel, tokens) from the .env itself,
# so the website's settings can never leak into an automation.
PASS_ENV = ('PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ')


def find_node(configured: str = '') -> Optional[str]:
    """Node.js binary: NODE_BIN, else PATH, else the usual install places (cron has a bare PATH)."""
    return configured or shutil.which('node') or next(
        (p for p in ('/usr/bin/node', '/usr/local/bin/node', '/opt/homebrew/bin/node') if os.path.exists(p)), None)


def clean_env(**extra: str) -> Dict[str, str]:
    env = {k: os.environ[k] for k in PASS_ENV if k in os.environ}
    env.setdefault('PATH', '/usr/local/bin:/usr/bin:/bin')
    env.update(extra)
    return env
