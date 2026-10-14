#!/usr/bin/env node
// SEO + security health audit of the LIVE site. Writes a JSON report that Blog Studio
// shows on its "SEO Health" page.
//
//   node scripts/seo-audit.js [out.json] [previous-report.json]
//   env: SITE (default https://lmshandling.com), LH_DIR (folder with lh-*.json Lighthouse results, optional)
//
// It only reads public pages the way a search engine would (no login, no writes).
// What it cannot know without Google's data is labelled as such in the report
// ("notMeasured"): rankings, clicks, impressions, backlinks, field Core Web Vitals.

const fs = require("fs");
const path = require("path");

const BASE = (process.env.SITE || "https://lmshandling.com").replace(/\/$/, "");
const OUT = process.argv[2] || "reports/seo.json";
const PREV = process.argv[3];
const UA = "LMHSeoAudit/1.0 (+https://lmshandling.com)";
const SEV = { high: 14, medium: 7, low: 3 };
const PAGE_SEV = { high: 15, medium: 8, low: 3 };

/* ---------- http ---------- */
async function get(url, opts = {}) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 25000);
  try {
    const res = await fetch(url, { method: opts.method || "GET", redirect: opts.redirect || "follow", signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Encoding": "gzip, br", ...(opts.headers || {}) } });
    const ms = Date.now() - t0;
    const text = opts.noBody || opts.method === "HEAD" ? "" : await res.text();
    return { status: res.status, headers: res.headers, text, ms, redirected: res.redirected, finalUrl: res.url, bytes: text.length };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: "", ms: Date.now() - t0, error: String(e.message || e), finalUrl: url, bytes: 0 };
  } finally {
    clearTimeout(timer);
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/* ---------- html parsing (regex based; good enough for this site's output) ---------- */
const decode = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const attr = (tag, name) => { const m = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i").exec(tag); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; };
function parse(html, pageUrl) {
  const metas = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = attr(m[0], "name") || attr(m[0], "property");
    if (key) metas[key.toLowerCase()] = decode(attr(m[0], "content") || "");
  }
  const title = decode(((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").replace(/\s+/g, " ").trim());
  let canonical = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) if (/canonical/i.test(attr(m[0], "rel") || "")) canonical = attr(m[0], "href");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
  const h2count = (html.match(/<h2\b/gi) || []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({ hasAlt: /\balt\s*=/i.test(m[0]), alt: attr(m[0], "alt"), dims: /\bwidth\s*=/i.test(m[0]) && /\bheight\s*=/i.test(m[0]) }));
  const ld = [...html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = []; let invalid = 0;
  for (const j of ld) {
    try {
      const d = JSON.parse(j);
      (Array.isArray(d) ? d : d["@graph"] || [d]).forEach((x) => { [].concat(x["@type"] || []).forEach((t) => types.push(t)); });
    } catch (e) { invalid++; }
  }
  const links = [];
  let noopener = 0, mixed = 0;
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (/target\s*=\s*["']?_blank/i.test(m[0]) && !/noopener/i.test(attr(m[0], "rel") || "")) noopener++;
    if (!href || /^(#|mailto:|tel:|javascript:|sms:|whatsapp:)/i.test(href)) continue;
    let u; try { u = new URL(href, pageUrl); } catch (e) { continue; }
    if (u.origin === BASE || u.origin === BASE.replace("//", "//www.")) { u.hash = ""; links.push(u.pathname + u.search); }
  }
  mixed = (html.match(/\s(?:src|data-src)\s*=\s*["']http:\/\//gi) || []).length + (html.match(/<link[^>]+href\s*=\s*["']http:\/\/(?!www\.w3\.org)/gi) || []).length;
  const text = decode(html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const lang = (/<html\b[^>]*\blang\s*=\s*["']([^"']+)/i.exec(html) || [])[1] || "";
  return { metas, title, canonical, h1s, h2count, imgs, types, invalid, ldCount: ld.length, links: [...new Set(links)], noopener, mixed, words: text ? text.split(/\s+/).length : 0, lang, viewport: !!metas["viewport"], noindex: /noindex/i.test(metas["robots"] || "") };
}
const norm = (u) => { try { const x = new URL(u, BASE); let p = x.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, ""); if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1); return p; } catch (e) { return u; } };

/* ---------- issue book ---------- */
const BOOK = {
  T_ROBOTS: ["technical", "high", "robots.txt is missing or blocks the whole site", "Search engines look here first.", "Publish a robots.txt that allows crawling and links the sitemap."],
  T_SITEMAP: ["technical", "high", "sitemap.xml is missing or empty", "Without it new posts are discovered slowly.", "Generate a sitemap listing every canonical page and submit it in Google Search Console."],
  T_HTTPS: ["technical", "high", "http:// does not redirect to https://", "Duplicate insecure copies of every page.", "Add a permanent 301 redirect from http to https."],
  T_WWW: ["technical", "medium", "www and non-www both serve pages", "Splits ranking signals between two hostnames.", "301-redirect www.lmshandling.com to lmshandling.com."],
  T_SOFT404: ["technical", "medium", "Unknown URLs do not return a 404 status", "Soft-404 pages waste crawl budget.", "Return a real 404 status for pages that do not exist."],
  T_NON200: ["technical", "high", "Sitemap URLs that do not return 200", "Broken or removed pages are listed for search engines.", "Fix the page or remove it from the sitemap."],
  T_REDIRECT: ["technical", "medium", "Sitemap URLs that redirect", "The sitemap should list final URLs only.", "List the final destination URL instead."],
  T_NOINDEX: ["technical", "high", "Pages marked noindex but listed in the sitemap", "Contradictory signals; the page will not rank.", "Remove noindex or remove the page from the sitemap."],
  T_CANON_MISSING: ["technical", "high", "Pages without a canonical link", "Duplicate-URL risk.", "Add <link rel=\"canonical\"> pointing to the page itself."],
  T_CANON_DIFF: ["technical", "high", "Canonical points to a different URL", "The page asks Google to rank another URL instead.", "Make the canonical match the page URL (or confirm it is intentional)."],
  T_BROKEN_LINK: ["technical", "high", "Broken internal links", "Visitors and crawlers hit dead ends.", "Fix or remove the links (see the pages listed)."],
  T_ORPHAN: ["technical", "medium", "Pages no other page links to", "Orphan pages get little authority and are crawled rarely.", "Link to them from a related guide, category page or the blog index."],
  T_NOT_IN_SITEMAP: ["technical", "medium", "Linked pages missing from the sitemap", "Important pages should be in the sitemap.", "Add them to the sitemap (or noindex them on purpose)."],
  T_SLOW: ["technical", "low", "Slow server response (over 2.5 s from the audit server)", "Slow pages lose visitors and rankings.", "Check hosting, caching and image weight for these pages."],
  T_SLOW_MOBILE: ["technical", "medium", "Mobile PageSpeed score is low (under 50)", "Most visitors are on phones.", "Compress images, defer scripts, reduce page weight."],
  T_COMPRESS: ["technical", "medium", "HTML is not compressed (gzip/brotli)", "Larger downloads, slower on mobile data.", "Enable compression for HTML, CSS and JS."],
  T_HEAVY: ["technical", "low", "Very large HTML pages (over 500 KB)", "Heavy pages are slow on mobile.", "Move inline CSS/JS to cached files and lazy-load images."],
  T_LLMS: ["aeo", "low", "llms.txt is missing", "It helps AI assistants understand the site.", "Publish /llms.txt summarising services and key guides."],
  O_TITLE_MISSING: ["onpage", "high", "Pages without a title", "The title is the biggest on-page ranking signal.", "Add a unique descriptive <title>."],
  O_TITLE_LONG: ["onpage", "medium", "Titles over 60 characters", "They get cut off in Google results.", "Shorten to 60 characters or fewer."],
  O_TITLE_SHORT: ["onpage", "low", "Very short titles (under 25 characters)", "Missed chance to include the keyword.", "Describe the page in 30-60 characters."],
  O_TITLE_DUP: ["onpage", "medium", "Duplicate titles", "Pages compete with each other.", "Give every page its own title."],
  O_DESC_MISSING: ["onpage", "high", "Pages without a meta description", "Google invents a snippet instead.", "Write a 70-160 character description."],
  O_DESC_LEN: ["onpage", "medium", "Meta descriptions not 70-160 characters", "Too short wastes space, too long is cut off.", "Rewrite to 70-160 characters."],
  O_DESC_DUP: ["onpage", "medium", "Duplicate meta descriptions", "Weak, repeated snippets.", "Write a unique description per page."],
  O_H1_MISSING: ["onpage", "high", "Pages without an H1", "The main heading tells readers and engines the topic.", "Add exactly one H1."],
  O_H1_MULTI: ["onpage", "medium", "Pages with more than one H1", "Unclear main topic.", "Keep a single H1; use H2/H3 below it."],
  O_LANG: ["onpage", "low", "Missing lang attribute on <html>", "Language targeting and accessibility.", "Add lang=\"en\"."],
  O_VIEWPORT: ["onpage", "high", "Missing mobile viewport tag", "The page is not mobile friendly.", "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">."],
  O_OG: ["onpage", "low", "Missing Open Graph tags (title, description, image)", "Weak previews when shared on WhatsApp or Facebook.", "Add og:title, og:description and og:image."],
  O_TWITTER: ["onpage", "low", "Missing Twitter card tag", "Weak previews on X.", "Add twitter:card."],
  C_THIN: ["content", "medium", "Thin pages (under 300 words)", "Little for search engines to rank.", "Expand with genuinely useful detail, or merge/noindex."],
  C_ALT: ["content", "medium", "Images without alt text", "Missed image search and accessibility.", "Add a short descriptive alt to every meaningful image."],
  C_IMGDIM: ["content", "low", "Images without width/height", "Layout shifts while loading (CLS).", "Set width and height on images."],
  C_H2: ["content", "low", "Long pages without H2 sections", "Hard to scan; no answer-box structure.", "Break the page into H2 sections."],
  S_NONE: ["structured", "medium", "Pages with no structured data", "No rich-result eligibility.", "Add JSON-LD (Organization, BreadcrumbList, and page type)."],
  S_INVALID: ["structured", "high", "Invalid JSON-LD", "Broken markup is ignored by Google.", "Fix the JSON syntax."],
  S_BREADCRUMB: ["structured", "low", "Inner pages without BreadcrumbList", "No breadcrumb trail in results.", "Add BreadcrumbList JSON-LD."],
  S_ARTICLE: ["structured", "low", "Blog posts without BlogPosting/Article markup", "Weaker article understanding.", "Add BlogPosting JSON-LD with author and dates."],
  A_FAQ: ["aeo", "medium", "Blog posts without FAQPage markup", "AI answers and Google quote FAQs.", "Add 3-6 FAQs and matching FAQPage JSON-LD."],
  SEC_HSTS: ["security", "high", "Strict-Transport-Security header missing", "Browsers may open the site over insecure http.", "Send Strict-Transport-Security: max-age=31536000; includeSubDomains."],
  SEC_CSP: ["security", "medium", "Content-Security-Policy header missing", "No defence against injected scripts.", "Add a Content-Security-Policy."],
  SEC_NOSNIFF: ["security", "medium", "X-Content-Type-Options header missing", "MIME sniffing attacks.", "Send X-Content-Type-Options: nosniff."],
  SEC_FRAME: ["security", "medium", "Clickjacking protection missing (X-Frame-Options / frame-ancestors)", "The site can be framed by other sites.", "Send X-Frame-Options: SAMEORIGIN or CSP frame-ancestors."],
  SEC_REFERRER: ["security", "low", "Referrer-Policy header missing", "Leaks full URLs to other sites.", "Send Referrer-Policy: strict-origin-when-cross-origin."],
  SEC_PERMS: ["security", "low", "Permissions-Policy header missing", "Browser features are not restricted.", "Send a Permissions-Policy that disables unused features."],
  SEC_MIXED: ["security", "high", "Pages loading insecure http:// resources", "Browsers block or warn on mixed content.", "Load every resource over https."],
  SEC_NOOPENER: ["security", "low", "External links with target=_blank but no rel=noopener", "The opened page can control this tab.", "Add rel=\"noopener\" to those links."],
  SEC_EXPOSED: ["security", "high", "Sensitive files or folders are publicly reachable", "Source, secrets or listings must never be public.", "Block these paths on the server immediately."],
  SEC_LISTING: ["security", "high", "Directory listing is enabled", "Visitors can browse your folders.", "Add Options -Indexes."],
};

/* ---------- main ---------- */
(async () => {
  const started = Date.now();
  const issues = {};
  const add = (id, url, extra) => { (issues[id] = issues[id] || { id, urls: [], extra: [] }).urls.push(url); if (extra) issues[id].extra.push(extra); };
  const siteFlag = (id) => { issues[id] = issues[id] || { id, urls: [], extra: [], site: true }; issues[id].site = true; };

  /* robots, sitemap, llms */
  const robots = await get(BASE + "/robots.txt");
  const blocksAll = (() => {
    let star = false, all = false;
    for (const raw of robots.text.split("\n")) {
      const l = raw.replace(/#.*/, "").trim();
      if (/^user-agent:/i.test(l)) star = /user-agent:\s*\*\s*$/i.test(l);
      else if (star && /^disallow:\s*\/\s*$/i.test(l)) all = true;
    }
    return all;
  })();
  if (robots.status !== 200 || blocksAll) siteFlag("T_ROBOTS");
  const sm = await get(BASE + "/sitemap.xml");
  let urls = [...sm.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (sm.status !== 200 || !urls.length) siteFlag("T_SITEMAP");
  if (!urls.length) urls = [BASE + "/"];
  const llms = await get(BASE + "/llms.txt");
  if (llms.status !== 200 || llms.text.length < 50) siteFlag("T_LLMS");
  const sitemapPaths = new Set(urls.map(norm));

  /* http -> https, www */
  const http = await get(BASE.replace("https://", "http://") + "/", { redirect: "manual", noBody: true });
  if (!(http.status >= 300 && http.status < 400 && /^https:/i.test(http.headers.get("location") || ""))) siteFlag("T_HTTPS");
  const www = await get(BASE.replace("https://", "https://www.") + "/", { redirect: "manual", noBody: true });
  if (www.status === 200) siteFlag("T_WWW");
  const nf = await get(BASE + "/this-page-should-not-exist-" + Date.now(), { noBody: true });
  if (nf.status !== 404 && nf.status !== 410) siteFlag("T_SOFT404");

  /* crawl every sitemap page */
  const results = await pool(urls, 6, async (u) => {
    const r = await get(u);
    return { url: u, p: norm(u), r, page: r.status === 200 ? parse(r.text, r.finalUrl || u) : null };
  });

  /* inbound links, broken links, per-page flags */
  const inbound = {};
  const linkTargets = new Map(); // path -> sources
  results.forEach((x) => { if (!x.page) return; x.page.links.forEach((l) => { const t = norm(l); if (t === x.p) return; (inbound[t] = inbound[t] || new Set()).add(x.p); if (!linkTargets.has(t)) linkTargets.set(t, new Set()); linkTargets.get(t).add(x.p); }); });
  const titles = {}, descs = {};
  const isBlogPost = (p) => /^\/blog\/[^/]+$/.test(p) && p !== "/blog";
  const pages = results.map((x) => {
    const flags = [];
    const p = x.p, pg = x.page, r = x.r;
    const flag = (id) => { flags.push(id); add(id, x.url); };
    if (r.status !== 200) { flag("T_NON200"); return { path: p, status: r.status, ms: r.ms, flags, score: 0 }; }
    if (r.redirected && norm(r.finalUrl) !== p) flag("T_REDIRECT");
    if (pg.noindex) flag("T_NOINDEX");
    if (!pg.canonical) flag("T_CANON_MISSING"); else if (norm(pg.canonical) !== p) { flag("T_CANON_DIFF"); issues.T_CANON_DIFF.extra.push(p + " -> " + pg.canonical); }
    if (r.ms > 2500) flag("T_SLOW");
    if (r.bytes > 500000) flag("T_HEAVY");
    if (!pg.title) flag("O_TITLE_MISSING"); else { if (pg.title.length > 60) flag("O_TITLE_LONG"); else if (pg.title.length < 25) flag("O_TITLE_SHORT"); (titles[pg.title] = titles[pg.title] || []).push(x.url); }
    const d = pg.metas["description"];
    if (!d) flag("O_DESC_MISSING"); else { if (d.length < 70 || d.length > 160) flag("O_DESC_LEN"); (descs[d] = descs[d] || []).push(x.url); }
    if (!pg.h1s.length) flag("O_H1_MISSING"); else if (pg.h1s.length > 1) flag("O_H1_MULTI");
    if (!pg.lang) flag("O_LANG");
    if (!pg.viewport) flag("O_VIEWPORT");
    if (!pg.metas["og:title"] || !pg.metas["og:description"] || !pg.metas["og:image"]) flag("O_OG");
    if (!pg.metas["twitter:card"]) flag("O_TWITTER");
    const listing = /^\/(blog|blog\/category\/.+|services|degrees|results|reviews|contact|scheme|cgpa-calculator|vu-notes|vu-admission-portal)?$/.test(p);
    if (pg.words < 300 && !listing && p !== "/") flag("C_THIN");
    if (pg.imgs.some((i) => !i.hasAlt)) flag("C_ALT");
    if (pg.imgs.length && pg.imgs.filter((i) => !i.dims).length > pg.imgs.length / 2) flag("C_IMGDIM");
    if (pg.words > 600 && !pg.h2count) flag("C_H2");
    if (!pg.ldCount) flag("S_NONE");
    if (pg.invalid) flag("S_INVALID");
    if (p !== "/" && pg.ldCount && !pg.types.includes("BreadcrumbList")) flag("S_BREADCRUMB");
    if (isBlogPost(p) && !pg.types.some((t) => /BlogPosting|Article/.test(t))) flag("S_ARTICLE");
    if (isBlogPost(p) && !pg.types.includes("FAQPage")) flag("A_FAQ");
    if (pg.mixed) flag("SEC_MIXED");
    if (pg.noopener) flag("SEC_NOOPENER");
    if (p !== "/" && !(inbound[p] && inbound[p].size)) flag("T_ORPHAN");
    let score = 100;
    flags.forEach((f) => { score -= PAGE_SEV[BOOK[f][1]]; });
    return { path: p, status: 200, ms: r.ms, title: pg.title, titleLen: pg.title.length, descLen: (d || "").length, h1: pg.h1s[0] || "", words: pg.words, imgs: pg.imgs.length, schema: [...new Set(pg.types)], flags, score: Math.max(0, score) };
  });
  Object.values(titles).filter((a) => a.length > 1).forEach((a) => a.forEach((u) => add("O_TITLE_DUP", u)));
  Object.values(descs).filter((a) => a.length > 1).forEach((a) => a.forEach((u) => add("O_DESC_DUP", u)));
  pages.forEach((pg) => { ["O_TITLE_DUP", "O_DESC_DUP"].forEach((id) => { if (issues[id] && issues[id].urls.some((u) => norm(u) === pg.path)) { pg.flags.push(id); pg.score = Math.max(0, pg.score - PAGE_SEV.medium); } }); });

  /* internal link health (unique targets) */
  const targets = [...linkTargets.keys()].filter((t) => !sitemapPaths.has(t) && !/\.(png|jpe?g|webp|gif|svg|pdf|ico|css|js|xml|txt|zip|mp4)$/i.test(t) && !t.startsWith("/cdn-cgi") && !t.startsWith("/admin") && !t.startsWith("/api") && !t.startsWith("/auth") && !t.startsWith("/callback")).slice(0, 400);
  await pool(targets, 8, async (t) => {
    let r = await get(BASE + t, { method: "HEAD", noBody: true });
    if (r.status === 405 || r.status === 403 || r.status === 0) r = await get(BASE + t, { noBody: true });
    if (r.status >= 400 || r.status === 0) add("T_BROKEN_LINK", t, "linked from " + [...linkTargets.get(t)].slice(0, 3).join(", "));
    else if (/text\/html/i.test(r.headers.get("content-type") || "")) add("T_NOT_IN_SITEMAP", t);
  });
  // broken links to sitemap pages that are themselves non-200 are already reported as T_NON200
  Object.keys(issues).forEach((id) => { issues[id].urls = [...new Set(issues[id].urls)]; });

  /* security headers (homepage + one blog post) + exposed files */
  const home = results.find((x) => x.p === "/") || results[0];
  const h = (n) => home.r.headers.get(n);
  const security = [
    ["Strict-Transport-Security", !!h("strict-transport-security"), "SEC_HSTS", h("strict-transport-security") || ""],
    ["Content-Security-Policy", !!h("content-security-policy"), "SEC_CSP", (h("content-security-policy") || "").slice(0, 120)],
    ["X-Content-Type-Options", /nosniff/i.test(h("x-content-type-options") || ""), "SEC_NOSNIFF", h("x-content-type-options") || ""],
    ["Clickjacking protection", !!h("x-frame-options") || /frame-ancestors/i.test(h("content-security-policy") || ""), "SEC_FRAME", h("x-frame-options") || ""],
    ["Referrer-Policy", !!h("referrer-policy"), "SEC_REFERRER", h("referrer-policy") || ""],
    ["Permissions-Policy", !!h("permissions-policy"), "SEC_PERMS", (h("permissions-policy") || "").slice(0, 80)],
    ["HTTPS enforced (http redirects)", !issues.T_HTTPS, "T_HTTPS", ""],
    ["HTML compressed", !!(h("content-encoding")), "T_COMPRESS", h("content-encoding") || ""],
  ].map(([name, ok, id, value]) => { if (!ok) siteFlag(id); return { name, ok, value }; });
  const exposedPaths = ["/.git/HEAD", "/.git/config", "/.env", "/package.json", "/package-lock.json", "/eleventy.config.js", "/.htaccess", "/content/blog/", "/_data/existingPosts.json", "/scripts/validate-post.js", "/node_modules/", "/wp-login.php", "/phpinfo.php", "/backup.zip", "/.DS_Store"];
  const exposed = [];
  await pool(exposedPaths, 5, async (pth) => {
    const r = await get(BASE + pth, { timeout: 15000 });
    const ct = r.headers.get("content-type") || "";
    const looksReal = r.status === 200 && !/<html/i.test(r.text.slice(0, 400)) && r.bytes > 0;
    const looksHtmlHome = r.status === 200 && /<html/i.test(r.text.slice(0, 400)) && /Nibaha Haq/.test(r.text.slice(0, 3000)) === false && /index of|directory listing/i.test(r.text.slice(0, 600));
    if (looksReal || looksHtmlHome) exposed.push(pth + " (" + r.status + ")");
  });
  exposed.forEach((e) => add("SEC_EXPOSED", e));
  const dir = await get(BASE + "/assets/", { timeout: 15000 });
  if (dir.status === 200 && /index of/i.test(dir.text.slice(0, 800))) siteFlag("SEC_LISTING");

  /* optional: Lighthouse results (the workflow runs Lighthouse in Chrome and drops the JSON files in LH_DIR) */
  const perf = { measured: false, pages: [] };
  const lhDir = process.env.LH_DIR;
  if (lhDir && fs.existsSync(lhDir)) {
    for (const f of fs.readdirSync(lhDir).filter((x) => /^lh-.*\.json$/.test(x)).sort()) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(lhDir, f), "utf8")), c = j.categories, a = j.audits;
        if (!c || !c.performance || c.performance.score == null) continue;
        perf.pages.push({ path: norm(j.finalDisplayedUrl || j.finalUrl || j.requestedUrl), performance: Math.round(c.performance.score * 100), seo: Math.round((c.seo.score || 0) * 100), accessibility: Math.round((c.accessibility.score || 0) * 100), bestPractices: Math.round((c["best-practices"].score || 0) * 100), lcp: a["largest-contentful-paint"].displayValue, cls: a["cumulative-layout-shift"].displayValue, tbt: a["total-blocking-time"].displayValue, fcp: a["first-contentful-paint"].displayValue, si: a["speed-index"].displayValue });
        perf.measured = true;
      } catch (e) { /* skip unreadable file */ }
    }
  }
  if (!perf.measured) perf.note = "Speed scores are measured by Lighthouse when the audit runs from GitHub Actions.";
  if (perf.measured) {
    perf.score = Math.round(perf.pages.reduce((x, p) => x + p.performance, 0) / perf.pages.length);
    if (perf.score < 50) add("T_SLOW_MOBILE", "Mobile performance score " + perf.score);
    perf.lighthouseSeo = Math.round(perf.pages.reduce((x, p) => x + p.seo, 0) / perf.pages.length);
    perf.accessibility = Math.round(perf.pages.reduce((x, p) => x + p.accessibility, 0) / perf.pages.length);
  }

  /* scoring */
  const total = Math.max(1, pages.length);
  const cats = { technical: 100, onpage: 100, content: 100, structured: 100, aeo: 100, security: 100 };
  const list = Object.values(issues).filter((i) => BOOK[i.id]).map((i) => {
    const b = BOOK[i.id], count = i.site ? 1 : i.urls.length;
    const pageLevel = !i.site && !/^SEC_EXPOSED|^T_BROKEN_LINK|^T_NOT_IN_SITEMAP/.test(i.id);
    const share = pageLevel ? Math.min(1, i.urls.length / total) : 1;
    const penalty = SEV[b[1]] * (pageLevel ? 0.35 + 0.65 * share : 1);
    cats[b[0]] = Math.max(0, cats[b[0]] - penalty);
    return { id: i.id, category: b[0], severity: b[1], title: b[2], why: b[3], fix: b[4], count, site: !!i.site, urls: i.urls.slice(0, 60), extra: i.extra.slice(0, 30), penalty: Math.round(penalty * 10) / 10 };
  }).filter((i) => i.count > 0).sort((a, b) => b.penalty - a.penalty);
  Object.keys(cats).forEach((k) => (cats[k] = Math.round(cats[k])));
  if (perf.measured) cats.performance = perf.score;
  const W = { technical: 0.22, onpage: 0.22, content: 0.12, structured: 0.14, aeo: 0.08, security: 0.1, performance: 0.12 };
  const used = Object.keys(cats), wsum = used.reduce((s, k) => s + W[k], 0);
  const overall = Math.round(used.reduce((s, k) => s + cats[k] * W[k], 0) / wsum);

  let history = [];
  try { if (PREV && fs.existsSync(PREV)) history = JSON.parse(fs.readFileSync(PREV, "utf8")).history || []; } catch (e) {}
  history.push({ date: new Date().toISOString().slice(0, 10), score: overall, categories: { ...cats } });
  history = history.filter((h, i, a) => a.findIndex((x) => x.date === h.date) === i || i === a.length - 1).slice(-60);

  const report = {
    generatedAt: new Date().toISOString(), site: BASE, durationSec: Math.round((Date.now() - started) / 1000), pagesCrawled: pages.length,
    summary: { score: overall, categories: cats, issuesHigh: list.filter((i) => i.severity === "high").length, issuesMedium: list.filter((i) => i.severity === "medium").length, issuesLow: list.filter((i) => i.severity === "low").length },
    issues: list, pages, security, exposed, performance: perf, history,
    notMeasured: ["Rankings, clicks and impressions (need Google Search Console)", "Backlinks and referring domains (need a backlink tool)", "Real-user Core Web Vitals (need Search Console / CrUX)", "Indexing status of each page (need Search Console)"],
    notes: "Preliminary: based on a public crawl of the live site from one location, not on Google's own data.",
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(`SEO audit: score ${overall}/100 across ${pages.length} pages, ${list.length} issue types (${report.summary.issuesHigh} high). Categories: ${JSON.stringify(cats)}`);
})().catch((e) => { console.error("Audit failed:", e); process.exit(1); });
