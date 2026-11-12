#!/usr/bin/env python3
"""
Rewrite a real .env to match its .env.example: same keys, same order, nothing else.
Existing values are kept (and never printed); keys the template doesn't have are dropped;
keys missing from the .env get the template's value. A backup is saved as .env.bak first.

  python3 deploy/tidy_env.py web/.env                      # on a laptop: keeps the "# prod" lines
  python3 deploy/tidy_env.py web/.env --prod               # on the server: no "# prod" lines
  python3 deploy/tidy_env.py automations/meta_campaign_stock/job/.env [--prod]
"""
import re
import shutil
import sys
from pathlib import Path

LINE = re.compile(r'^\s*(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$')


def values(path: Path) -> dict:
    out = {}
    for line in path.read_text().splitlines():
        m = LINE.match(line)
        if m and not m.group(1):
            out[m.group(2)] = m.group(3)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    env = Path(sys.argv[1])
    prod = '--prod' in sys.argv[2:]
    template = env.with_name(env.name + '.example')
    if not template.exists():
        sys.exit(f"No template {template}")
    current = values(env) if env.exists() else {}
    out, kept, added = [], [], []
    for line in template.read_text().splitlines():
        m = LINE.match(line)
        if not m:
            continue
        commented, key, default = m.groups()
        if commented:
            if not prod:
                out.append(f"# {key}={default}")      # the server's value, for reference
            continue
        if key in current:
            out.append(f"{key}={current[key]}")
            kept.append(key)
        else:
            out.append(f"{key}={default}")
            added.append(key)
    dropped = sorted(set(current) - set(kept))
    if env.exists():
        shutil.copy2(env, env.with_name(env.name + '.bak'))
    env.write_text('\n'.join(out) + '\n')
    env.chmod(0o600)
    print(f"{env}: {len(kept)} kept, {len(added)} added from the template{': ' + ', '.join(added) if added else ''}")
    if dropped:
        print(f"   removed (not used any more): {', '.join(dropped)}")
    print(f"   backup: {env.name}.bak")


if __name__ == '__main__':
    main()
