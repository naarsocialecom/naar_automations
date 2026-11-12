#!/usr/bin/env node
// Seller email TEST send through Microsoft Graph: one store's email (as built by the latest run)
// goes to a TEST address only. It never reads seller addresses: the email comes from
// exports/email-preview.json (made by any run, also a test run).
//
//   npm run email:test -- --store "The Paper Collective" --to you@naar.io          # shows what it would send
//   npm run email:test -- --store "The Paper Collective" --to you@naar.io --yes    # sends it
//
// Safety: --to must be a test address set on the Meta page (Email to sellers → Test), and nothing is sent without --yes.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env") });
const { sendMail } = require("../src/graph-mail");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--yes") out.yes = true;
    else if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}
const fail = (msg) => { console.error(`Not sent: ${msg}`); process.exit(1); };

(async () => {
  const opt = args();
  if (!opt.store || !opt.to) fail('use --store "<store name>" --to <test address>');
  const { sellerEmail } = require("../src/config");
  const to = opt.to.trim().toLowerCase();
  if (!sellerEmail.testTo.includes(to)) fail(`${opt.to} is not a test address (set it on the Meta page: Email to sellers → Test)`);

  const exportDir = path.resolve(__dirname, "..", process.env.EXPORT_DIR || "exports");
  let preview;
  try {
    preview = JSON.parse(fs.readFileSync(path.join(exportDir, "email-preview.json"), "utf8"));
  } catch {
    fail("no email preview yet - run a test run first (npm run export:dry)");
  }
  const seller = preview.sellers.find((s) => s.storeName.toLowerCase() === opt.store.toLowerCase());
  if (!seller) fail(`"${opt.store}" is not in the latest preview. Stores: ${preview.sellers.map((s) => s.storeName).join(", ")}`);

  const pdf = seller.attachment;
  console.log(`Store:    ${seller.storeName} (${seller.productCount} low-stock products)`);
  console.log(`To:       ${to} (test address)`);
  console.log(`Subject:  [TEST for ${seller.storeName}] ${seller.subject}`);
  console.log(`PDF:      ${pdf ? pdf.fileName : "none (short list)"}`);
  console.log(`\n${seller.text}\n`);
  if (!opt.yes) return console.log("Nothing sent. Add --yes to send this to the test address.");

  const need = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "SELLER_EMAIL_FROM"].filter((k) => !process.env[k]);
  if (need.length) fail(`set ${need.join(", ")} in .env`);
  await sendMail(
    { tenantId: process.env.GRAPH_TENANT_ID, clientId: process.env.GRAPH_CLIENT_ID, clientSecret: process.env.GRAPH_CLIENT_SECRET },
    {
      from: process.env.SELLER_EMAIL_FROM,
      to: [to],
      subject: `[TEST for ${seller.storeName}] ${seller.subject}`,
      html: seller.html,
      attachments: pdf ? [{ fileName: pdf.fileName, path: path.join(exportDir, "seller-pdfs", pdf.file) }] : [],
    },
  );
  console.log(`Sent to ${to} from ${process.env.SELLER_EMAIL_FROM}. Check the inbox (and the spam folder the first time).`);
})().catch((err) => fail(err.message));
