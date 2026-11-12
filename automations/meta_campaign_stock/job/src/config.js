const fs = require("fs");
const path = require("path");
// The one .env in the repo folder (shared with the website)
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env") });

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith("<")) {
    throw new Error(`Missing env var ${name} (set it in .env)`);
  }
  return value;
}

function list(name) {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("<"));
}

const isSet = (name) => Boolean(process.env[name]) && !process.env[name].startsWith("<");

function requiredList(name) {
  const values = list(name);
  if (!values.length) throw new Error(`Missing env var ${name} (set it in .env)`);
  return values;
}

const bool = (name) => String(process.env[name]).toLowerCase() === "true";

function oneOf(name, fallback, allowed) {
  const value = (process.env[name] || fallback).toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be ${allowed.join(", ")} (got "${value}")`);
  }
  return value;
}

// Loads queries/<QUERY>.js and checks it has what index.js needs.
function loadQuery(name) {
  const file = path.resolve(__dirname, "..", "queries", `${name}.js`);
  if (!fs.existsSync(file)) {
    throw new Error(`QUERY=${name}: no such file ${path.relative(process.cwd(), file)}`);
  }
  const query = require(file);
  if (query.type === "aggregate" && !Array.isArray(query.pipeline)) {
    throw new Error(`${name}.js: type "aggregate" needs a pipeline array`);
  }
  if (!["aggregate", "find"].includes(query.type)) {
    throw new Error(`${name}.js: type must be "aggregate" or "find"`);
  }
  for (const sheet of query.extraSheets || []) {
    if (!sheet.name || !Array.isArray(sheet.pipeline)) {
      throw new Error(`${name}.js: each extraSheets entry needs a name and a pipeline array`);
    }
  }
  // This tool is read-only: $out/$merge would write to the database, so refuse them
  // anywhere in the query (including inside $lookup/$facet sub-pipelines).
  const writeStage = JSON.stringify(query).match(/"\$(out|merge)"\s*:/);
  if (writeStage) {
    throw new Error(`${name}.js: $${writeStage[1]} writes to the database and is not allowed`);
  }
  return { title: name, ...query };
}

const dryRun = bool("DRY_RUN");
const format = oneOf("EXPORT_FORMAT", "xlsx", ["csv", "xlsx", "both"]);
const delivery = oneOf("DELIVERY", "slack", ["email", "slack", "both"]);
const queryName = process.env.QUERY || "active-products";

// Email/Slack settings are only required when we actually send that way
const sendEmail = !dryRun && delivery !== "slack";
const sendSlack = !dryRun && delivery !== "email";

module.exports = {
  mongo: {
    uri: required("MONGO_URI"),
    dbName: required("MONGO_DB_NAME"),
    collection: process.env.MONGO_COLLECTION || "products",
  },
  query: loadQuery(queryName),
  export: {
    format,
    dir: path.resolve(__dirname, "..", process.env.EXPORT_DIR || "exports"),
    filePrefix: process.env.EXPORT_FILE_PREFIX || "product-export",
  },
  mail: sendEmail
    ? {
        host: required("SMTP_HOST"),
        port: Number(process.env.SMTP_PORT || 587),
        secure: bool("SMTP_SECURE"),
        user: required("SMTP_USER"),
        pass: required("SMTP_PASS"),
        from: required("MAIL_FROM"),
        to: list("MAIL_TO"),
        cc: list("MAIL_CC"),
        subject: process.env.MAIL_SUBJECT || "Naar Report",
      }
    : null,
  slack: sendSlack
    ? {
        token: required("SLACK_BOT_TOKEN"),
        // The Meta report's own channel (SLACK_CHANNEL_ID is the Incidents & Operations one)
        channelIds: list("META_SLACK_CHANNEL_ID"),
        userIds: list("SLACK_USER_ID"),
        // Yesterday's report post is removed unless SLACK_DELETE_PREVIOUS=false
        deletePrevious: process.env.SLACK_DELETE_PREVIOUS ? bool("SLACK_DELETE_PREVIOUS") : true,
      }
    : null,
  // Meta Marketing API (read-only); off until META_ACCESS_TOKEN is filled in
  meta: isSet("META_ACCESS_TOKEN")
    ? {
        token: process.env.META_ACCESS_TOKEN,
        accountIds: requiredList("META_AD_ACCOUNT_ID"),
        apiVersion: process.env.META_API_VERSION || "v23.0",
        mappingFile: path.resolve(__dirname, "..", process.env.META_MAPPING_FILE || "meta-campaign-sellers.json"),
      }
    : null,
  // Low-stock email to each campaign seller, through Microsoft Graph. Off / Test / On and the test
  // inbox are chosen on the website's Meta page (saved in <repo>/data/meta-campaign-stock.json):
  //   off = preview only (default)   test = every email goes to the test inbox   on = to the sellers
  sellerEmail: (() => {
    let saved = {};
    try {
      const dataDir = process.env.DATA_DIR || path.resolve(__dirname, "..", "..", "..", "..", "data");
      saved = JSON.parse(fs.readFileSync(path.join(dataDir, "meta-campaign-stock.json"), "utf8")) || {};
    } catch { /* nothing chosen on the page yet: off */ }
    const mode = ["off", "test", "on"].includes(saved.seller_email_mode) ? saved.seller_email_mode : "off";
    const from = process.env.SELLER_EMAIL_FROM || "";
    // Test emails carry every seller's list: only to the sender's own domain (also checked on the page)
    const domain = from.includes("@") ? from.split("@").pop().toLowerCase() : "";
    const testTo = (Array.isArray(saved.test_to) ? saved.test_to : []).filter((a) => domain && String(a).toLowerCase().endsWith(`@${domain}`));
    const sending = mode !== "off" && !dryRun;
    if (sending && mode === "test" && !testTo.length) throw new Error("Seller emails are on Test but no test address is set (Meta page → Email to sellers)");
    return {
      mode,
      from: sending ? required("SELLER_EMAIL_FROM") : from,
      testTo,
      graph: sending
        ? { tenantId: required("GRAPH_TENANT_ID"), clientId: required("GRAPH_CLIENT_ID"), clientSecret: required("GRAPH_CLIENT_SECRET") }
        : null,
    };
  })(),
  // The website (same .env): the Slack message links to this report's page there
  site: {
    url: (process.env.DASHBOARD_URL || "").replace(/\/$/, ""),
    secret: process.env.SECRET_KEY || "",
    loginOn: isSet("DASHBOARD_PASSWORD"),
    viewDays: Number(process.env.VIEW_LINK_DAYS || 7),
  },
  dryRun,
  deleteAfterSend: bool("DELETE_AFTER_SEND"),
};
