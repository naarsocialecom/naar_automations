#!/usr/bin/env node
// WhatsApp TEST send through Gupshup: one store's preview message (and its PDF, when a public
// URL for it is given) goes to a TEST number only. It never reads seller phone numbers or the
// database: the message comes from exports/whatsapp-preview.json (made by any report run).
//
//   node scripts/whatsapp-test.js --store "The Paper Collective" --to 916385046550          # shows what it would send
//   node scripts/whatsapp-test.js --store "The Paper Collective" --to 916385046550 --yes    # sends it
//   ... --file-url "https://<temporary link to the PDF>"                                    # also sends the PDF
//
// Safety: --to must be listed in WHATSAPP_TEST_NUMBERS (.env), and nothing is sent without --yes.
// Session messages like these only arrive if the test phone messaged the business number in the
// last 24 hours (send "hi" to it first). Real sending to sellers will use an approved template.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env") });

const API = "https://api.gupshup.io/wa/api/v1/msg";
const digits = (s) => String(s ?? "").replace(/\D/g, "");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") out.yes = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  return out;
}

function fail(msg) {
  console.error(`Not sent: ${msg}`);
  process.exit(1);
}

async function send(message, { apiKey, appName, source, destination }) {
  const body = new URLSearchParams({
    channel: "whatsapp",
    source,
    destination,
    "src.name": appName,
    message: JSON.stringify(message),
  });
  const res = await fetch(API, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok || (data.status && data.status !== "submitted")) {
    throw new Error(`Gupshup HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

(async () => {
  const opt = args();
  if (!opt.store || !opt.to) fail('use --store "<store name>" --to <test number with country code>');

  // The test number must be on the allow-list in .env; seller numbers never are
  const allowed = (process.env.WHATSAPP_TEST_NUMBERS || "").split(",").map(digits).filter(Boolean);
  const to = digits(opt.to);
  if (!allowed.includes(to)) fail(`${opt.to} is not in WHATSAPP_TEST_NUMBERS in .env`);

  const exportDir = path.resolve(__dirname, "..", process.env.EXPORT_DIR || "exports");
  let preview;
  try {
    preview = JSON.parse(fs.readFileSync(path.join(exportDir, "whatsapp-preview.json"), "utf8"));
  } catch {
    fail("no WhatsApp preview yet - run a test run first (npm run export:dry)");
  }
  const seller = preview.sellers.find((s) => s.storeName.toLowerCase() === opt.store.toLowerCase());
  if (!seller) fail(`"${opt.store}" is not in the latest preview. Stores: ${preview.sellers.map((s) => s.storeName).join(", ")}`);

  const pdf = seller.attachment;
  console.log(`Store:   ${seller.storeName} (${seller.productCount} low-stock products)`);
  console.log(`To:      +${to} (test number)`);
  console.log(`PDF:     ${!pdf ? "none (short list)" : opt["file-url"] ? `${pdf.fileName} from the given URL` : `${pdf.fileName} - NOT sent (no --file-url given)`}`);
  console.log(`\n${seller.message}\n`);
  if (!opt.yes) {
    console.log("Nothing sent. Add --yes to send this to the test number.");
    return;
  }

  const apiKey = process.env.GUPSHUP_API_KEY;
  const appName = process.env.GUPSHUP_APP_NAME;
  const source = digits(process.env.GUPSHUP_SOURCE_NUMBER);
  if (!apiKey || !appName || !source) fail("set GUPSHUP_API_KEY, GUPSHUP_APP_NAME and GUPSHUP_SOURCE_NUMBER in .env");
  const account = { apiKey, appName, source, destination: to };

  if (pdf && opt["file-url"]) {
    const r = await send({ type: "file", url: opt["file-url"], filename: pdf.fileName }, account);
    console.log(`PDF submitted to Gupshup (message ID ${r.messageId})`);
  }
  const r = await send({ type: "text", text: seller.message }, account);
  console.log(`Message submitted to Gupshup (message ID ${r.messageId})`);
  console.log("\"submitted\" means Gupshup accepted it; check the phone. If nothing arrives, check the message in Gupshup's dashboard logs.");
})().catch((err) => fail(err.message));
