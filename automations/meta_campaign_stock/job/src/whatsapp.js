// WhatsApp low-stock message to each campaign store's seller: PREVIEW ONLY.
// Builds the team's message per seller and finds their number; nothing here sends anything
// (sending through Gupshup is a separate, later step). The preview keeps numbers masked,
// because it is shown on the dashboard.
//
// Up to MAX_PRODUCTS products go in the message itself. A longer list keeps the SHORT_LIST
// lowest ones in the text, and the full list goes with the message as a PDF attachment
// (written by index.js with seller-pdf.js). No links: sellers never see our website.
const MAX_PRODUCTS = 10;
const SHORT_LIST = 5;

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

function message(storeName, products, more, attached) {
  const lines = products.map((p) => `Product: ${p.name}\nCurrent Stock: ${p.stock} units`);
  if (attached) lines.push(`…and ${more} more. The full list of all ${products.length + more} products is attached as a PDF.`);
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
function buildWhatsAppPreview({ lowStock, contacts, productName, clean }) {
  const bySeller = new Map();
  for (const row of lowStock) {
    bySeller.set(row.sellerId, [...(bySeller.get(row.sellerId) || []), row]);
  }
  const sellers = [...bySeller].map(([sellerId, rows]) => {
    const contact = contacts.get(sellerId) || {};
    const storeName = clean(contact.storeName || rows[0].shopName) || "there";
    const phone = normalizePhone(contact.phone, contact.region);
    const all = rows.map((r) => ({ name: productName(r), stock: Math.max(0, r.availableQuantity) }));
    const long = all.length > MAX_PRODUCTS;
    const products = all.slice(0, long ? SHORT_LIST : MAX_PRODUCTS);
    const fileName = `Naar-low-stock-${storeName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store"}.pdf`;
    return {
      sellerId,
      storeName,
      phone: phone ? maskPhone(phone) : null,
      problem: phone ? null : contact.phone ? "number not in a known format" : "no phone number saved",
      productCount: rows.length,
      // The full list for the PDF; index.js writes the file and keeps only its name here
      attachment: long ? { fileName, products: all } : null,
      message: message(storeName, products, rows.length - products.length, long),
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
