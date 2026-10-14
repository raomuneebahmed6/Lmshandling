#!/usr/bin/env node
// Build step: turns _data/redirects.json (managed in Blog Studio -> Redirects) into
// Apache 301 rules inside the BUILT _site/.htaccess. Runs after `eleventy`.
//   node scripts/apply-redirects.js [siteDir]

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const siteDir = path.resolve(process.argv[2] || path.join(root, "_site"));
const src = path.join(root, "_data/redirects.json");
const htaccess = path.join(siteDir, ".htaccess");

let list = [];
try {
  list = JSON.parse(fs.readFileSync(src, "utf8"));
} catch (e) {
  if (fs.existsSync(src)) console.log("redirects.json is not valid JSON; no redirects applied: " + e.message);
}
if (!Array.isArray(list)) list = [];
if (!fs.existsSync(htaccess)) { console.log("No built .htaccess found; nothing to do."); process.exit(0); }

const FROM = /^\/[A-Za-z0-9\/._-]{1,150}$/;
const TO = /^(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300}|\/|https:\/\/(www\.)?lmshandling\.com(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300})?)$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rules = [];
const seen = new Set();
for (const r of list) {
  if (!r || !FROM.test(r.from || "") || !TO.test(r.to || "") || String(r.from).includes("..") || String(r.to).includes("..")) { console.log("Skipped an invalid redirect:", JSON.stringify(r)); continue; }
  const from = r.from.replace(/\/$/, "");
  if (!from || seen.has(from.toLowerCase())) continue;
  seen.add(from.toLowerCase());
  const target = r.to.replace(/^https:\/\/(www\.)?lmshandling\.com/, "") || "/";
  if (target.replace(/\/$/, "").toLowerCase() === from.toLowerCase()) continue;
  rules.push(`RewriteRule ^${esc(from.slice(1))}/?$ ${target} [R=301,L,NC,NE]`);
}

let text = fs.readFileSync(htaccess, "utf8").replace(/\r\n/g, "\n");
text = text.replace(/# --- Redirects managed in Blog Studio[\s\S]*?# --- end managed redirects ---\n?/, "");
if (rules.length) {
  const block = "# --- Redirects managed in Blog Studio (_data/redirects.json) ---\n" + rules.join("\n") + "\n# --- end managed redirects ---\n\n";
  const marker = "# Remove .html extension from URLs";
  if (!text.includes(marker)) { console.log("Marker not found in .htaccess; redirects NOT applied."); process.exit(1); }
  text = text.replace(marker, block + marker);
}
fs.writeFileSync(htaccess, text);
console.log(`Applied ${rules.length} redirect(s).`);
