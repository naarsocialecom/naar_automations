"""
The one scheduler for every dashboard and automation job.

Each module lists its jobs in a `jobs.py` (registered in web/modules.py: JOB_MODULES). The time
and on/off of each job are set on the website (Scheduler) and saved in
data/schedules.json. On the server, cron starts this every minute (deploy/crontab):

    python -m web.scheduler              # check: start every job whose time has come (once a day)
    python -m web.scheduler list         # show the jobs, their times and last runs
    python -m web.scheduler run <id>     # run one job now and record it (used by the check itself)

A job runs once per day: at its time, or within GRACE_MINUTES after it (if the server was busy).
Changing the time to later the same day after it already ran does not run it twice that day.
"""
import fcntl
import importlib
import json
import os
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

from web.config import Config, ROOT_DIR
from web.modules import JOB_MODULES
from web.shared.system import clean_env

SCHEDULES_FILE = Config.DATA_DIR / 'schedules.json'      # time + on/off per job (the website writes it)
RUNS_FILE = Config.DATA_DIR / 'schedule-runs.json'       # last run per job + heartbeat (the scheduler writes it)
LOCK_FILE = Config.DATA_DIR / 'scheduler.lock'
JOB_LOG_DIR = Config.LOG_DIR / 'jobs'
GRACE_MINUTES = 30
JOB_TIMEOUT_SECONDS = 30 * 60


def tz() -> ZoneInfo:
    return ZoneInfo(Config.REPORT_TIMEZONE)


def now() -> datetime:
    return datetime.now(tz())


# ── Jobs and their settings ───────────────────────────────────
def all_jobs() -> List[Dict]:
    jobs = []
    for module in JOB_MODULES:
        jobs.extend(importlib.import_module(module).JOBS)
    return jobs


def job(job_id: str) -> Optional[Dict]:
    return next((j for j in all_jobs() if j['id'] == job_id), None)


def _read(path: Path) -> Dict:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: Path, data: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)


@contextmanager
def _locked():
    """One writer at a time (cron check, job runs, website saves)."""
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_FILE, 'w') as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def settings(job_def: Dict, saved: Dict = None) -> Dict:
    saved = (saved if saved is not None else _read(SCHEDULES_FILE)).get(job_def['id']) or {}
    return {'time': saved.get('time') or job_def['default_time'], 'enabled': saved.get('enabled', True),
            'updated_at': saved.get('updated_at')}


def valid_time(value: str) -> bool:
    try:
        datetime.strptime(value, '%H:%M')
        return len(value) == 5
    except (TypeError, ValueError):
        return False


def save_settings(job_id: str, time: str = None, enabled: bool = None) -> Dict:
    """Called by the website. Returns the job's new settings."""
    job_def = job(job_id)
    if not job_def:
        raise KeyError(job_id)
    if time is not None and not valid_time(time):
        raise ValueError('Time must be HH:MM (24-hour), e.g. 19:00')
    with _locked():
        data = _read(SCHEDULES_FILE)
        current = settings(job_def, data)
        data[job_id] = {
            'time': time if time is not None else current['time'],
            'enabled': bool(enabled) if enabled is not None else current['enabled'],
            'updated_at': now().isoformat(timespec='seconds'),
        }
        _write(SCHEDULES_FILE, data)
    return settings(job_def)


def _today_at(hhmm: str, at: datetime) -> datetime:
    hour, minute = (int(x) for x in hhmm.split(':'))
    return at.replace(hour=hour, minute=minute, second=0, microsecond=0)


def next_run(job_def: Dict, at: datetime = None, runs: Dict = None) -> Optional[datetime]:
    """When the job runs next (None when it is switched off)."""
    at = at or now()
    s = settings(job_def)
    if not s['enabled']:
        return None
    runs = runs if runs is not None else _read(RUNS_FILE)
    ran_today = (runs.get('jobs', {}).get(job_def['id']) or {}).get('last_date') == at.date().isoformat()
    today = _today_at(s['time'], at)
    return today if today > at and not ran_today else today + timedelta(days=1)


def time_label(hhmm: str) -> str:
    """'19:00' → '7:00 PM IST'."""
    t = datetime.strptime(hhmm, '%H:%M')
    return f"{t.strftime('%I:%M %p').lstrip('0')} {now().strftime('%Z')}"


def status() -> Dict:
    """Everything the Scheduler page shows."""
    at = now()
    runs = _read(RUNS_FILE)
    beat = runs.get('heartbeat')
    alive = bool(beat) and (at - datetime.fromisoformat(beat)).total_seconds() < 180
    out = []
    for j in all_jobs():
        s = settings(j)
        run = (runs.get('jobs') or {}).get(j['id']) or {}
        nxt = next_run(j, at, runs)
        out.append({
            'id': j['id'], 'name': j['name'], 'description': j['description'], 'kind': j['kind'],
            'page': j['page'], 'time': s['time'], 'time_label': time_label(s['time']),
            'default_time': j['default_time'], 'enabled': s['enabled'], 'updated_at': s['updated_at'],
            'next_run': nxt.isoformat() if nxt else None, 'last_run': run or None,
            'log': log_tail(j['id']),
        })
    return {'jobs': out, 'timezone': Config.REPORT_TIMEZONE, 'tz_abbr': at.strftime('%Z'), 'scheduler_running': alive,
            'heartbeat': beat, 'now': at.isoformat()}


def log_tail(job_id: str, lines: int = 15) -> List[str]:
    try:
        return (JOB_LOG_DIR / f'{job_id}.log').read_text(errors='replace').splitlines()[-lines:]
    except OSError:
        return []


# ── Running ───────────────────────────────────────────────────
def _record(job_id: str, **fields) -> None:
    with _locked():
        runs = _read(RUNS_FILE)
        runs.setdefault('jobs', {}).setdefault(job_id, {}).update(fields)
        _write(RUNS_FILE, runs)


def check() -> None:
    """Every minute: start each switched-on job whose time has come and that hasn't run today."""
    at = now()
    due = []
    with _locked():
        runs = _read(RUNS_FILE)
        runs['heartbeat'] = at.isoformat(timespec='seconds')
        saved = _read(SCHEDULES_FILE)
        for j in all_jobs():
            s = settings(j, saved)
            start = _today_at(s['time'], at)
            last = (runs.get('jobs') or {}).get(j['id']) or {}
            if s['enabled'] and start <= at < start + timedelta(minutes=GRACE_MINUTES) \
                    and last.get('last_date') != at.date().isoformat():
                # Claimed before starting, so the next minute's check can't start it again
                runs.setdefault('jobs', {})[j['id']] = {**last, 'last_date': at.date().isoformat(),
                                                        'status': 'starting', 'started_at': at.isoformat(timespec='seconds')}
                due.append(j['id'])
        _write(RUNS_FILE, runs)
    for job_id in due:
        print(f"{at:%Y-%m-%d %H:%M} starting {job_id}", flush=True)
        # Detached, so a long job never holds up the next minute's check
        subprocess.Popen([sys.executable, '-m', 'web.scheduler', 'run', job_id], cwd=ROOT_DIR,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)


def run(job_id: str) -> int:
    job_def = job(job_id)
    if not job_def:
        print(f"No job '{job_id}'. Jobs: {', '.join(j['id'] for j in all_jobs())}")
        return 2
    started = now()
    _record(job_id, status='running', started_at=started.isoformat(timespec='seconds'), finished_at=None,
            exit_code=None, last_date=started.date().isoformat())
    JOB_LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = JOB_LOG_DIR / f'{job_id}.log'
    # Keep the log small: only the latest runs
    try:
        if log_path.stat().st_size > 500_000:
            log_path.write_text(log_path.read_text(errors='replace')[-100_000:])
    except OSError:
        pass
    with open(log_path, 'a') as log:
        log.write(f"\n===== {started:%Y-%m-%d %H:%M:%S %Z} · {job_def['name']} =====\n")
        log.flush()
        try:
            code = subprocess.run(job_def['command'](), cwd=job_def['cwd'], env=clean_env(**job_def.get('env', {})),
                                  stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                  timeout=JOB_TIMEOUT_SECONDS).returncode
        except subprocess.TimeoutExpired:
            log.write(f"Stopped: took longer than {JOB_TIMEOUT_SECONDS // 60} minutes\n")
            code = -1
        except OSError as e:
            log.write(f"Could not start: {e}\n")
            code = -2
    _record(job_id, status='ok' if code == 0 else 'failed', exit_code=code,
            finished_at=now().isoformat(timespec='seconds'))
    return code


def _print_list() -> None:
    st = status()
    print(f"Scheduler {'running' if st['scheduler_running'] else 'NOT running (no check in the last 3 minutes)'}"
          f" · times in {st['timezone']}")
    for j in st['jobs']:
        last = j['last_run'] or {}
        print(f"- {j['id']}: {j['time_label'] if j['enabled'] else 'OFF'} · next {j['next_run'] or '-'}"
              f" · last {last.get('started_at', '-')} {last.get('status', '')}")


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        check()
    elif args[0] == 'list':
        _print_list()
    elif args[0] == 'run' and len(args) == 2:
        sys.exit(run(args[1]))
    else:
        print(__doc__)
        sys.exit(2)
