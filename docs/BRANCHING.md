# Branching, review and deploy

`main` is production: the server runs exactly what is on `main`. Nobody pushes to `main`
directly; every change goes through a pull request.

## Branch names

| Branch | For | Example |
|---|---|---|
| `dashboard/<name>/<change>` | one dashboard | `dashboard/incidents-operations/owner-chart` |
| `automation/<name>/<change>` | one automation | `automation/meta-campaign-stock/whatsapp-send` |
| `platform/<change>` | shared parts: login, sidebar, `web/shared`, deploy | `platform/server-migration` |
| `fix/<name>/<problem>` | an urgent production fix | `fix/incidents-operations/slack-post-failed` |

`<name>` is the module's folder name with dashes (`incidents_operations` → `incidents-operations`).
Lowercase, dashes, short. One topic per branch; merge within a few days.

## Flow

```bash
git switch main && git pull
git switch -c dashboard/incidents-operations/owner-chart
# ...work, commit...
git push -u origin dashboard/incidents-operations/owner-chart
```

1. Open a pull request into `main` on GitHub (the template asks what was tested).
2. Someone reviews it; merge with **Squash and merge** (one clean commit on `main`).
3. Deploy on the server (see "Everyday commands" in `deploy/SERVER_SETUP.md`):
   `cd /root/naar_automations && git pull && pm2 restart naar-automations`
   (a change in an automation's `job/` needs `npm ci --omit=dev` in that folder; schedule
   times are changed on the website, not in code).
4. Delete the branch (GitHub offers a button after the merge).

## Rules

- A branch touches one module where possible. Shared code (`web/`, `deploy/`) goes on a
  `platform/` branch, because it affects every page.
- Never commit `.env` files, exports, seller data or `node_modules` (`.gitignore` covers them;
  check `git status` before committing).
- Anything that posts to Slack or messages people is tested with its dry run / preview first,
  and real sends go to the test channel or test number until the team agrees.

## GitHub settings (one time, repo admin)

Settings → Branches → Add rule for `main`: **Require a pull request before merging**
(optionally 1 approval) and **Do not allow bypassing**. Settings → General → Pull Requests:
allow **Squash merging** and tick **Automatically delete head branches**.
