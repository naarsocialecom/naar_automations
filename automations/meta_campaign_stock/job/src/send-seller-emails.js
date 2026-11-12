// Sends each campaign seller their own low-stock email (or, in test mode, sends every
// seller's email to the test inbox). At most one email per seller per day per mode, kept in
// exports/seller-email-log.json, so a second run the same day never emails anyone twice.
const fs = require("fs");
const path = require("path");
const { sendMail } = require("./graph-mail");

const LOG_FILE = "seller-email-log.json";
const KEEP_DAYS = 30;
const PAUSE_MS = 2500;   // stays well under Microsoft 365's 30 messages per minute

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLog(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

async function sendSellerEmails({ settings, preview, recipients, pdfDir, exportDir, log }) {
  const file = path.join(exportDir, LOG_FILE);
  const book = readLog(file);
  const day = today();
  book[day] = book[day] || {};
  const result = { mode: settings.mode, sent: 0, skipped: 0, failed: 0, errors: [] };

  for (const s of preview.sellers) {
    const real = recipients.get(s.sellerId);
    if (!real) { result.skipped++; continue; }                         // no valid email saved
    if (book[day][s.sellerId]?.[settings.mode]) { result.skipped++; continue; }   // already sent today
    const to = settings.mode === "on" ? [real] : settings.testTo;
    const subject = settings.mode === "test" ? `[TEST for ${s.storeName}] ${s.subject}` : s.subject;
    const attachments = s.attachment ? [{ fileName: s.attachment.fileName, path: path.join(pdfDir, s.attachment.file) }] : [];
    try {
      await sendMail(settings.graph, { from: settings.from, to, subject, html: s.html, attachments });
      book[day][s.sellerId] = { ...book[day][s.sellerId], [settings.mode]: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(book, null, 2));
      result.sent++;
      log(`Seller email (${settings.mode}) sent: ${s.storeName} -> ${settings.mode === "on" ? s.email : settings.testTo.join(", ")}`);
    } catch (err) {
      result.failed++;
      result.errors.push(`${s.storeName}: ${err.message}`);
      log(`Seller email (${settings.mode}) FAILED: ${s.storeName}: ${err.message}`);
      if (/sign-in failed|401|403/.test(err.message)) break;            // settings problem: stop, don't hammer
    }
    await sleep(PAUSE_MS);
  }

  // Keep the log short
  const days = Object.keys(book).sort().reverse();
  for (const d of days.slice(KEEP_DAYS)) delete book[d];
  fs.writeFileSync(file, JSON.stringify(book, null, 2));
  return result;
}

module.exports = { sendSellerEmails };
