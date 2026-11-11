# Meta Campaign Stock — daily to Slack

Page: `/automations/meta-campaign-stock` · Branch prefix: `automation/meta-campaign-stock/`

| Folder | What's in it |
|---|---|
| `job/` | The Node.js job (own `.env`, `package.json`); its files and run history go to `job/exports/` |
| `page/` | Its page on the website: status, latest picture and Excel, **Test run** / **Send to Slack**, WhatsApp preview |
| `jobs.py` | Its scheduled job (default 11:00 IST; change it on Automations → Schedules) |

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
**Automations → Schedules**. Don't also add it to cron, PM2 or systemd, or the report posts twice.

## WhatsApp (preview only)

Each run writes `job/exports/whatsapp-preview.json` (numbers masked) and seller PDFs; nothing is sent.
`npm run whatsapp:test` sends one store's message to a number in `WHATSAPP_TEST_NUMBERS` only.
