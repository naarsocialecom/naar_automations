#!/usr/bin/env node
// "Send test emails now" on the Meta page: every seller's email from the latest preview
// (exports/email-preview.json) goes RIGHT NOW to the test address(es) set on the page, never to a
// seller. Prints one JSON line with the result, for the website.
//
//   node scripts/send-test-now.js
const fs = require("fs");
const path = require("path");
const { sellerEmail } = require("../src/config");     // loads the .env and the page's saved test addresses
const { sendMail } = require("../src/graph-mail");

const done = (result, code = 0) => { console.log(JSON.stringify(result)); process.exit(code); };

(async () => {
  const to = sellerEmail.testTo;
  if (!to.length) return done({ ok: false, error: "No test address set (Email to sellers → Test)" }, 1);
  const need = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "SELLER_EMAIL_FROM"].filter((k) => !process.env[k]);
  if (need.length) return done({ ok: false, error: `Email is not set up yet: ${need.join(", ")} missing in .env` }, 1);

  const exportDir = path.resolve(__dirname, "..", "exports");
  let preview;
  try {
    preview = JSON.parse(fs.readFileSync(path.join(exportDir, "email-preview.json"), "utf8"));
  } catch {
    return done({ ok: false, error: "No emails built yet. Press Test run first." }, 1);
  }
  const graph = { tenantId: process.env.GRAPH_TENANT_ID, clientId: process.env.GRAPH_CLIENT_ID, clientSecret: process.env.GRAPH_CLIENT_SECRET };
  const result = { ok: true, to, builtAt: preview.generatedAt, sent: 0, failed: 0, errors: [] };
  for (const s of preview.sellers) {
    const pdf = s.attachment;
    try {
      await sendMail(graph, {
        from: process.env.SELLER_EMAIL_FROM,
        to,
        subject: `[TEST for ${s.storeName}] ${s.subject}`,
        html: s.html,
        attachments: pdf ? [{ fileName: pdf.fileName, path: path.join(exportDir, "seller-pdfs", pdf.file) }] : [],
      });
      result.sent++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${s.storeName}: ${err.message}`);
      if (/sign-in failed|401|403/.test(err.message)) break;     // settings problem: stop
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  result.ok = result.failed === 0;
  done(result, result.ok ? 0 : 1);
})().catch((err) => done({ ok: false, error: err.message }, 1));
