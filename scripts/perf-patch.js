#!/usr/bin/env node
// One-off, idempotent patch for page speed (Core Web Vitals) without touching any
// content, URL, heading, title or schema:
//   1. Google Analytics: load after the first interaction, or 3.5 s after the page
//      load, instead of right at load (the hits queued in dataLayer are replayed,
//      so no events are lost).
//   2. Reveal-on-scroll: content already on screen appears at once (it no longer
//      waits for an animation, which delayed LCP), and the rest is revealed a bit
//      before it scrolls into view (no blank gaps on fast scrolls).
//
//   node scripts/perf-patch.js          apply
//   node scripts/perf-patch.js --check  only report what would change

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const CHECK = process.argv.includes("--check");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (["node_modules", "_site", ".git", "admin", "drafts", "scripts"].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|njk)$/.test(e.name)) files.push(p);
  }
})(root);

const GA_OLD_LOAD = `  window.addEventListener('load', function(){
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=G-RL2VZFJM2L';
    document.head.appendChild(s);
  });`;
const GA_NEW_LOAD = `  (function(){
    var started = false, evs = ['scroll', 'pointerdown', 'keydown', 'touchstart'];
    function start(){
      if (started) return;
      started = true;
      evs.forEach(function(e){ removeEventListener(e, start); });
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-RL2VZFJM2L';
      document.head.appendChild(s);
    }
    evs.forEach(function(e){ addEventListener(e, start, { passive: true }); });
    addEventListener('load', function(){ setTimeout(start, 3500); });
  })();`;
const GA_OLD_COMMENT = "<!-- Google tag (gtag.js), deferred until after load to keep it off the critical rendering path -->";
const GA_NEW_COMMENT = "<!-- Google tag (gtag.js): loaded on first interaction or 3.5 s after load, so it never competes with the first paint. Queued events are replayed. -->";

const REV_OLD = `  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold:.15, rootMargin:"0px 0px -40px 0px" });
  els.forEach(el => io.observe(el));`;
const REV_NEW = `  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold:.05, rootMargin:"0px 0px 140px 0px" });
  const vh = window.innerHeight || 800;
  els.forEach(el => {
    // already on screen: show at once (an entrance animation here only delays the Largest Contentful Paint)
    if (el.getBoundingClientRect().top < vh * .95){ el.style.transition = "none"; el.classList.add("in"); }
    else io.observe(el);
  });`;

// v2: v1 read each element's layout and wrote its class inside the same loop (forced layout
// for every element, slow on heavy pages). v2 reads ALL positions first, then writes.
const REV_V2 = `  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold:.05, rootMargin:"0px 0px 140px 0px" });
  const vh = window.innerHeight || 800;
  const list = Array.prototype.slice.call(els);
  // read phase (one layout), then write phase: no forced reflow per element
  const tops = list.map(el => el.getBoundingClientRect().top);
  list.forEach((el, i) => {
    // already on screen: show at once (an entrance animation here only delays the Largest Contentful Paint)
    if (tops[i] < vh * .95){ el.style.transition = "none"; el.classList.add("in"); }
    else io.observe(el);
  });`;

let changed = 0, already = 0, unmatched = [];
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8");
  const crlf = raw.includes("\r\n");
  let t = raw.replace(/\r\n/g, "\n");
  const hasGa = t.includes("googletagmanager.com/gtag/js");
  const hasRev = t.includes('safe("reveals"');
  if (!hasGa && !hasRev) continue;
  let touched = false;
  if (hasGa) {
    if (t.includes(GA_OLD_LOAD)) { t = t.replace(GA_OLD_LOAD, GA_NEW_LOAD).replace(GA_OLD_COMMENT, GA_NEW_COMMENT); touched = true; }
    else if (!t.includes(GA_NEW_LOAD)) unmatched.push(path.relative(root, f) + " (GA)");
  }
  if (hasRev) {
    if (t.includes(REV_OLD)) { t = t.replace(REV_OLD, REV_V2); touched = true; }
    else if (t.includes(REV_NEW)) { t = t.replace(REV_NEW, REV_V2); touched = true; }
    else if (!t.includes(REV_V2)) unmatched.push(path.relative(root, f) + " (reveal)");
  }
  if (touched) { changed++; if (!CHECK) fs.writeFileSync(f, crlf ? t.replace(/\n/g, "\r\n") : t, "utf8"); } else already++;
}
console.log(`${CHECK ? "Would change" : "Changed"} ${changed} file(s); ${already} already up to date.`);
if (unmatched.length) { console.log("NOT matched (left untouched):\n  " + unmatched.join("\n  ")); process.exitCode = 1; }
