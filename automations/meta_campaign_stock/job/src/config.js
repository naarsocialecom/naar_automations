const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

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
        channelIds: list("SLACK_CHANNEL_ID"),
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
  // Low-stock email to each campaign seller, through Microsoft Graph.
  //   off  = preview only (default)   test = every email goes to SELLER_EMAIL_TEST_TO   on = to the sellers
  sellerEmail: (() => {
    const mode = oneOf("SELLER_EMAIL_MODE", "off", ["off", "test", "on"]);
    const sending = mode !== "off" && !dryRun;
    const testTo = list("SELLER_EMAIL_TEST_TO");
    if (sending && mode === "test" && !testTo.length) throw new Error("SELLER_EMAIL_MODE=test needs SELLER_EMAIL_TEST_TO (set it in .env)");
    return {
      mode,
      from: sending ? required("SELLER_EMAIL_FROM") : process.env.SELLER_EMAIL_FROM || "",
      testTo,
      graph: sending
        ? { tenantId: required("GRAPH_TENANT_ID"), clientId: required("GRAPH_CLIENT_ID"), clientSecret: required("GRAPH_CLIENT_SECRET") }
        : null,
    };
  })(),
  dryRun,
  deleteAfterSend: bool("DELETE_AFTER_SEND"),
};
