#!/usr/bin/env node
// Validates a blog post markdown file against the site's blog-post.njk
// frontmatter contract and the SEO/AEO rules in .claude/agents/seo-agent.md.
//   node scripts/validate-post.js content/blog/my-post.md
// Exit code 0 = OK (warnings allowed), 1 = at least one error.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const CATEGORIES = [
  "course-code-guides",
  "exam-preparation",
  "lms-handling",
  "admissions",
  "final-year-project",
  "registration",
];

function decodeLen(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").length;
}

function knownUrls(root) {
  const urls = new Set(["/blog/", "/services/", "/degrees/", "/about", "/contact", "/results", "/reviews", "/vu-notes", "/scheme", "/cgpa-calculator", "/vu-admission-portal"]);
  try {
    JSON.parse(fs.readFileSync(path.join(root, "_data/existingPosts.json"), "utf8")).forEach((p) => urls.add("/blog/" + p.slug));
  } catch (e) {}
  try {
    fs.readdirSync(path.join(root, "content/blog")).forEach((f) => f.endsWith(".md") && urls.add("/blog/" + f.replace(/\.md$/, "")));
  } catch (e) {}
  ["services", "degrees"].forEach((dir) => {
    try {
      fs.readdirSync(path.join(root, "content", dir)).forEach((f) => urls.add("/" + dir + "/" + f.replace(/\.md$/, "")));
    } catch (e) {}
    try {
      fs.readdirSync(path.join(root, dir)).forEach((f) => urls.add("/" + dir + "/" + f.replace(/\.html$/, "")));
    } catch (e) {}
  });
  return urls;
}

function validate(file, root) {
  const errors = [];
  const warnings = [];
  const raw = fs.readFileSync(file, "utf8");
  let fm, body;
  try {
    const parsed = matter(raw);
    fm = parsed.data;
    body = parsed.content;
  } catch (e) {
    return { errors: ["Frontmatter YAML is invalid: " + e.message], warnings };
  }

  const need = (k) => {
    if (fm[k] === undefined || fm[k] === null || fm[k] === "" || (Array.isArray(fm[k]) && !fm[k].length)) errors.push(`Missing required field: ${k}`);
  };
  [
    "layout", "permalink", "title", "metaDescription", "keywords", "canonicalSlug", "category", "ogImage",
    "datePublished", "dateModified", "readTime", "h1", "leadParagraph", "quickAnswer", "tocEntries",
    "keyTakeaways", "faq", "tags", "relatedGuides", "coverEyebrow", "coverHighlights", "coverContactLine", "coverCtaText",
  ].forEach(need);

  if (fm.layout && fm.layout !== "layouts/blog-post.njk") errors.push('layout must be "layouts/blog-post.njk"');
  if (fm.permalink && fm.permalink !== "/blog/{{ canonicalSlug }}.html") errors.push('permalink must be "/blog/{{ canonicalSlug }}.html"');

  if (fm.title) {
    const full = fm.title + " | Nibaha Haq";
    if (decodeLen(full) > 60) errors.push(`Title + " | Nibaha Haq" is ${decodeLen(full)} chars (max 60). Shorten the title to <= ${60 - 14} chars.`);
  }
  if (fm.metaDescription) {
    const n = decodeLen(fm.metaDescription);
    if (n < 70 || n > 160) errors.push(`metaDescription is ${n} chars (must be 70-160).`);
  }
  if (fm.canonicalSlug) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.canonicalSlug)) errors.push("canonicalSlug must be lowercase words separated by hyphens.");
    if (file.endsWith(".md") && path.basename(file, ".md") !== fm.canonicalSlug && !/^[0-9a-f-]{8,}$/.test(path.basename(file, ".md")))
      warnings.push(`File name "${path.basename(file)}" differs from canonicalSlug "${fm.canonicalSlug}".`);
  }
  if (fm.category && !CATEGORIES.includes(fm.category)) errors.push(`category must be one of: ${CATEGORIES.join(", ")}`);
  ["datePublished", "dateModified"].forEach((k) => {
    if (fm[k] && !/^\d{4}-\d{2}-\d{2}$/.test(String(fm[k]).slice(0, 10))) errors.push(`${k} must be YYYY-MM-DD.`);
  });
  if (fm.readTime !== undefined && !(Number(fm.readTime) >= 1 && Number(fm.readTime) <= 30)) errors.push("readTime must be 1-30.");

  const headingIds = [...body.matchAll(/<h2[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  if (!headingIds.length) errors.push('Body needs <h2 id="..."> headings (raw HTML, with an id each).');
  if (/<h1[\s>]/i.test(body) || /^# /m.test(body)) errors.push("Body must not contain an H1 (the layout renders h1 from frontmatter).");
  if (Array.isArray(fm.tocEntries)) {
    fm.tocEntries.forEach((t) => {
      if (!t || !t.anchor || !t.label) errors.push("Every tocEntries item needs anchor and label.");
      else if (!headingIds.includes(t.anchor) && !["key-takeaways", "faq"].includes(t.anchor)) errors.push(`tocEntries anchor "${t.anchor}" has no matching <h2 id="${t.anchor}"> in the body.`);
    });
    headingIds.forEach((id) => {
      if (!fm.tocEntries.some((t) => t && t.anchor === id)) warnings.push(`Body heading id "${id}" is not listed in tocEntries.`);
    });
  }

  const words = body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  // Body words only: quickAnswer, takeaways and FAQ are rendered from frontmatter on top of this.
  if (words < 350) errors.push(`Body is ${words} words (min 350; aim for 800+ for a ranking-quality guide).`);
  else if (words < 800) warnings.push(`Body is ${words} words (aim for 800+ for a ranking-quality guide).`);
  if (fm.quickAnswer) {
    const q = String(fm.quickAnswer).split(/\s+/).filter(Boolean).length;
    if (q < 35 || q > 90) warnings.push(`quickAnswer is ${q} words (aim for 40-70).`);
  }
  if (Array.isArray(fm.faq)) {
    if (fm.faq.length < 3) errors.push("faq needs at least 3 questions.");
    fm.faq.forEach((f, i) => {
      if (!f || !f.question || !f.answer) errors.push(`faq[${i}] needs question and answer.`);
    });
  }
  if (Array.isArray(fm.keyTakeaways) && (fm.keyTakeaways.length < 3 || fm.keyTakeaways.length > 6)) warnings.push("keyTakeaways should have 3-6 bullets.");
  if (Array.isArray(fm.keywords) && fm.keywords.length < 3) warnings.push("Add at least 3 keywords.");
  if (Array.isArray(fm.coverHighlights) && (fm.coverHighlights.length < 2 || fm.coverHighlights.length > 3)) errors.push("coverHighlights must have 2-3 lines.");

  // internal links must resolve
  const urls = knownUrls(root);
  const linked = [...body.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]).concat((fm.relatedGuides || []).map((r) => r && r.url));
  linked.filter(Boolean).forEach((u) => {
    const clean = u.length > 1 && u.endsWith("/") && !["/blog/", "/services/", "/degrees/"].includes(u) ? u.slice(0, -1) : u;
    if (!urls.has(clean) && !clean.startsWith("/assets/") && !clean.startsWith("/finals-img") && !clean.startsWith("/results-img") && !clean.startsWith("/reviews-img"))
      errors.push(`Internal link does not exist on the site: ${u}`);
  });
  if (Array.isArray(fm.relatedGuides) && fm.relatedGuides.length < 2) warnings.push("Add at least 2 relatedGuides (hub-and-spoke linking).");

  // Safety: body HTML goes live under a CSP that allows inline scripts, so a draft
  // must never carry active content (e.g. injected by a hostile web page Claude read).
  const everything = raw;
  if (/<\s*(script|iframe|style|object|embed|form|link|meta|base)\b/i.test(body)) errors.push("Body contains a forbidden HTML tag (script/iframe/style/object/embed/form/link/meta/base).");
  if (/\son[a-z]+\s*=/i.test(body.replace(/data-[a-z-]+="[^"]*"/g, ""))) errors.push("Body contains an inline event handler (onclick=, onerror=, ...).");
  if (/javascript:|data:text\/html/i.test(everything)) errors.push("Contains a javascript: or data:text/html URL.");
  const okHosts = /^https?:\/\/(wa\.me|(www\.)?lmshandling\.com|([a-z0-9-]+\.)?vu\.edu\.pk)(\/|$|\?)/i;
  [...body.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].forEach((m) => {
    if (!okHosts.test(m[1])) warnings.push(`External link to review before publishing: ${m[1].slice(0, 80)}`);
  });

  // trust guardrails (agent rules): never guarantee outcomes
  if (/\b(guaranteed?|100% (pass|success)|surely pass|leaked? paper)\b/i.test(body + " " + (fm.quickAnswer || ""))) errors.push("Contains a guarantee / leaked-paper style claim. Remove it.");
  if (/in today'?s fast-paced world|in conclusion,? it is clear/i.test(body)) warnings.push("Generic AI filler phrase detected.");

  return { errors, warnings, words };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/validate-post.js <file.md>");
    process.exit(2);
  }
  const root = path.resolve(__dirname, "..");
  const r = validate(file, root);
  r.errors.forEach((e) => console.log("ERROR: " + e));
  r.warnings.forEach((w) => console.log("WARN:  " + w));
  if (r.errors.length) {
    console.log(`\nFAILED: ${r.errors.length} error(s), ${r.warnings.length} warning(s).`);
    process.exit(1);
  }
  console.log(`OK: ${r.words} words, ${r.warnings.length} warning(s).`);
}

module.exports = { validate, CATEGORIES };
