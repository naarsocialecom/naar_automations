#!/usr/bin/env python3
"""
Build the one settings file <repo>/.env from <repo>/.env.example: same keys, same order.
Values are taken (never printed) from the existing <repo>/.env and, the first time, from the
old web/.env and automations/meta_campaign_stock/job/.env (those are then renamed to .env.old).
Keys the template doesn't have are dropped. A backup of <repo>/.env is saved as .env.bak.

  python3 deploy/tidy_env.py           # laptop: keeps the "# prod" lines
  python3 deploy/tidy_env.py --prod    # server: leaves the "# prod" lines out
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET, TEMPLATE = ROOT / '.env', ROOT / '.env.example'
OLD_WEB = ROOT / 'web' / '.env'
OLD_JOB = ROOT / 'automations' / 'meta_campaign_stock' / 'job' / '.env'
LINE = re.compile(r'^\s*(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$')


def values(path: Path) -> dict:
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            m = LINE.match(line)
            if m and not m.group(1):
                out[m.group(2)] = m.group(3)
    return out


def main():
    prod = '--prod' in sys.argv[1:]
    # Old per-folder files first, then the root file wins. The Meta job's own Slack channel
    # becomes META_SLACK_CHANNEL_ID (SLACK_CHANNEL_ID is the Incidents & Operations one).
    job = values(OLD_JOB)
    if 'SLACK_CHANNEL_ID' in job:
        job.setdefault('META_SLACK_CHANNEL_ID', job.pop('SLACK_CHANNEL_ID'))
    current = {**job, **values(OLD_WEB), **values(TARGET)}

    out, kept, added = [], set(), []
    for line in TEMPLATE.read_text().splitlines():
        m = LINE.match(line)
        if not m:
            # Section titles and blank lines come from the template as they are
            if line.strip() == '' or (line.startswith('# ') and '=' not in line):
                out.append(line)
            continue
        commented, key, default = m.groups()
        if commented:
            if not prod:
                out.append(f"# {key}={default}")
            continue
        if key in current:
            out.append(f"{key}={current[key]}")
            kept.add(key)
        else:
            out.append(f"{key}={default}")
            added.append(key)

    if TARGET.exists():
        shutil.copy2(TARGET, TARGET.with_name('.env.bak'))
    TARGET.write_text('\n'.join(out).strip() + '\n')
    TARGET.chmod(0o600)
    for old in (OLD_WEB, OLD_JOB):
        if old.exists():
            old.rename(old.with_name('.env.old'))
            print(f"moved into .env: {old.relative_to(ROOT)} (kept as .env.old)")
    dropped = sorted(set(current) - kept)
    print(f".env: {len(kept)} values kept, {len(added)} added from the template{': ' + ', '.join(added) if added else ''}")
    if dropped:
        print(f"   not used any more (left out): {', '.join(dropped)}")


if __name__ == '__main__':
    main()
