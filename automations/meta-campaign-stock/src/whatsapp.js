// WhatsApp low-stock message to each campaign store's seller: PREVIEW ONLY.
// Builds the team's message per seller and finds their number; nothing here sends anything
// (sending through Gupshup is a separate, later step). The preview keeps numbers masked,
// because it is shown on the dashboard.
//
// Up to MAX_PRODUCTS products go in the message itself. A longer list gets the SHORT_LIST
// lowest ones plus a link to a phone-friendly page with all of them: /stock/<random code>
// on the website, valid LIST_DAYS days, showing only that store's products.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_PRODUCTS = 10;
const SHORT_LIST = 5;
const LIST_DAYS = 7;

// sellerdetails.phone: India = 10 digits without +91, UAE = already "+971…"
function normalizePhone(phone, region) {
  const raw = String(phone ?? "").replace(/[\s()-]/g, "");
  if (!raw) return null;
  if (/^\+\d{10,15}$/.test(raw)) return raw;
  if (region === "IN" && /^[6-9]\d{9}$/.test(raw)) return `+91${raw}`;
  if (region === "AE" && /^0?5\d{8}$/.test(raw)) return `+971${raw.replace(/^0/, "")}`;
  return null;
}

// "+91 xxxxxx4521": enough to see a number is there, not enough to use it
const maskPhone = (e164) => e164.replace(/^(\+(?:91|971|\d{1,3}))(\d+)(\d{4})$/, (_, cc, mid, last) => `${cc} ${"x".repeat(mid.length)}${last}`);

// Saves one store's full list for its /stock/<code> page; returns the page link
function publishFullList({ listDir, baseUrl }, storeName, products, threshold) {
  const code = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(path.join(listDir, `${code}.json`),
    JSON.stringify({ storeName, threshold, generatedAt: new Date().toISOString(), products }));
  return `${baseUrl || ""}/stock/${code}`;
}

// Lists older than LIST_DAYS are removed, so their links stop working
function removeOldLists(listDir) {
  const cutoff = Date.now() - LIST_DAYS * 864e5;
  for (const name of fs.readdirSync(listDir)) {
    const file = path.join(listDir, name);
    if (name.endsWith(".json") && fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
  }
}

function message(storeName, products, more, link) {
  const lines = products.map((p) => `Product: ${p.name}\nCurrent Stock: ${p.stock} units`);
  if (link) lines.push(`See all ${products.length + more} low-stock products: ${link}`);
  else if (more > 0) lines.push(`…and ${more} more product${more === 1 ? "" : "s"} with low stock`);
  return [
    `Hi ${storeName}!`,
    "",
    "Your products are currently being promoted through Naar’s marketing campaigns.",
    "",
    "We noticed that the following products have low stock:",
    "",
    lines.join("\n\n"),
    "",
    "⚠️ Please update your inventory and ensure sufficient stock is available to avoid missing potential orders from our campaigns.",
    "",
    "Your products are getting visibility. Let’s make sure we don’t miss out on sales!",
    "",
    "Team Naar",
  ].join("\n");
}

// lowStock: campaign-store variants below the threshold (lowest first).
// contacts: Map sellerId -> { storeName, phone, region }. productName(row) -> "Title (variant)".
// lists: { listDir, baseUrl } for the full-list pages (omit to skip them).
function buildWhatsAppPreview({ lowStock, contacts, productName, clean, threshold, lists }) {
  if (lists) {
    fs.mkdirSync(lists.listDir, { recursive: true });
    removeOldLists(lists.listDir);
  }
  const bySeller = new Map();
  for (const row of lowStock) {
    bySeller.set(row.sellerId, [...(bySeller.get(row.sellerId) || []), row]);
  }
  const sellers = [...bySeller].map(([sellerId, rows]) => {
    const contact = contacts.get(sellerId) || {};
    const storeName = clean(contact.storeName || rows[0].shopName) || "there";
    const phone = normalizePhone(contact.phone, contact.region);
    const all = rows.map((r) => ({ name: productName(r), stock: Math.max(0, r.availableQuantity) }));
    const long = all.length > MAX_PRODUCTS && lists;
    const products = all.slice(0, long ? SHORT_LIST : MAX_PRODUCTS);
    const link = long ? publishFullList(lists, storeName, all, threshold) : null;
    return {
      sellerId,
      storeName,
      phone: phone ? maskPhone(phone) : null,
      problem: phone ? null : contact.phone ? "number not in a known format" : "no phone number saved",
      productCount: rows.length,
      listLink: link,
      message: message(storeName, products, rows.length - products.length, link),
    };
  });
  // Sellers with the most low-stock products first
  sellers.sort((a, b) => b.productCount - a.productCount || a.storeName.localeCompare(b.storeName));
  return {
    mode: "preview",
    sent: 0,
    sellers,
    withNumber: sellers.filter((s) => s.phone).length,
  };
}

module.exports = { buildWhatsAppPreview, normalizePhone };
