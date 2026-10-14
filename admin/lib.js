/* Blog Studio helpers: API access, post parsing, SEO checks, activity log, diff.
 * No DOM here except toast(); everything is exposed on window.L.
 */
(function () {
  'use strict';

  var REPO = 'raomuneebahmed6/Lmshandling';
  var BRANCH = 'claude/website-blogs-seo-3jpp70'; // the deployed branch
  var DRAFTS = 'blog-drafts';                      // never deployed
  var SITE = 'https://lmshandling.com';
  var CATS = [
    ['course-code-guides', 'Course Code Guides'], ['exam-preparation', 'Exam Preparation'],
    ['lms-handling', 'LMS Handling'], ['admissions', 'Admissions'],
    ['final-year-project', 'Final Year Project'], ['registration', 'Registration']
  ];
  var FM_ORDER = ['layout', 'permalink', 'title', 'metaDescription', 'keywords', 'canonicalSlug', 'category', 'ogImage',
    'datePublished', 'dateModified', 'readTime', 'h1', 'leadParagraph', 'quickAnswer', 'tocEntries', 'keyTakeaways',
    'faq', 'tags', 'relatedGuides', 'coverEyebrow', 'coverHighlights', 'coverContactLine', 'coverCtaText'];

  /* ---------- tiny utils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function words(s) { return String(s || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length; }
  function plainLen(s) { return String(s || '').length; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function slugify(s) { return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 9).join('-'); }
  function catLabel(slug) { var c = CATS.filter(function (x) { return x[0] === slug; })[0]; return c ? c[1] : (slug || 'Uncategorised'); }
  function daysSince(d) {
    if (!d) return 9999;
    var t = Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');
    return isNaN(t) ? 9999 : Math.floor((Date.now() - t) / 86400000);
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(d) {
    if (!d) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (m) return parseInt(m[3], 10) + ' ' + MON[parseInt(m[2], 10) - 1] + ' ' + m[1];
    var x = new Date(d); return isNaN(x) ? '' : x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear();
  }
  function rel(d) {
    if (!d) return '';
    var t = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? Date.parse(d + 'T00:00:00Z') : Date.parse(d);
    if (isNaN(t)) return '';
    var days = Math.floor((Date.now() - t) / 86400000);
    if (days < 1) { var h = Math.floor((Date.now() - t) / 3600000); return h < 1 ? 'just now' : (h < 24 && !/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? h + 'h ago' : 'today'); }
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    if (days < 365) return Math.floor(days / 30) + ' mo ago';
    return Math.floor(days / 365) + ' yr ago';
  }
  function toast(msg, isErr) {
    var t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, isErr ? 6500 : 2600);
  }
  function b64dec(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64enc(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function pool(items, n, fn) {
    var out = new Array(items.length), i = 0;
    function worker() {
      if (i >= items.length) return Promise.resolve();
      var k = i++;
      return Promise.resolve(fn(items[k], k)).then(function (r) { out[k] = r; }).then(worker);
    }
    var w = []; for (var j = 0; j < Math.min(n, items.length); j++) w.push(worker());
    return Promise.all(w).then(function () { return out; });
  }

  /* ---------- icons ---------- */
  var ICONS = {
    home: '<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.9 17.9A10.9 10.9 0 0 1 12 20C5 20 1 12 1 12a19.8 19.8 0 0 1 5.1-5.9M9.9 4.2A10.7 10.7 0 0 1 12 4c7 0 11 8 11 8a19.7 19.7 0 0 1-3.2 4.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/>',
    trend: '<path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    redirect: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'
  };
  function icon(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }

  /* ---------- API (everything goes through the Worker) ---------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'X-Studio': '1' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('/api' + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 404 && opts.soft404) return null;
        return (r.status === 204 ? Promise.resolve(null) : r.json().catch(function () { return null; })).then(function (data) {
          if (r.status === 401 && !opts.noAuthRedirect) { window.dispatchEvent(new Event('studio:unauth')); }
          if (data && data.reconnect) { window.dispatchEvent(new Event('studio:reconnect')); }
          if (!r.ok) { var e = new Error((data && data.message) || ('Error ' + r.status)); e.status = r.status; throw e; }
          return data;
        });
      });
  }
  function gh(path, opts) { return api('/gh/' + path.replace(/^\//, ''), opts); }
  function getFile(path, ref) {
    return gh('repos/' + REPO + '/contents/' + path + '?ref=' + encodeURIComponent(ref), { soft404: true }).then(function (d) {
      if (!d || Array.isArray(d)) return null;
      return { text: d.content ? b64dec(d.content) : '', sha: d.sha };
    });
  }
  function putFile(path, branch, contentB64, message, sha) {
    var body = { message: message, content: contentB64, branch: branch }; if (sha) body.sha = sha;
    return gh('repos/' + REPO + '/contents/' + path, { method: 'PUT', body: body });
  }
  function delFile(path, branch, sha, message) {
    return gh('repos/' + REPO + '/contents/' + path, { method: 'DELETE', body: { message: message, sha: sha, branch: branch } });
  }
  function listDir(path, ref) {
    return gh('repos/' + REPO + '/contents/' + path + '?ref=' + encodeURIComponent(ref), { soft404: true }).then(function (d) { return Array.isArray(d) ? d : []; });
  }
  function dispatch(workflow, inputs) {
    return gh('repos/' + REPO + '/actions/workflows/' + workflow + '/dispatches', { method: 'POST', body: { ref: BRANCH, inputs: inputs } });
  }

  /* ---------- post files ---------- */
  function parsePost(text) {
    var m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    if (!m) throw new Error('File has no frontmatter');
    var fm = window.jsyaml.load(m[1]) || {};
    ['datePublished', 'dateModified'].forEach(function (k) { if (fm[k] instanceof Date) fm[k] = fm[k].toISOString().slice(0, 10); });
    return { fm: fm, body: m[2].replace(/^\r?\n/, '') };
  }
  function serializePost(fm, body) {
    var ordered = {};
    FM_ORDER.forEach(function (k) { if (fm[k] !== undefined) ordered[k] = fm[k]; });
    Object.keys(fm).forEach(function (k) { if (ordered[k] === undefined) ordered[k] = fm[k]; });
    return '---\n' + window.jsyaml.dump(ordered, { lineWidth: -1, noRefs: true }) + '---\n' + body.replace(/\s+$/, '') + '\n';
  }
  function blankPost() {
    return {
      layout: 'layouts/blog-post.njk', permalink: '/blog/{{ canonicalSlug }}.html', title: '', metaDescription: '', keywords: [],
      canonicalSlug: '', category: 'exam-preparation', ogImage: 'default-cover.png', datePublished: today(), dateModified: today(), readTime: 5,
      h1: '', leadParagraph: '', quickAnswer: '', tocEntries: [], keyTakeaways: [], faq: [], tags: [], relatedGuides: [],
      coverEyebrow: 'NIBAHA HAQ 0329 5209868', coverHighlights: [], coverContactLine: 'FOR VULMS SUPPORT, CONTACT 03295209868', coverCtaText: 'Get Help'
    };
  }
  function tocFromBody(body) {
    var out = [], re = /<h2[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g, m;
    while ((m = re.exec(body))) out.push({ anchor: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() });
    return out;
  }

  /* ---------- SEO checks ---------- */
  function seoChecks(fm, body) {
    var kw = String((fm.keywords && fm.keywords[0]) || '').toLowerCase().trim();
    var has = function (s) { return kw && String(s || '').toLowerCase().indexOf(kw) !== -1; };
    var first100 = String(body).replace(/<[^>]+>/g, ' ').split(/\s+/).slice(0, 100).join(' ');
    var toc = tocFromBody(body), wc = words(body), faq = (fm.faq || []).filter(function (f) { return f.question && f.answer; });
    var links = (String(body).match(/href="\/[^"]*"/g) || []).length;
    var qa = words(fm.quickAnswer), md = plainLen(fm.metaDescription), tl = plainLen(fm.title) + 14;
    var forbidden = /<\s*(script|iframe|style|object|embed|form|link|meta|base)\b/i.test(body) || /\son[a-z]+\s*=/i.test(String(body).replace(/data-[a-z-]+="[^"]*"/g, '')) || /javascript:|data:text\/html/i.test(body);
    var C = [];
    function add(label, ok, block) { C.push({ ok: !!ok, label: label, block: !!block && !ok }); }
    add('Primary keyword set (first keyword)', kw, true);
    add('Title + " | Nibaha Haq" is 30-60 chars (now ' + tl + ')', tl >= 30 && tl <= 60, true);
    add('Keyword in title', has(fm.title));
    add('Meta description 70-160 chars (now ' + md + ')', md >= 70 && md <= 160, true);
    add('Keyword in meta description', has(fm.metaDescription));
    add('Slug is clean lowercase-hyphen', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.canonicalSlug || ''), true);
    add('Keyword in slug', kw && String(fm.canonicalSlug || '').indexOf(slugify(kw).split('-')[0]) !== -1);
    add('H1 present and contains keyword', !!fm.h1 && has(fm.h1), !fm.h1);
    add('Keyword in first 100 words', has(first100) || has(fm.leadParagraph));
    add('Quick answer 40-70 words (now ' + qa + ')', qa >= 40 && qa <= 70);
    add('Body length 800+ words (now ' + wc + ')', wc >= 800, wc < 350);
    add('5+ sections (<h2 id="..."> )', toc.length >= 5, toc.length < 2);
    add('3+ internal links in body (now ' + links + ')', links >= 3);
    add('4+ FAQ questions (now ' + faq.length + ')', faq.length >= 4, faq.length < 3);
    add('3+ key takeaways', (fm.keyTakeaways || []).filter(Boolean).length >= 3);
    add('2+ related guides', (fm.relatedGuides || []).filter(function (r) { return r.url; }).length >= 2);
    add('No unsafe HTML (script, iframe, onclick ...)', !forbidden, true);
    add('No guarantee wording ("guaranteed", "leaked paper")', !/\b(guaranteed?|100% (pass|success)|surely pass|leaked? paper)\b/i.test(body + ' ' + (fm.quickAnswer || '')), true);
    return C;
  }

  /* ---------- activity log (from git commit messages) ---------- */
  function commitMsg(source, kind, title, slug, who, verb) {
    return '[' + source + '] ' + kind + ' post: ' + title + ' (' + (verb || 'by') + ' ' + who + ') [slug:' + slug + ']';
  }
  function parseCommit(c) {
    var first = String((c.commit && c.commit.message) || '').split('\n')[0];
    // the Worker stamps the VERIFIED account on every change: " [studio:name]"
    var st = /\s\[studio:([^\]]+)\]\s*$/.exec(first), verified = st ? st[1] : '';
    if (st) first = first.replace(/\s\[studio:[^\]]+\]\s*$/, '');
    var m = /^\[(manual|auto)\]\s+(Publish|Update)\s+post:\s+(.*?)\s+\((?:by|approved by)\s+([^)]+)\)(?:\s+\[slug:([^\]]+)\])?\s*$/.exec(first);
    var date = c.commit && c.commit.author && c.commit.author.date;
    if (m) return { source: m[1], kind: m[2], title: m[3], by: verified || m[4], verified: !!verified, slug: m[5] || '', date: date, url: c.html_url, sha: c.sha, known: true };
    return { source: 'manual', kind: 'Update', title: first.slice(0, 90), by: verified || (c.commit && c.commit.author && c.commit.author.name) || '', verified: !!verified, slug: '', date: date, url: c.html_url, sha: c.sha, known: false };
  }

  /* ---------- images: compress in the browser before upload ---------- */
  // Resizes to maxW wide and re-encodes as WebP, lowering quality until it fits targetBytes.
  function compressImage(file, maxW, targetBytes) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, maxW / w), cw = Math.round(w * s), ch = Math.round(h * s);
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        var q = 0.86, tries = 0;
        (function encode() {
          cv.toBlob(function (b) {
            if (!b) { reject(new Error('This browser could not compress the image')); return; }
            if (b.size > targetBytes && q > 0.4 && tries < 6) { q -= 0.1; tries++; encode(); return; }
            var rd = new FileReader();
            rd.onload = function () { resolve({ b64: String(rd.result).split(',')[1], dataUrl: rd.result, size: b.size, w: cw, h: ch, ext: b.type === 'image/webp' ? 'webp' : (b.type === 'image/jpeg' ? 'jpg' : 'png') }); };
            rd.readAsDataURL(b);
          }, 'image/webp', q);
        })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image')); };
      img.src = url;
    });
  }

  /* ---------- cover / thumbnail generator (canvas, 1200x630) ---------- */
  var COVER_VARIANTS = {
    navy: { name: 'Navy', bg: ['#0b2b57', '#16539f'], fg: '#ffffff', sub: '#c9dbf3', accent: '#f5b400', chip: 'rgba(255,255,255,.14)', chipFg: '#ffffff', shape: 'rgba(255,255,255,.06)' },
    gold: { name: 'Gold', bg: ['#f5b400', '#ffd24d'], fg: '#0b2b57', sub: '#5b4300', accent: '#0b2b57', chip: 'rgba(11,43,87,.12)', chipFg: '#0b2b57', shape: 'rgba(255,255,255,.28)' },
    light: { name: 'Light', bg: ['#f3f6fb', '#dce8f7'], fg: '#0b2b57', sub: '#54698a', accent: '#00448b', chip: '#d3e2f5', chipFg: '#0b2b57', shape: 'rgba(0,68,139,.07)' }
  };
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  // opts: {title, label, highlights[], variant}. Resolves like compressImage: {b64, dataUrl, size, w, h, ext, canvas}
  function makeCover(opts) {
    var V = COVER_VARIANTS[opts.variant] || COVER_VARIANTS.navy, W = 1200, H = 630;
    var logo = new Image();
    var logoP = new Promise(function (res) { logo.onload = function () { res(true); }; logo.onerror = function () { res(false); }; logo.src = '/assets/logo.png'; });
    var fontsP = Promise.all(['800 60px Poppins', '700 30px Poppins', '600 26px Poppins', '500 24px Poppins'].map(function (f) { return document.fonts.load(f); })).catch(function () { /* fall back to system font */ });
    return Promise.all([logoP, fontsP]).then(function (r) {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var ctx = cv.getContext('2d'), F = 'Poppins, "Segoe UI", Arial, sans-serif';
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, V.bg[0]); g.addColorStop(1, V.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // soft decorative shapes + dot grid (the site's look)
      ctx.fillStyle = V.shape; ctx.beginPath(); ctx.arc(W - 120, -40, 330, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(W + 40, H - 10, 230, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-60, H + 40, 210, 0, 7); ctx.fill();
      ctx.fillStyle = V.shape; for (var gx = 40; gx < W; gx += 34) for (var gy = 30; gy < H; gy += 34) { ctx.fillRect(gx, gy, 2, 2); }
      // brand row
      var bx = 72, by = 56;
      if (r[0]) { ctx.save(); ctx.beginPath(); ctx.arc(bx + 34, by + 34, 34, 0, 7); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip(); ctx.drawImage(logo, bx, by, 68, 68); ctx.restore(); }
      ctx.fillStyle = V.fg; ctx.font = '800 30px ' + F; ctx.textBaseline = 'alphabetic'; ctx.fillText('Nibaha Haq', bx + (r[0] ? 86 : 0), by + 32);
      ctx.fillStyle = V.sub; ctx.font = '600 17px ' + F; ctx.fillText('VU ACADEMIC SUPPORT', bx + (r[0] ? 86 : 0), by + 58);
      // category pill (top right)
      if (opts.label) {
        ctx.font = '700 22px ' + F; var lw = ctx.measureText(String(opts.label).toUpperCase()).width + 44, lx = W - 72 - lw, ly = 62;
        rrect(ctx, lx, ly, lw, 44, 22); ctx.fillStyle = V.chip; ctx.fill(); ctx.fillStyle = V.chipFg; ctx.fillText(String(opts.label).toUpperCase(), lx + 22, ly + 30);
      }
      // title: biggest size that fits in at most 4 lines
      var maxW = 1000, size = 84, lines;
      for (; size >= 46; size -= 4) { ctx.font = '800 ' + size + 'px ' + F; lines = wrapText(ctx, opts.title || 'Your title here', maxW); if (lines.length <= (size > 64 ? 3 : 4)) break; }
      var lh = Math.round(size * 1.14), blockH = lines.length * lh, top = 200 + Math.max(0, (270 - blockH) / 2);
      ctx.fillStyle = V.accent; rrect(ctx, 72, top - 8, 10, blockH + 4, 5); ctx.fill();
      ctx.fillStyle = V.fg; ctx.font = '800 ' + size + 'px ' + F; lines.forEach(function (l, i) { ctx.fillText(l, 104, top + size * 0.86 + i * lh); });
      // highlight chips
      var chips = (opts.highlights || []).filter(Boolean).slice(0, 3), cx = 104, cy = Math.min(top + blockH + 34, 480);
      ctx.font = '700 22px ' + F;
      chips.forEach(function (c) { var t = String(c).toUpperCase().slice(0, 28), w = ctx.measureText(t).width + 36; if (cx + w > W - 60) return; rrect(ctx, cx, cy, w, 42, 21); ctx.fillStyle = V.chip; ctx.fill(); ctx.fillStyle = V.chipFg; ctx.fillText(t, cx + 18, cy + 29); cx += w + 14; });
      // bottom strip
      ctx.fillStyle = V.accent; ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = V.sub; ctx.font = '600 22px ' + F; ctx.textAlign = 'right'; ctx.fillText('lmshandling.com', W - 72, H - 42); ctx.textAlign = 'left';
      return new Promise(function (resolve, reject) {
        var q = 0.9;
        (function enc() {
          cv.toBlob(function (b) {
            if (!b) { reject(new Error('This browser could not create the image')); return; }
            if (b.size > 220 * 1024 && q > 0.5) { q -= 0.1; enc(); return; }
            var rd = new FileReader();
            rd.onload = function () { resolve({ b64: String(rd.result).split(',')[1], dataUrl: rd.result, size: b.size, w: W, h: H, ext: b.type === 'image/webp' ? 'webp' : 'png', canvas: cv }); };
            rd.readAsDataURL(b);
          }, 'image/webp', q);
        })();
      });
    });
  }

  /* ---------- internal link suggestions for the editor ---------- */
  var STOP = {};
  ('the and for vu guide how to of in a on with your you is are 2026 2025 what why vulms virtual university from this that about into out can will not get new all').split(' ').forEach(function (w) { STOP[w] = 1; });
  function toks(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && !STOP[w]; }); }
  function linkSuggestions(posts, fm, body, selfSlug) {
    var mine = {}; toks((fm.title || '') + ' ' + (fm.h1 || '') + ' ' + (fm.keywords || []).join(' ') + ' ' + String(body || '').replace(/<[^>]+>/g, ' ').slice(0, 1500)).forEach(function (w) { mine[w] = (mine[w] || 0) + 1; });
    var linked = {}; (String(body || '').match(/href="\/blog\/([a-z0-9-]+)/g) || []).forEach(function (m) { linked[m.replace('href="/blog/', '')] = 1; });
    return posts.filter(function (p) { return p.kind !== 'draft' && p.slug !== selfSlug && !linked[p.slug]; }).map(function (p) {
      var seen = {}, sc = 0;
      toks(p.title + ' ' + p.slug.replace(/-/g, ' ')).forEach(function (w) { if (!seen[w] && mine[w]) { seen[w] = 1; sc += 2 + Math.min(2, mine[w] - 1) * 0.5; } });
      if (sc > 0 && fm.category && p.category === fm.category) sc += 1.5;
      return { slug: p.slug, title: p.title, category: p.category, score: sc };
    }).filter(function (x) { return x.score >= 2; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 6);
  }

  /* ---------- text diff for update proposals ---------- */
  function textBlocks(html) {
    var t = String(html)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    var mm = /<main[\s\S]*?<\/main>/i.exec(t) || /<article[\s\S]*?<\/article>/i.exec(t) || /<body[\s\S]*?<\/body>/i.exec(t);
    if (mm) t = mm[0];
    t = t.replace(/<\/(p|li|h[1-6]|tr|div|section|summary|details|blockquote)>|<br\s*\/?>/gi, '\n');
    t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return t.split('\n').map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(function (s) { return s.length > 1; });
  }
  function diffBlocks(a, b) {
    var n = a.length, m = b.length, i, j;
    if (n * m > 4000000) { return [{ t: 'del', s: '(page too large to diff block by block)' }]; }
    var L = []; for (i = 0; i <= n; i++) { L.push(new Uint16Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var ops = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: 'same', s: a[i] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { ops.push({ t: 'del', s: a[i] }); i++; }
      else { ops.push({ t: 'add', s: b[j] }); j++; }
    }
    while (i < n) ops.push({ t: 'del', s: a[i++] });
    while (j < m) ops.push({ t: 'add', s: b[j++] });
    return ops;
  }

  window.L = {
    REPO: REPO, BRANCH: BRANCH, DRAFTS: DRAFTS, SITE: SITE, CATS: CATS,
    esc: esc, words: words, plainLen: plainLen, today: today, slugify: slugify, catLabel: catLabel, daysSince: daysSince,
    fmtDate: fmtDate, rel: rel, toast: toast, b64enc: b64enc, b64dec: b64dec, pool: pool, icon: icon,
    api: api, gh: gh, getFile: getFile, putFile: putFile, delFile: delFile, listDir: listDir, dispatch: dispatch,
    parsePost: parsePost, serializePost: serializePost, blankPost: blankPost, tocFromBody: tocFromBody,
    compressImage: compressImage, makeCover: makeCover, COVER_VARIANTS: COVER_VARIANTS, linkSuggestions: linkSuggestions,
    seoChecks: seoChecks, commitMsg: commitMsg, parseCommit: parseCommit, textBlocks: textBlocks, diffBlocks: diffBlocks
  };
})();
