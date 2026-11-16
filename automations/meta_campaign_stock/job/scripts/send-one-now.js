#!/usr/bin/env node
// "Send to seller" / "Send test to me" on the Meta page: ONE seller's low-stock email from today's
// preview (exports/email-preview.json), sent right now. Separate from the daily run and its
// Off / Test / On switch. Prints one JSON line with the result, for the website.
//
//   node scripts/send-one-now.js --seller <sellerId> --target seller   # to the seller's own address
//   node scripts/send-one-now.js --seller <sellerId> --target test     # to the page's test address(es)
//
// Safety:
//   - the email is today's preview only (stock from an older run could be wrong)
//   - the seller's address is read at send time from MongoDB (read only, one findOne) and never saved
//   - to a seller: at most MAX_PER_DAY manual emails a day, and GAP_MIN minutes between two
//   - DRY_SEND=true prints what it would send instead of sending (for testing)
const fs = require("fs");
const path = require("path");

const LOG_FILE = "seller-email-log.json";
const MAX_PER_DAY = 3;
const GAP_MIN = 10;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const done = (result, code = 0) => { console.log(JSON.stringify(result)); process.exit(code); };
const fail = (error) => done({ ok: false, error }, 1);
const dayOf = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
  return out;
}

const mask = (email) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
};

(async () => {
  const opt = args();
  if (!opt.seller || !ID_RE.test(opt.seller)) return fail("Unknown seller");
  if (!["seller", "test"].includes(opt.target)) return fail("target must be 'seller' or 'test'");

  const config = require("../src/config");           // loads the .env and the page's saved test addresses
  const exportDir = config.export.dir;
  const dry = process.env.DRY_SEND === "true";

  // Not while the daily run (or a website run) is busy: it writes the same files
  try {
    const pid = Number(fs.readFileSync(path.join(exportDir, ".run.lock"), "utf8").trim());
    if (pid) { try { process.kill(pid, 0); return fail("A run is in progress. Try again when it has finished."); } catch (e) { if (e.code === "EPERM") return fail("A run is in progress. Try again when it has finished."); } }
  } catch { /* no lock: idle */ }

  let preview;
  try {
    preview = JSON.parse(fs.readFileSync(path.join(exportDir, "email-preview.json"), "utf8"));
  } catch {
    return fail("No emails built yet. Press Test run first.");
  }
  const now = new Date();
  if (dayOf(preview.generatedAt) !== dayOf(now)) return fail("The emails are not from today, so the stock may have changed. Press Test run first, then send.");
  const s = (preview.sellers || []).find((x) => x.sellerId === opt.seller);
  if (!s) return fail("This seller is not in today's list (no low-stock products in a campaign store).");

  const logFile = path.join(exportDir, LOG_FILE);
  let book = {};
  try { book = JSON.parse(fs.readFileSync(logFile, "utf8")) || {}; } catch { /* first send */ }
  const day = dayOf(now);
  const manual = book[day]?.[s.sellerId]?.manual || [];

  let to;
  let subject = s.subject;
  if (opt.target === "test") {
    to = config.sellerEmail.testTo;
    if (!to.length) return fail("No test address set (Email to sellers → Test)");
    subject = `[TEST for ${s.storeName}] ${s.subject}`;
  } else {
    if (!s.email) return fail(`${s.storeName}: ${s.problem || "no email saved"}`);
    const real = manual.filter((m) => m.target === "seller");
    if (real.length >= MAX_PER_DAY) return fail(`${s.storeName} already got ${real.length} manual emails today (limit ${MAX_PER_DAY}).`);
    const last = real.length ? new Date(real[real.length - 1].at) : null;
    if (last && now - last < GAP_MIN * 60_000) {
      const wait = Math.ceil((GAP_MIN * 60_000 - (now - last)) / 60_000);
      return fail(`${s.storeName} was emailed a few minutes ago. Wait ${wait} more minute${wait === 1 ? "" : "s"}.`);
    }
    // The real address: read only, at send time, never written anywhere
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(config.mongo.uri, { serverSelectionTimeoutMS: 15000 });
    try {
      await client.connect();
      const doc = await client.db(config.mongo.dbName).collection("sellerdetails")
        .findOne({ userId: s.sellerId }, { projection: { _id: 0, email: 1 } });
      const email = String(doc?.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(`${s.storeName}: no valid email saved`);
      to = [email];
    } finally {
      await client.close().catch(() => {});
    }
  }

  const need = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "SELLER_EMAIL_FROM"].filter((k) => !process.env[k]);
  if (need.length && !dry) return fail(`Email is not set up yet: ${need.join(", ")} missing in .env`);

  const pdf = s.attachment;
  const mail = {
    from: process.env.SELLER_EMAIL_FROM,
    to,
    subject,
    html: s.html,
    attachments: pdf ? [{ fileName: pdf.fileName, path: path.join(exportDir, "seller-pdfs", pdf.file) }] : [],
  };
  if (dry) {
    console.error(`DRY_SEND: would send "${subject}" to ${to.map(mask).join(", ")}${pdf ? ` with ${pdf.fileName}` : ""}`);
  } else {
    const { sendMail } = require("../src/graph-mail");
    await sendMail({ tenantId: process.env.GRAPH_TENANT_ID, clientId: process.env.GRAPH_CLIENT_ID, clientSecret: process.env.GRAPH_CLIENT_SECRET }, mail);
  }

  // Log it next to the daily sends (re-read first so nothing written meanwhile is lost)
  try { book = JSON.parse(fs.readFileSync(logFile, "utf8")) || {}; } catch { book = {}; }
  book[day] = book[day] || {};
  const entry = book[day][s.sellerId] || {};
  entry.manual = [...(entry.manual || []), { at: now.toISOString(), target: opt.target, ...(dry ? { dry: true } : {}) }];
  book[day][s.sellerId] = entry;
  fs.writeFileSync(logFile, JSON.stringify(book, null, 2));

  done({
    ok: true,
    store: s.storeName,
    target: opt.target,
    to: opt.target === "seller" ? to.map(mask) : to,
    at: now.toISOString(),
    dry,
  });
})().catch((err) => fail(err.message));
