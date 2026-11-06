// Phone-sized PDF with one store's full low-stock list, for the WhatsApp message when the
// list is too long for the message text. Only that store's products: no links, no numbers,
// nothing about other sellers.
const fs = require("fs");
const PDFDocument = require("pdfkit");

const W = 360; // points; reads like a phone screen when opened in WhatsApp
const H = 640;
const M = 24;
const C = { ink: "#172b4d", muted: "#6b778c", line: "#e6e8ec", out: "#ae2a19", low: "#b65c02", note: "#e9f2ff", noteInk: "#0747a6" };

// The built-in PDF fonts cover Western characters only; anything else is simplified
// (accents dropped) or replaced, so a name never breaks the file
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const safe = (s) =>
  [...String(s ?? "").normalize("NFKD")]
    .filter((ch) => !/\p{M}/u.test(ch))
    .map((ch) => (ch.charCodeAt(0) < 256 || CP1252_EXTRA.has(ch) ? ch : "?"))
    .join("")
    .replace(/\?{2,}/g, "?");

function writeSellerPdf(file, { storeName, products, threshold, date }) {
  const doc = new PDFDocument({ size: [W, H], margin: M, bufferPages: true, info: { Title: `Low-stock products - ${safe(storeName)}`, Author: "Team Naar" } });
  const done = new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    out.on("finish", resolve).on("error", reject);
    doc.pipe(out);
  });

  // Header
  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.ink).text("naar", M, M);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(date, M, M + 8, { width: W - 2 * M, align: "right" });
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(C.ink).text(`Hi ${safe(storeName)}!`, { width: W - 2 * M });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor(C.muted)
    .text(`These ${products.length} products have less than ${threshold} units in stock. Lowest first:`, { width: W - 2 * M });
  doc.moveDown(0.8);

  // Rows: product name on the left, stock on the right
  const labelW = 78;
  const nameW = W - 2 * M - labelW - 10;
  for (const p of products) {
    const name = safe(p.name);
    doc.font("Helvetica").fontSize(10.5);
    const h = Math.max(doc.heightOfString(name, { width: nameW }), 12) + 12;
    if (doc.y + h > H - M - 20) doc.addPage();
    const y = doc.y;
    doc.fillColor(C.ink).text(name, M, y + 6, { width: nameW });
    const label = p.stock <= 0 ? "Out of stock" : `${p.stock} unit${p.stock === 1 ? "" : "s"} left`;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(p.stock <= 0 ? C.out : C.low)
      .text(label, W - M - labelW, y + 6, { width: labelW, align: "right" });
    doc.moveTo(M, y + h).lineTo(W - M, y + h).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.x = M;
    doc.y = y + h;
  }

  // Closing note
  const note = "Please update your inventory so you don't miss orders from our campaigns.";
  doc.font("Helvetica-Bold").fontSize(10);
  const noteH = doc.heightOfString(note, { width: W - 2 * M - 24 }) + 22;
  if (doc.y + 14 + noteH > H - M - 20) doc.addPage();
  const ny = doc.y + 14;
  doc.roundedRect(M, ny, W - 2 * M, noteH, 8).fill(C.note);
  doc.fillColor(C.noteInk).text(note, M + 12, ny + 11, { width: W - 2 * M - 24 });
  doc.font("Helvetica").fontSize(10).fillColor(C.muted).text("Team Naar", M, ny + noteH + 12);

  // Page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the bottom margin must not start a new page
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(`Page ${i + 1} of ${range.count}`, M, H - M - 6, { width: W - 2 * M, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}

module.exports = { writeSellerPdf };
