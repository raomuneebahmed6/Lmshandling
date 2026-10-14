#!/usr/bin/env node
// Prints a comma-separated list of the stalest posts (oldest dateModified first)
// that are due for an auto-update, honouring .github/cms-settings.json.
//   EVENT=schedule|workflow_dispatch  EXCLUDE="slug1 slug2"  node scripts/pick-stale.js [count]
// Prints nothing when auto-update is switched off for scheduled runs.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const root = path.resolve(__dirname, "..");
const settings = { autoUpdate: { enabled: true, staleDays: 90, perRun: 2 } };
try {
  const s = JSON.parse(fs.readFileSync(path.join(root, ".github/cms-settings.json"), "utf8"));
  Object.assign(settings.autoUpdate, s.autoUpdate || {});
} catch (e) {}
const au = settings.autoUpdate;
if (process.env.EVENT === "schedule" && !au.enabled) process.exit(0);

const exclude = new Set(String(process.env.EXCLUDE || "").split(/[\s,]+/).filter(Boolean));
const cand = [];
const mdDir = path.join(root, "content/blog");
const mdSlugs = new Set();
for (const f of fs.existsSync(mdDir) ? fs.readdirSync(mdDir) : []) {
  if (!f.endsWith(".md")) continue;
  const fm = matter(fs.readFileSync(path.join(mdDir, f), "utf8")).data;
  const slug = fm.canonicalSlug || f.replace(/\.md$/, "");
  mdSlugs.add(slug);
  cand.push({ slug, date: String(fm.dateModified || fm.datePublished || "").slice(0, 10) });
}
let legacy = [];
try {
  legacy = JSON.parse(fs.readFileSync(path.join(root, "_data/existingPosts.json"), "utf8"));
} catch (e) {}
for (const p of legacy) {
  if (mdSlugs.has(p.slug) || !fs.existsSync(path.join(root, "blog", p.slug + ".html"))) continue;
  cand.push({ slug: p.slug, date: String(p.dateModified || p.datePublished || "").slice(0, 10) });
}
const now = Date.now();
const due = cand
  .filter((c) => !exclude.has(c.slug) && c.date && (now - Date.parse(c.date + "T00:00:00Z")) / 86400000 > au.staleDays)
  .sort((a, b) => (a.date < b.date ? -1 : 1))
  .slice(0, Math.max(1, Math.min(5, Number(process.argv[2]) || au.perRun)));
process.stdout.write(due.map((d) => d.slug).join(","));
