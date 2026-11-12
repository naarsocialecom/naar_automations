// Low-stock email to each campaign store's seller: one email per seller, only that seller's
// store and products. This file only BUILDS the emails (subject, HTML, plain text); sending is
// done by index.js through Microsoft Graph, and only when the Meta page's Off/Test/On allows it.
//
// Up to MAX_PRODUCTS products go in the email's table. A longer list shows the SHORT_LIST lowest
// ones and attaches the full list as a PDF (the same PDF the WhatsApp preview uses).
const MAX_PRODUCTS = 10;
const SHORT_LIST = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

// "pa***@gmail.com": enough to see an address is there, not enough to use it
function maskEmail(email) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function subjectFor(storeName) {
  return `Low stock on your products in Naar campaigns – ${storeName}`;
}

function bodies(storeName, products, more, attached) {
  const rows = products.map((p) => {
    const out = p.stock <= 0;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eef0f3;color:#172b4d;">${esc(p.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eef0f3;text-align:right;white-space:nowrap;font-weight:700;color:${out ? "#ae2a19" : "#b65c02"};">${out ? "Out of stock" : `${p.stock} unit${p.stock === 1 ? "" : "s"}`}</td>
    </tr>`;
  }).join("");
  const moreLine = attached
    ? `…and ${more} more. The full list of all ${products.length + more} products is attached as a PDF.`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e6e8ec;">
<tr><td style="padding:24px 28px 8px;">
  <img src="https://gargashjirabackup.blob.core.windows.net/logos/naar/Naar%20logo.png" alt="Naar" height="32" style="display:block;height:32px;">
</td></tr>
<tr><td style="padding:12px 28px 0;color:#172b4d;font-size:15px;line-height:1.6;">
  <p style="margin:0 0 12px;">Hi ${esc(storeName)}!</p>
  <p style="margin:0 0 12px;">Your products are currently being promoted through Naar’s marketing campaigns.</p>
  <p style="margin:0 0 12px;">We noticed that the following products have low stock:</p>
</td></tr>
<tr><td style="padding:4px 28px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f3;border-radius:8px;font-size:14px;">
    <tr style="background:#f7f8fa;">
      <th align="left" style="padding:10px 12px;font-size:12px;color:#6b778c;text-transform:uppercase;letter-spacing:.04em;">Product</th>
      <th align="right" style="padding:10px 12px;font-size:12px;color:#6b778c;text-transform:uppercase;letter-spacing:.04em;">Current stock</th>
    </tr>
    ${rows}
  </table>
  ${moreLine ? `<p style="margin:10px 0 0;color:#5e6c84;font-size:13px;">${esc(moreLine)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px 0;color:#172b4d;font-size:15px;line-height:1.6;">
  <p style="margin:0 0 12px;padding:12px 14px;background:#fff7e8;border-radius:8px;">⚠️ Please update your inventory and ensure sufficient stock is available to avoid missing potential orders from our campaigns.</p>
  <p style="margin:0 0 12px;">Your products are getting visibility. Let’s make sure we don’t miss out on sales!</p>
  <p style="margin:0 0 24px;">Team Naar</p>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #eef0f3;color:#8590a2;font-size:12px;line-height:1.5;">
  You are receiving this email because your store is part of a Naar marketing campaign.
</td></tr>
</table>
</td></tr></table></body></html>`;

  const text = [
    `Hi ${storeName}!`,
    "",
    "Your products are currently being promoted through Naar’s marketing campaigns.",
    "",
    "We noticed that the following products have low stock:",
    "",
    ...products.map((p) => `- ${p.name}: ${p.stock <= 0 ? "out of stock" : `${p.stock} units`}`),
    ...(moreLine ? ["", moreLine] : []),
    "",
    "⚠️ Please update your inventory and ensure sufficient stock is available to avoid missing potential orders from our campaigns.",
    "",
    "Your products are getting visibility. Let’s make sure we don’t miss out on sales!",
    "",
    "Team Naar",
  ].join("\n");
  return { html, text };
}

// lowStock: campaign-store variants below the threshold (lowest first).
// contacts: Map sellerId -> { storeName, email }. productName(row) -> "Title (variant)".
// Returns { preview } for the dashboard (addresses masked) and { recipients } (real addresses,
// kept in memory only for this run's sending, never written to disk).
function buildSellerEmails({ lowStock, contacts, productName, clean }) {
  const bySeller = new Map();
  for (const row of lowStock) bySeller.set(row.sellerId, [...(bySeller.get(row.sellerId) || []), row]);

  const recipients = new Map();
  const sellers = [...bySeller].map(([sellerId, rows]) => {
    const contact = contacts.get(sellerId) || {};
    const storeName = clean(contact.storeName || rows[0].shopName) || "there";
    const email = normalizeEmail(contact.email);
    if (email) recipients.set(sellerId, email);
    const all = rows.map((r) => ({ name: productName(r), stock: Math.max(0, r.availableQuantity) }));
    const long = all.length > MAX_PRODUCTS;
    const shown = all.slice(0, long ? SHORT_LIST : MAX_PRODUCTS);
    const fileName = `Naar-low-stock-${storeName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store"}.pdf`;
    return {
      sellerId,
      storeName,
      email: email ? maskEmail(email) : null,
      problem: email ? null : contact.email ? "email not in a valid format" : "no email saved",
      productCount: rows.length,
      subject: subjectFor(storeName),
      ...bodies(storeName, shown, all.length - shown.length, long),
      // The full list for the PDF; index.js writes the file and keeps only its name here
      attachment: long ? { fileName, products: all } : null,
    };
  });
  sellers.sort((a, b) => b.productCount - a.productCount || a.storeName.localeCompare(b.storeName));
  return { preview: { sellers, withEmail: sellers.filter((s) => s.email).length }, recipients };
}

module.exports = { buildSellerEmails, maskEmail, normalizeEmail };
