# Meta Campaign Stock — daily to Slack

Page: `/automations/meta-campaign-stock` · Branch prefix: `automation/meta-campaign-stock/`

| Folder | What's in it |
|---|---|
| `job/` | The Node.js job (own `.env`, `package.json`); its files and run history go to `job/exports/` |
| `page/` | Its page on the website: status, latest picture and Excel, **Test run** / **Send to Slack**, WhatsApp preview |
| `jobs.py` | Its scheduled job (default 11:00 IST; change it on Scheduler) |

The job runs once a day:

1. Reads active products from MongoDB (**read only**: write stages `$out` / `$merge` are refused).
2. Reads the active Meta (Ads Manager) campaigns with a read-only token and matches each one to a
   seller by the shop name in the campaign name, or by `meta-campaign-sellers.json`.
3. Checks only the stores in those campaigns: every product variant with less than
   `LOW_STOCK_THRESHOLD` (5) in stock is flagged. Other stores are not in the report.
4. Builds an Excel file (tabs: Meta campaigns, Below 5 - campaign stores, Campaign store products)
   and a dashboard image, posts both with a summary to Slack, and deletes the previous day's post.

No port, domain or Nginx is needed: it only makes outgoing connections (MongoDB, graph.facebook.com,
slack.com). The server's IP must be allowed in MongoDB Atlas → Network Access.

## Setup

```bash
cd /root/naar_automations/automations/meta_campaign_stock/job
npm ci --omit=dev                # Node 18+
cp .env.example .env && chmod 600 .env && nano .env
npm run export:dry               # builds the files, sends nothing
npm run export                   # real run: posts to SLACK_CHANNEL_ID
```

Unmatched campaigns (no shop name in the campaign name) are listed as "not matched, not used".
To link one to a seller, add it to `meta-campaign-sellers.json`:
`{ "<campaign name or ID>": ["<shop name or seller userId>"] }`.

Each run (also a dry run or a failed one) is added to `job/exports/run-history.json`, which the
website's **Automations → Meta Campaign Stock** page reads, together with the newest picture
and Excel file in `job/exports/`. File names keep the `product-export_` prefix so the Slack clean-up
still recognises older posts.

## Schedule

The daily run is the job `meta-campaign-stock` in `jobs.py`, run by `web/scheduler.py`
(cron starts it every minute on the server). Change the time or switch it off on the website:
**Scheduler**. Don't also add it to cron, PM2 or systemd, or the report posts twice.

## Email to sellers (Microsoft 365)

Each campaign seller gets **their own** email: only their store and their low-stock products (a table;
more than 10 products → the 5 lowest in the table and the full list as a PDF attachment). The address
comes from `sellerdetails.email`; the dashboard only shows it masked. `SELLER_EMAIL_MODE` in `job/.env`:

| Mode | What the daily run does |
|---|---|
| `off` (default) | builds the preview only (Meta page → Email to sellers) |
| `test` | sends every seller's email to `SELLER_EMAIL_TEST_TO` instead (subject starts with `[TEST for <store>]`) |
| `on` | sends each seller their own email, once per day |

Test one store's email to yourself: `npm run email:test -- --store "Doodleholic" --to you@naar.io --yes`
(the address must be in `SELLER_EMAIL_TEST_TO`). Sends are logged in `job/exports/seller-email-log.json`.

**Setup (Microsoft 365 admin):**
1. Exchange admin centre → create a **shared mailbox** `low-stocks@naar.io` (no licence needed).
2. Entra ID → App registrations → the app → API permissions → Microsoft Graph → **Application** permission
   **Mail.Send** → Grant admin consent. (Mail.Read is not needed.) Certificates & secrets → new client secret.
3. Limit the app to that one mailbox (otherwise Mail.Send can send as anyone), in Exchange Online PowerShell:
   ```powershell
   New-DistributionGroup -Name "Naar low-stock senders" -Alias lowstocksenders -Type Security -Members low-stocks@naar.io
   New-ApplicationAccessPolicy -AppId <client-id> -PolicyScopeGroupId lowstocksenders@naar.io -AccessRight RestrictAccess -Description "Naar low-stock emails"
   Test-ApplicationAccessPolicy -AppId <client-id> -Identity low-stocks@naar.io    # Granted
   Test-ApplicationAccessPolicy -AppId <client-id> -Identity someone.else@naar.io  # Denied
   ```
4. `job/.env`: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `SELLER_EMAIL_FROM=low-stocks@naar.io`,
   `SELLER_EMAIL_TEST_TO=<your address>`, `SELLER_EMAIL_MODE=test` (later `on`).
5. Delivery to Gmail/Outlook/etc.: `naar.io` should have SPF (`include:spf.protection.outlook.com`), DKIM
   (Microsoft 365 Defender → Email authentication → DKIM → enable for naar.io) and a DMARC record.

## WhatsApp (preview only)

Each run writes `job/exports/whatsapp-preview.json` (numbers masked) and seller PDFs; nothing is sent.
`npm run whatsapp:test` sends one store's message to a number in `WHATSAPP_TEST_NUMBERS` only.
