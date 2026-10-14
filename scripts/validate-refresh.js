#!/usr/bin/env node
// Safety gate for an auto-updated post (an "update proposal").
//   node scripts/validate-refresh.js <slug> <draft-file>
// Compares the draft with the live file and fails if the refresh changed
// things it must never change (URL, canonical, scripts, hosts) or looks broken.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const matter = require("gray-matter");
const { validate, knownUrls, decodeLen } = require("./validate-post");

const root = path.resolve(__dirname, "..");
const [slug, draftFile] = process.argv.slice(2);
const errors = [];
const warnings = [];
const isHtml = draftFile.endsWith(".html");
const livePath = isHtml ? path.join(root, "blog", slug + ".html") : path.join(root, "content/blog", slug + ".md");
if (!fs.existsSync(livePath)) {
  console.log("ERROR: no live file to compare with: " + path.relative(root, livePath));
  process.exit(1);
}
// Line endings differ between Windows checkouts and the Linux runner; normalise so hashes compare.
const live = fs.readFileSync(livePath, "utf8").replace(/\r\n/g, "\n");
const draft = fs.readFileSync(draftFile, "utf8").replace(/\r\n/g, "\n");
const words = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const GUARANTEE = /\b(guaranteed?|100% (pass|success)|surely pass|leaked? paper)\b/i;

if (!isHtml) {
  const r = validate(draftFile, root);
  r.errors.forEach((e) => errors.push(e));
  r.warnings.forEach((w) => {
    if (!/File name/.test(w)) warnings.push(w);
  });
  const a = matter(live).data;
  const b = matter(draft).data;
  if (b.canonicalSlug !== a.canonicalSlug) errors.push(`canonicalSlug changed (${a.canonicalSlug} -> ${b.canonicalSlug}). It must stay the same.`);
  if (b.category !== a.category) warnings.push("category changed");
  if (String(b.dateModified) <= String(a.dateModified || "")) errors.push("dateModified was not updated");
} else {
  const pick = (t, re) => {
    const m = re.exec(t);
    return m ? m[1] : "";
  };
  const title = pick(draft, /<title>([^<]*)<\/title>/i);
  const desc = pick(draft, /<meta\s+name="description"\s+content="([^"]*)"/i);
  if (!title) errors.push("Missing <title>");
  else if (decodeLen(title) > 60) errors.push(`<title> is ${decodeLen(title)} chars (max 60)`);
  if (desc.length < 70 || desc.length > 160) errors.push(`meta description is ${desc.length} chars (must be 70-160)`);
  if ((draft.match(/<h1[\s>]/gi) || []).length !== 1) errors.push("Page must have exactly one <h1>");
  const canon = (t) => pick(t, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
  if (canon(draft) !== canon(live)) errors.push("Canonical URL changed. It must stay the same.");

  // structured data must stay valid JSON
  const ld = (t) => [...t.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  ld(draft).forEach((j, i) => {
    try {
      JSON.parse(j);
    } catch (e) {
      errors.push(`JSON-LD block ${i + 1} is not valid JSON`);
    }
  });
  if (ld(draft).length < ld(live).length) errors.push("A JSON-LD structured data block was removed");

  // scripts: only the ones already on the live page are allowed (same bytes)
  const scripts = (t) =>
    [...t.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter((m) => !/application\/ld\+json/i.test(m[1]))
      .map((m) => crypto.createHash("sha1").update(m[1].trim() + "|" + m[2].trim()).digest("hex"));
  const liveS = scripts(live);
  scripts(draft).forEach((h) => {
    if (!liveS.includes(h)) errors.push("A script was added or changed. Only the existing page scripts are allowed.");
  });
  const ACTIVE = /<\s*(iframe|object|embed|form)\b/i;
  if (ACTIVE.test(draft) && !ACTIVE.test(live)) errors.push("New iframe/object/embed/form tag added");
  const handlers = (t) => (t.replace(/data-[a-z-]+="[^"]*"/g, "").match(/\son[a-z]+\s*=/gi) || []).length;
  if (handlers(draft) > handlers(live)) errors.push("New inline event handler added");
  const JS = /javascript:|data:text\/html/i;
  if (JS.test(draft) && !JS.test(live)) errors.push("javascript: URL added");

  // links: no new external hosts, internal links must exist
  const hosts = (t) => new Set([...t.matchAll(/(?:href|src)="https?:\/\/([^\/"]+)/gi)].map((m) => m[1].toLowerCase()));
  const liveH = hosts(live);
  hosts(draft).forEach((h) => {
    if (!liveH.has(h) && !/^(www\.)?lmshandling\.com$|^wa\.me$|(^|\.)vu\.edu\.pk$/.test(h)) errors.push("New external host linked: " + h);
  });
  // Links already on the live page are grandfathered; only NEW internal links must exist.
  const urls = knownUrls(root);
  urls.add("/");
  const internal = (t) => new Set([...t.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]));
  const liveLinks = internal(live);
  internal(draft).forEach((u) => {
    if (liveLinks.has(u)) return;
    const c = u.length > 1 && u.endsWith("/") && !["/blog/", "/services/", "/degrees/"].includes(u) ? u.slice(0, -1) : u;
    if (!urls.has(c) && !/^\/(assets|finals-img|results-img|reviews-img|blog\/category)/.test(c)) errors.push("New internal link does not exist: " + u);
  });
  const mod = (t) => pick(t, /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  if (mod(draft) && mod(draft) <= (mod(live) || "")) errors.push("dateModified (JSON-LD) was not updated");
}

const wl = words(live);
const wd = words(draft);
if (wd < wl * 0.6) errors.push(`Draft is much shorter than the live page (${wd} vs ${wl} words)`);
if (wd > wl * 2.5) errors.push(`Draft is much longer than the live page (${wd} vs ${wl} words)`);
if (GUARANTEE.test(draft) && !GUARANTEE.test(live)) errors.push("Guarantee / leaked-paper wording added");

errors.forEach((e) => console.log("ERROR: " + e));
warnings.forEach((w) => console.log("WARN:  " + w));
if (errors.length) {
  console.log(`FAILED ${slug}: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK ${slug}: ${wl} -> ${wd} words`);
