// Sends email through Microsoft Graph (Microsoft 365) with an App registration
// (client credentials). The app needs the Application permission Mail.Send, limited by an
// Exchange application access policy to the sender mailbox only (see the README).
const fs = require("fs");

let cached = null;   // { token, expiresAt }

async function token({ tenantId, clientId, clientSecret }) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Microsoft sign-in failed (${res.status}): ${data.error_description?.split("\n")[0] || data.error || "no token"}`);
  }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

// One email to one or more addresses (each send is to ONE seller, or to the test inbox).
async function sendMail(graph, { from, to, subject, html, attachments = [] }) {
  const message = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: to.map((address) => ({ emailAddress: { address } })),
    attachments: attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.fileName,
      contentType: "application/pdf",
      contentBytes: fs.readFileSync(a.path).toString("base64"),
    })),
  };
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token(graph)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
    signal: AbortSignal.timeout(60000),
  });
  if (res.status !== 202) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Microsoft Graph sendMail ${res.status}: ${data.error?.message || data.error?.code || "failed"}`);
  }
}

module.exports = { sendMail };
