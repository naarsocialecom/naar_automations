const fs = require("fs");

// Reads the ACTIVE campaigns (Ads Manager "Delivery: Active") of each ad account
// from the Meta Marketing API. Read-only: it only sends GET requests, and the
// token needs nothing more than ads_read.
// Returns [{ id, name, account, objective, startTime, dailyBudget, lifetimeBudget, currency, insights }].
// Budgets and spend are in the account currency; insights are the last 7 days (null when unavailable).
async function metaGet(url, token, account) {
  // Token in the header, not the URL, so it never shows up in an error or log
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Meta API (${account}): ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

async function fetchActiveCampaigns({ token, accountIds, apiVersion }) {
  const base = `https://graph.facebook.com/${apiVersion}`;
  const campaigns = [];
  for (const raw of accountIds) {
    const account = raw.startsWith("act_") ? raw : `act_${raw}`;
    // Account currency (budgets come in its smallest unit, e.g. paise)
    let currency = null;
    try { currency = (await metaGet(`${base}/${account}?fields=currency`, token, account)).currency || null; } catch { /* optional */ }
    const params = new URLSearchParams({
      fields: "id,name,effective_status,objective,start_time,daily_budget,lifetime_budget",
      effective_status: JSON.stringify(["ACTIVE"]),
      limit: "200",
    });
    let url = `${base}/${account}/campaigns?${params}`;
    const found = [];
    while (url) {
      const body = await metaGet(url, token, account);
      found.push(...body.data.map((c) => ({
        id: c.id, name: c.name, account, currency,
        objective: c.objective || null,
        startTime: c.start_time || null,
        dailyBudget: c.daily_budget != null ? Number(c.daily_budget) / 100 : null,
        lifetimeBudget: c.lifetime_budget != null ? Number(c.lifetime_budget) / 100 : null,
        insights: null,
      })));
      url = body.paging?.next;
    }
    // Last 7 days' results per campaign; skipped quietly if the token can't read insights
    try {
      const ip = new URLSearchParams({ level: "campaign", date_preset: "last_7d", limit: "500",
        fields: "campaign_id,spend,impressions,clicks,reach" });
      let iurl = `${base}/${account}/insights?${ip}`;
      const byId = new Map(found.map((c) => [c.id, c]));
      while (iurl) {
        const body = await metaGet(iurl, token, account);
        for (const r of body.data || []) {
          const c = byId.get(r.campaign_id);
          if (c) c.insights = { spend: Number(r.spend || 0), impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0), reach: Number(r.reach || 0) };
        }
        iurl = body.paging?.next;
      }
    } catch { /* insights are extra; the report works without them */ }
    campaigns.push(...found);
  }
  return campaigns;
}

// Lower-case words only, padded with spaces so "includes" matches whole words:
// "Brown Bunny | Diwali" -> " brown bunny diwali "
const norm = (s) =>
  ` ${String(s ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

// Shop names shorter than this are too likely to match by accident ("ok", "abc")
const MIN_NAME_LENGTH = 4;

// Links each campaign to the seller(s) it promotes.
// 1. The mapping file wins: { "<campaign ID or exact name>": ["<shop name or seller userId>", ...] }
// 2. Otherwise a shop name that appears in the campaign name as whole words.
//    When one matched name sits inside a longer one ("Bunny" in "Brown Bunny"), only the longer counts.
// Returns campaigns with { sellers: [{ userId, storeName }], matchedBy, unresolved }.
function matchCampaigns(campaigns, sellers, mapping = {}) {
  const named = sellers
    .map((s) => ({ seller: s, key: norm(s.storeName) }))
    .filter((s) => s.key.trim().length >= MIN_NAME_LENGTH);
  const byId = new Map(sellers.map((s) => [s.userId, s]));

  return campaigns.map((c) => {
    const manual = mapping[c.id] ?? mapping[c.name];
    if (manual) {
      const found = [];
      const unresolved = [];
      for (const value of [].concat(manual)) {
        const hits = byId.has(value) ? [byId.get(value)] : sellers.filter((s) => norm(s.storeName) === norm(value));
        if (hits.length) found.push(...hits);
        else unresolved.push(value);
      }
      return { ...c, sellers: found, matchedBy: "mapping file", unresolved };
    }

    const name = norm(c.name);
    let hits = named.filter((s) => name.includes(s.key));
    hits = hits.filter((h) => !hits.some((o) => o.key.length > h.key.length && o.key.includes(h.key)));
    return {
      ...c,
      sellers: hits.map((h) => h.seller),
      matchedBy: hits.length ? "shop name in campaign name" : "not matched",
      unresolved: [],
    };
  });
}

// The mapping file is optional; a broken one is an error worth stopping for.
function loadMapping(file) {
  if (!file || !fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
}

module.exports = { fetchActiveCampaigns, matchCampaigns, loadMapping };
