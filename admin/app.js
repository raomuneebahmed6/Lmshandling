/* Blog Studio for lmshandling.com
 * keyword -> Write (GitHub Action + Claude) -> edit -> Preview -> Publish.
 * Everything runs in the browser against the GitHub API with the signed-in
 * user's own token, so GitHub decides who may do what (repo collaborators).
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

  var token = null;
  try { token = sessionStorage.getItem('lmh_token'); } catch (e) { /* private mode */ }
  var cur = null;       // the post being edited
  var pollTimer = null;
  var scoreTimer = null;
  var $app = document.getElementById('app');

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg, isErr) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, isErr ? 6000 : 2600);
  }
  function b64dec(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64enc(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function slugify(s) { return String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 9).join('-'); }
  function words(s) { return String(s || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length; }
  function plainLen(s) { return String(s || '').length; }

  /* ---------- GitHub API ---------- */
  function gh(path, opts) {
    opts = opts || {};
    var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        if (r.status === 401) { logout(); throw new Error('Session expired. Please sign in again.'); }
        if (r.status === 404 && opts.soft404) return null;
        return (r.status === 204 ? Promise.resolve(null) : r.json().catch(function () { return null; })).then(function (data) {
          if (!r.ok) { var e = new Error((data && data.message) || ('GitHub error ' + r.status)); e.status = r.status; throw e; }
          return data;
        });
      });
  }
  function getFile(path, ref) {
    return gh('/repos/' + REPO + '/contents/' + path + '?ref=' + encodeURIComponent(ref), { soft404: true }).then(function (d) {
      if (!d || Array.isArray(d)) return null;
      return { text: d.content ? b64dec(d.content) : '', sha: d.sha };
    });
  }
  function putFile(path, branch, contentB64, message, sha) {
    var body = { message: message, content: contentB64, branch: branch };
    if (sha) body.sha = sha;
    return gh('/repos/' + REPO + '/contents/' + path, { method: 'PUT', body: body });
  }
  function delFile(path, branch, sha, message) {
    return gh('/repos/' + REPO + '/contents/' + path, { method: 'DELETE', body: { message: message, sha: sha, branch: branch } });
  }
  function listDir(path, ref) {
    return gh('/repos/' + REPO + '/contents/' + path + '?ref=' + encodeURIComponent(ref), { soft404: true }).then(function (d) { return Array.isArray(d) ? d : []; });
  }

  /* ---------- markdown + frontmatter ---------- */
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

  /* ---------- SEO checks (live score + blockers) ---------- */
  function seoChecks(fm, body) {
    var kw = String((fm.keywords && fm.keywords[0]) || '').toLowerCase().trim();
    var has = function (s) { return kw && String(s || '').toLowerCase().indexOf(kw) !== -1; };
    var first100 = String(body).replace(/<[^>]+>/g, ' ').split(/\s+/).slice(0, 100).join(' ');
    var toc = tocFromBody(body), wc = words(body), faq = (fm.faq || []).filter(function (f) { return f.question && f.answer; });
    var links = (String(body).match(/href="\/[^"]*"/g) || []).length;
    var qa = words(fm.quickAnswer), md = plainLen(fm.metaDescription), tl = plainLen(fm.title) + 14;
    var forbidden = /<\s*(script|iframe|style|object|embed|form|link|meta|base)\b/i.test(body) || /\son[a-z]+\s*=/i.test(String(body).replace(/data-[a-z-]+="[^"]*"/g, '')) || /javascript:|data:text\/html/i.test(body);
    var C = [];
    function add(level, label, ok, block) { C.push({ ok: ok, label: label, block: !!block && !ok }); }
    add(0, 'Primary keyword set (first keyword)', !!kw, true);
    add(0, 'Title + " | Nibaha Haq" is 30-60 chars (now ' + tl + ')', tl >= 30 && tl <= 60, true);
    add(0, 'Keyword in title', has(fm.title));
    add(0, 'Meta description 70-160 chars (now ' + md + ')', md >= 70 && md <= 160, true);
    add(0, 'Keyword in meta description', has(fm.metaDescription));
    add(0, 'Slug is clean lowercase-hyphen', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.canonicalSlug || ''), true);
    add(0, 'Keyword in slug', kw && String(fm.canonicalSlug || '').indexOf(slugify(kw).split('-')[0]) !== -1);
    add(0, 'H1 present and contains keyword', !!fm.h1 && has(fm.h1), !fm.h1);
    add(0, 'Keyword in first 100 words', has(first100) || has(fm.leadParagraph));
    add(0, 'Quick answer 40-70 words (now ' + qa + ')', qa >= 40 && qa <= 70);
    add(0, 'Body length 800+ words (now ' + wc + ')', wc >= 800, wc < 350);
    add(0, '5+ sections (<h2 id="..."> )', toc.length >= 5, toc.length < 2);
    add(0, '3+ internal links in body (now ' + links + ')', links >= 3);
    add(0, '4+ FAQ questions (now ' + faq.length + ')', faq.length >= 4, faq.length < 3);
    add(0, '3+ key takeaways', (fm.keyTakeaways || []).filter(Boolean).length >= 3);
    add(0, '2+ related guides', (fm.relatedGuides || []).filter(function (r) { return r.url; }).length >= 2);
    add(0, 'No unsafe HTML (script, iframe, onclick ...)', !forbidden, true);
    add(0, 'No guarantee wording ("guaranteed", "leaked paper")', !/\b(guaranteed?|100% (pass|success)|surely pass|leaked? paper)\b/i.test(body + ' ' + (fm.quickAnswer || '')), true);
    return C;
  }

  /* ---------- auth ---------- */
  function logout() {
    token = null;
    try { sessionStorage.removeItem('lmh_token'); } catch (e) { /* ignore */ }
    renderLogin();
  }
  function setToken(t) { token = t; try { sessionStorage.setItem('lmh_token', t); } catch (e) { /* ignore */ } route(); }
  function startOAuth() {
    var popup = window.open(SITE + '/auth', 'lmh-oauth', 'width=620,height=760');
    if (!popup) { toast('Allow pop-ups for this site, then try again.', true); return; }
    function onMsg(e) {
      if (e.origin !== location.origin) return;
      if (e.data === 'authorizing:github') { e.source.postMessage('authorizing:github', e.origin); return; }
      if (typeof e.data === 'string' && e.data.indexOf('authorization:github:success:') === 0) {
        window.removeEventListener('message', onMsg);
        try { setToken(JSON.parse(e.data.slice('authorization:github:success:'.length)).token); } catch (err) { toast('Sign-in failed', true); }
      }
    }
    window.addEventListener('message', onMsg);
  }
  function renderLogin(msg) {
    clearInterval(pollTimer);
    $app.innerHTML = '<div class="login card"><img class="logo" src="/assets/logo.png" alt="">' +
      '<h2>Blog Studio</h2><p class="sub">Write, preview and publish blog posts for lmshandling.com.</p>' +
      (msg ? '<div class="alert err">' + esc(msg) + '</div>' : '') +
      '<button class="btn" id="signin">Sign in with GitHub</button>' +
      '<details style="margin-top:1.2rem;text-align:left"><summary class="hint" style="cursor:pointer">Sign in with a personal access token instead</summary>' +
      '<label class="f">Token <small>(repo scope, kept only in this tab)</small></label><input type="password" id="pat" autocomplete="off">' +
      '<button class="btn ghost sm" id="patgo" style="margin-top:.6rem">Use token</button></details></div>';
    document.getElementById('signin').onclick = startOAuth;
    document.getElementById('patgo').onclick = function () { var v = document.getElementById('pat').value.trim(); if (v) setToken(v); };
  }
  function shell(inner, crumb) {
    $app.innerHTML = '<div class="top"><h1>Blog Studio <span>lmshandling.com</span></h1>' + (crumb || '') +
      '<a href="' + SITE + '/blog/" target="_blank" rel="noopener">View blog</a><button id="out">Sign out</button></div>' + inner;
    document.getElementById('out').onclick = logout;
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    clearInterval(pollTimer);
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem('lmh_pending') || 'null'); } catch (e) { /* ignore */ }
    shell('<div class="wrap">' +
      '<div class="card write"><h2>Write a new blog from a keyword</h2><p class="sub">Claude researches, writes the full post in the site format, and checks it. Takes 3-6 minutes. Nothing goes live until you press Publish.</p>' +
      '<div class="row"><div><label class="f">Keyword / topic</label><input type="text" id="kw" placeholder="e.g. VU GDB schedule and marking"></div>' +
      '<div class="fit" style="min-width:220px"><label class="f">Category</label><select id="cat"><option value="auto">Auto-pick</option>' + CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="f">Extra instructions <small>(optional)</small></label><textarea id="notes" rows="2" placeholder="e.g. target Spring 2026 students, mention CS101"></textarea>' +
      '<div style="margin-top:1rem"><button class="btn gold" id="write">Write blog</button> <button class="btn ghost" id="blank" style="color:#fff;background:transparent;border-color:rgba(255,255,255,.4)">Start blank</button></div>' +
      '<div id="prog"></div></div>' +
      '<div class="card"><h2>Drafts</h2><p class="sub">Written but not live yet.</p><ul class="list" id="drafts"><li class="empty">Loading…</li></ul></div>' +
      '<div class="card"><h2>Published posts</h2><p class="sub">Posts made with Blog Studio. The older hand-built posts are not editable here.</p><ul class="list" id="posts"><li class="empty">Loading…</li></ul></div></div>');
    document.getElementById('write').onclick = startWrite;
    document.getElementById('blank').onclick = function () { cur = { kind: 'new', fm: blankPost(), body: '', image: null }; location.hash = '#/edit'; };
    loadList('drafts', 'drafts', DRAFTS, 'draft');
    loadList('posts', 'content/blog', BRANCH, 'post');
    if (pending && Date.now() - pending.t < 25 * 60000) watchRun(pending);
  }
  function loadList(elId, dir, ref, kind) {
    listDir(dir, ref).then(function (items) {
      var files = items.filter(function (i) { return /\.md$/.test(i.name); });
      var ul = document.getElementById(elId);
      if (!ul) return;
      if (!files.length) { ul.innerHTML = '<li class="empty">' + (kind === 'draft' ? 'No drafts yet.' : 'No posts yet.') + '</li>'; return; }
      return Promise.all(files.map(function (f) {
        return getFile(dir + '/' + f.name, ref).then(function (g) {
          try { var p = parsePost(g.text); return { name: f.name, fm: p.fm }; } catch (e) { return { name: f.name, fm: { title: f.name } }; }
        });
      })).then(function (rows) {
        rows.sort(function (a, b) { return String(b.fm.dateModified || '') > String(a.fm.dateModified || '') ? 1 : -1; });
        ul = document.getElementById(elId); if (!ul) return;
        ul.innerHTML = rows.map(function (r) {
          var slug = r.fm.canonicalSlug || r.name.replace(/\.md$/, '');
          return '<li><div class="t"><b>' + esc(r.fm.title || r.name) + '</b><span>' + esc(r.fm.category || '') + ' · ' + esc(r.fm.dateModified || '') + '</span></div>' +
            '<span class="pill ' + (kind === 'post' ? 'live' : 'draft') + '">' + (kind === 'post' ? 'Live' : 'Draft') + '</span>' +
            (kind === 'post' ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + SITE + '/blog/' + esc(slug) + '">Open</a>' : '') +
            '<button class="btn sm" data-open="' + esc(kind + ':' + r.name) + '">Edit</button>' +
            (kind === 'draft' ? '<button class="btn danger sm" data-del="' + esc(r.name) + '">Delete</button>' : '') + '</li>';
        }).join('');
        ul.onclick = function (e) {
          var o = e.target.getAttribute('data-open'), d = e.target.getAttribute('data-del');
          if (o) location.hash = '#/edit/' + o;
          if (d && confirm('Delete this draft permanently?')) {
            getFile('drafts/' + d, DRAFTS).then(function (g) { return delFile('drafts/' + d, DRAFTS, g.sha, 'Delete draft ' + d); })
              .then(function () { toast('Draft deleted'); renderDashboard(); }).catch(function (er) { toast(er.message, true); });
          }
        };
      });
    }).catch(function (e) { var ul = document.getElementById(elId); if (ul) ul.innerHTML = '<li class="empty">Could not load: ' + esc(e.message) + '</li>'; });
  }

  /* ---------- Write: dispatch the workflow and watch it ---------- */
  var STEPS = ['Request sent', 'Waiting for a runner', 'Claude is researching and writing', 'Checking SEO rules', 'Draft ready'];
  function drawProgress(step, failed, link) {
    var box = document.getElementById('prog'); if (!box) return;
    box.innerHTML = '<ul class="steps">' + STEPS.map(function (s, i) {
      var cls = failed && i === step ? 'fail' : (i < step ? 'done' : (i === step ? 'on' : ''));
      return '<li class="' + cls + '"><span class="d">' + (cls === 'done' ? '✓' : (cls === 'fail' ? '!' : i + 1)) + '</span>' + esc(s) + '</li>';
    }).join('') + '</ul>' + (link ? '<p class="hint" style="color:#cfe0f5"><a style="color:#fff" target="_blank" rel="noopener" href="' + esc(link) + '">View run log on GitHub</a></p>' : '');
  }
  function startWrite() {
    var kw = document.getElementById('kw').value.trim();
    if (kw.length < 4) { toast('Enter a keyword first', true); return; }
    var id = 'r' + Date.now().toString(36);
    var btn = document.getElementById('write'); btn.disabled = true;
    drawProgress(0);
    gh('/repos/' + REPO + '/actions/workflows/write-blog.yml/dispatches', {
      method: 'POST',
      body: { ref: BRANCH, inputs: { request_id: id, keyword: kw, category: document.getElementById('cat').value, notes: document.getElementById('notes').value.trim() } }
    }).then(function () {
      var p = { id: id, t: Date.now(), kw: kw };
      try { localStorage.setItem('lmh_pending', JSON.stringify(p)); } catch (e) { /* ignore */ }
      watchRun(p);
    }).catch(function (e) {
      btn.disabled = false;
      var box = document.getElementById('prog');
      box.innerHTML = '<div class="alert err">Could not start the writer: ' + esc(e.message) +
        (e.status === 404 || e.status === 422 ? '<br>The "Write blog draft (Claude)" workflow must exist on the ' + esc(BRANCH) + ' branch and the signed-in account needs write access.' : '') + '</div>';
    });
  }
  function watchRun(p) {
    clearInterval(pollTimer);
    var btn = document.getElementById('write'); if (btn) btn.disabled = true;
    drawProgress(1);
    var tries = 0;
    function tick() {
      tries++;
      gh('/repos/' + REPO + '/actions/runs?event=workflow_dispatch&per_page=15').then(function (d) {
        var run = ((d && d.workflow_runs) || []).filter(function (r) { return r.display_title === 'Write blog ' + p.id || (r.name || '').indexOf(p.id) !== -1; })[0];
        if (!run) { if (tries > 12) fail('The run never started. Check Actions on GitHub.'); return; }
        if (run.status === 'queued') drawProgress(1, false, run.html_url);
        else if (run.status === 'in_progress') drawProgress(2, false, run.html_url);
        else if (run.status === 'completed') {
          clearInterval(pollTimer);
          if (run.conclusion === 'success') { drawProgress(4, false, run.html_url); finish(); }
          else { drawProgress(2, true, run.html_url); clearPending(); var b = document.getElementById('write'); if (b) b.disabled = false; toast('Writing failed. Open the run log.', true); }
        }
        if (Date.now() - p.t > 25 * 60000) fail('Timed out after 25 minutes.');
      }).catch(function (e) { toast(e.message, true); });
    }
    function fail(m) { clearInterval(pollTimer); clearPending(); drawProgress(1, true); toast(m, true); var b = document.getElementById('write'); if (b) b.disabled = false; }
    function finish() {
      var n = 0;
      (function open() {
        getFile('drafts/' + p.id + '.md', DRAFTS).then(function (g) {
          if (!g && n++ < 6) { setTimeout(open, 2500); return; }
          clearPending();
          if (!g) { toast('Draft file not found yet. Refresh the Drafts list.', true); renderDashboard(); return; }
          location.hash = '#/edit/draft:' + p.id + '.md';
        }).catch(function (e) { toast(e.message, true); });
      })();
    }
    pollTimer = setInterval(tick, 6000); tick();
  }
  function clearPending() { try { localStorage.removeItem('lmh_pending'); } catch (e) { /* ignore */ } }

  /* ---------- editor ---------- */
  function loadForEdit(kind, name) {
    shell('<div class="wrap"><p class="sub">Loading…</p></div>');
    var path = (kind === 'draft' ? 'drafts/' : 'content/blog/') + name;
    return getFile(path, kind === 'draft' ? DRAFTS : BRANCH).then(function (g) {
      if (!g) throw new Error('File not found: ' + path);
      var p = parsePost(g.text);
      cur = { kind: kind, name: name, sha: g.sha, fm: p.fm, body: p.body, image: null, published: kind === 'post' };
      renderEditor();
    });
  }
  function bindVal(id, get, set) {
    var n = document.getElementById(id); if (!n) return;
    n.value = get();
    n.addEventListener('input', function () { set(n.value); queueScore(); });
  }
  function renderEditor() {
    var fm = cur.fm;
    fm.keywords = fm.keywords || []; fm.faq = fm.faq || []; fm.relatedGuides = fm.relatedGuides || []; fm.keyTakeaways = fm.keyTakeaways || [];
    fm.tags = fm.tags || []; fm.coverHighlights = fm.coverHighlights || [];
    var locked = !!cur.published;
    shell('<div class="wrap"><div class="layout"><div>' +
      '<details class="step" open><summary><span class="n">1</span><div><b>Content</b><span class="s">What visitors read</span></div></summary><div class="in">' +
      '<label class="f">Title <small>(browser tab and Google; " | Nibaha Haq" is added)</small></label><input type="text" id="f-title">' +
      '<label class="f">URL slug' + (locked ? ' <small>(locked: the post is live)</small>' : '') + '</label><input type="text" id="f-slug"' + (locked ? ' disabled' : '') + '><div class="hint" id="slugurl"></div>' +
      '<label class="f">Heading (H1) <small>(big title on the page)</small></label><input type="text" id="f-h1">' +
      '<label class="f">Lead paragraph</label><textarea id="f-lead" rows="3"></textarea>' +
      '<label class="f">Quick answer <small>(40-70 words, quoted by Google and AI answers)</small></label><textarea id="f-qa" rows="4"></textarea><div class="hint" id="qacount"></div>' +
      '<label class="f">Body <small>(HTML headings + markdown text)</small></label>' +
      '<div class="tb"><button type="button" class="btn ghost sm" data-ins="h2">+ Section (H2)</button><button type="button" class="btn ghost sm" data-ins="h3">+ Sub-heading</button><button type="button" class="btn ghost sm" data-ins="b">Bold</button><button type="button" class="btn ghost sm" data-ins="ul">List</button><button type="button" class="btn ghost sm" data-ins="a">Link</button><button type="button" class="btn ghost sm" data-ins="cta">WhatsApp box</button></div>' +
      '<textarea class="body" id="f-body"></textarea><div class="hint" id="bodycount"></div>' +
      '<label class="f">Key takeaways <small>(one per line)</small></label><textarea id="f-take" rows="4"></textarea>' +
      '<label class="f">FAQs <small>(each answer 40-60 words works best)</small></label><div id="faqs"></div><button type="button" class="btn ghost sm" id="addfaq">+ Add question</button>' +
      '</div></details>' +
      '<details class="step"><summary><span class="n">2</span><div><b>SEO</b><span class="s">Search metadata and links</span></div></summary><div class="in">' +
      '<label class="f">Meta description <small>(70-160 chars)</small></label><textarea id="f-meta" rows="3"></textarea><div class="hint" id="metacount"></div>' +
      '<label class="f">Keywords <small>(comma separated, the FIRST one is the focus keyword)</small></label><input type="text" id="f-kw">' +
      '<div class="row"><div><label class="f">Category</label><select id="f-cat">' + CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">Read time (min)</label><input type="number" id="f-rt" min="1" max="30"></div></div>' +
      '<label class="f">Tags <small>(comma separated)</small></label><input type="text" id="f-tags">' +
      '<label class="f">Related guides <small>(internal links; hub and spoke)</small></label><div id="rels"></div><button type="button" class="btn ghost sm" id="addrel">+ Add related guide</button>' +
      '</div></details>' +
      '<details class="step"><summary><span class="n">3</span><div><b>Page extras</b><span class="s">Cover card, image, dates</span></div></summary><div class="in">' +
      '<label class="f">Cover card line 1 (eyebrow)</label><input type="text" id="f-eb">' +
      '<label class="f">Cover highlights <small>(2-3 short lines, one per line)</small></label><textarea id="f-hl" rows="3"></textarea>' +
      '<label class="f">Cover contact line</label><input type="text" id="f-cl">' +
      '<label class="f">WhatsApp button text</label><input type="text" id="f-cta">' +
      '<label class="f">Cover / share image <small>(1200x630, jpg or png, under 1.5 MB. Leave to use the default.)</small></label><input type="file" id="f-img" accept="image/png,image/jpeg,image/webp">' +
      '<img class="imgprev" id="imgprev" alt="" src="' + SITE + '/assets/blog-images/' + esc(fm.ogImage || 'default-cover.png') + '">' +
      '<div class="row"><div><label class="f">Date published</label><input type="date" id="f-dp"></div><div><label class="f">Date modified</label><input type="date" id="f-dm"></div></div>' +
      '</div></details></div>' +
      '<aside class="side card"><div class="score" id="score"></div><p class="sub" style="margin:.2rem 0 0">SEO score (live)</p><ul class="checks" id="checks"></ul></aside></div></div>' +
      '<div class="bar"><span class="st" id="st">' + (cur.published ? 'Editing a live post' : (cur.kind === 'draft' ? 'Draft' : 'New post (not saved)')) + '</span>' +
      '<a class="btn ghost" href="#/">Back</a><button class="btn ghost" id="save">Save draft</button><button class="btn ghost" id="prev">Preview</button><button class="btn gold" id="pub">' + (cur.published ? 'Update live post' : 'Publish') + '</button></div>',
      '');

    bindVal('f-title', function () { return fm.title || ''; }, function (v) {
      fm.title = v;
      if (!locked && !cur.slugEdited) { fm.canonicalSlug = slugify(v); document.getElementById('f-slug').value = fm.canonicalSlug; slugHint(); }
    });
    bindVal('f-slug', function () { return fm.canonicalSlug || ''; }, function (v) { fm.canonicalSlug = v; cur.slugEdited = true; slugHint(); });
    bindVal('f-h1', function () { return fm.h1 || ''; }, function (v) { fm.h1 = v; });
    bindVal('f-lead', function () { return fm.leadParagraph || ''; }, function (v) { fm.leadParagraph = v; });
    bindVal('f-qa', function () { return fm.quickAnswer || ''; }, function (v) { fm.quickAnswer = v; counts(); });
    bindVal('f-body', function () { return cur.body; }, function (v) { cur.body = v; counts(); });
    bindVal('f-take', function () { return fm.keyTakeaways.join('\n'); }, function (v) { fm.keyTakeaways = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); });
    bindVal('f-meta', function () { return fm.metaDescription || ''; }, function (v) { fm.metaDescription = v; counts(); });
    bindVal('f-kw', function () { return fm.keywords.join(', '); }, function (v) { fm.keywords = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); });
    bindVal('f-cat', function () { return fm.category; }, function (v) { fm.category = v; });
    bindVal('f-rt', function () { return fm.readTime || 5; }, function (v) { fm.readTime = Math.max(1, Math.min(30, parseInt(v, 10) || 5)); });
    bindVal('f-tags', function () { return fm.tags.join(', '); }, function (v) { fm.tags = v.split(',').map(function (x) { return x.trim(); }).filter(Boolean); });
    bindVal('f-eb', function () { return fm.coverEyebrow || ''; }, function (v) { fm.coverEyebrow = v; });
    bindVal('f-hl', function () { return fm.coverHighlights.join('\n'); }, function (v) { fm.coverHighlights = v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3); });
    bindVal('f-cl', function () { return fm.coverContactLine || ''; }, function (v) { fm.coverContactLine = v; });
    bindVal('f-cta', function () { return fm.coverCtaText || ''; }, function (v) { fm.coverCtaText = v; });
    bindVal('f-dp', function () { return fm.datePublished || ''; }, function (v) { fm.datePublished = v; });
    bindVal('f-dm', function () { return fm.dateModified || ''; }, function (v) { fm.dateModified = v; });
    document.getElementById('f-img').onchange = pickImage;
    document.querySelectorAll('[data-ins]').forEach(function (b) { b.onclick = function () { insertTool(b.getAttribute('data-ins')); }; });
    document.getElementById('addfaq').onclick = function () { fm.faq.push({ question: '', answer: '' }); drawReps(); };
    document.getElementById('addrel').onclick = function () { fm.relatedGuides.push({ url: '', label: '' }); drawReps(); };
    document.getElementById('save').onclick = saveDraft;
    document.getElementById('prev').onclick = openPreview;
    document.getElementById('pub').onclick = publish;
    drawReps(); counts(); slugHint(); scoreNow();
  }
  function slugHint() {
    var n = document.getElementById('slugurl'); if (n) n.textContent = SITE + '/blog/' + (cur.fm.canonicalSlug || '…');
  }
  function counts() {
    var q = document.getElementById('qacount'), b = document.getElementById('bodycount'), m = document.getElementById('metacount');
    var qw = words(cur.fm.quickAnswer), ml = plainLen(cur.fm.metaDescription);
    if (q) { q.textContent = qw + ' words'; q.className = 'hint ' + (qw >= 40 && qw <= 70 ? 'ok' : 'bad'); }
    if (m) { m.textContent = ml + ' / 160 characters'; m.className = 'hint ' + (ml >= 70 && ml <= 160 ? 'ok' : 'bad'); }
    if (b) b.textContent = words(cur.body) + ' words · ' + tocFromBody(cur.body).length + ' sections';
  }
  function drawReps() {
    var fm = cur.fm;
    var faqs = document.getElementById('faqs'), rels = document.getElementById('rels');
    faqs.innerHTML = fm.faq.map(function (f, i) {
      return '<div class="rep"><button type="button" class="btn danger sm rm" data-rmf="' + i + '">Remove</button><label class="f" style="margin-top:0">Question</label><input type="text" data-fq="' + i + '" value="' + esc(f.question) + '">' +
        '<label class="f">Answer</label><textarea rows="3" data-fa="' + i + '">' + esc(f.answer) + '</textarea></div>';
    }).join('');
    rels.innerHTML = fm.relatedGuides.map(function (r, i) {
      return '<div class="rep"><button type="button" class="btn danger sm rm" data-rmr="' + i + '">Remove</button><label class="f" style="margin-top:0">URL <small>(like /blog/vu-help-guide)</small></label><input type="text" data-ru="' + i + '" value="' + esc(r.url) + '">' +
        '<label class="f">Link text</label><input type="text" data-rl="' + i + '" value="' + esc(r.label) + '"></div>';
    }).join('');
    faqs.oninput = function (e) {
      var q = e.target.getAttribute('data-fq'), a = e.target.getAttribute('data-fa');
      if (q !== null) fm.faq[q].question = e.target.value; if (a !== null) fm.faq[a].answer = e.target.value; queueScore();
    };
    rels.oninput = function (e) {
      var u = e.target.getAttribute('data-ru'), l = e.target.getAttribute('data-rl');
      if (u !== null) fm.relatedGuides[u].url = e.target.value.trim(); if (l !== null) fm.relatedGuides[l].label = e.target.value; queueScore();
    };
    faqs.onclick = function (e) { var i = e.target.getAttribute('data-rmf'); if (i !== null) { fm.faq.splice(i, 1); drawReps(); queueScore(); } };
    rels.onclick = function (e) { var i = e.target.getAttribute('data-rmr'); if (i !== null) { fm.relatedGuides.splice(i, 1); drawReps(); queueScore(); } };
  }
  function insertTool(kind) {
    var ta = document.getElementById('f-body'), s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e), ins;
    if (kind === 'h2') ins = '\n<h2 id="' + (slugify(sel) || 'new-section') + '">' + (sel || 'New section heading') + '</h2>\n\n';
    else if (kind === 'h3') ins = '\n<h3>' + (sel || 'Sub-heading') + '</h3>\n\n';
    else if (kind === 'b') ins = '**' + (sel || 'bold text') + '**';
    else if (kind === 'ul') ins = '\n- ' + (sel || 'First point') + '\n- Second point\n- Third point\n\n';
    else if (kind === 'a') { var u = prompt('Link to (e.g. /blog/vu-help-guide):', '/blog/'); if (!u) return; ins = '<a class="inline-link" href="' + u.replace(/"/g, '') + '">' + (sel || 'link text') + '</a>'; }
    else ins = '\n<div class="highlight-box"><p>Need help with this? <a class="inline-link" data-whatsapp="Hello Nibaha Haq, I need help with: " target="_blank" rel="noopener" href="https://wa.me/923295209868?text=Hello%20Nibaha%20Haq%2C%20I%20need%20help%20with%3A%20">Message us on WhatsApp</a> and get a clear direction.</p></div>\n\n';
    ta.setRangeText(ins, s, e, 'end'); ta.focus();
    cur.body = ta.value; counts(); queueScore();
  }
  function pickImage(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { toast('Image is over 1.5 MB. Compress it first.', true); e.target.value = ''; return; }
    var ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    var rd = new FileReader();
    rd.onload = function () {
      var name = (cur.fm.canonicalSlug || 'cover') + '-cover.' + ext;
      cur.image = { name: name, b64: String(rd.result).split(',')[1] };
      cur.fm.ogImage = name;
      document.getElementById('imgprev').src = rd.result;
    };
    rd.readAsDataURL(f);
  }
  function queueScore() { clearTimeout(scoreTimer); scoreTimer = setTimeout(scoreNow, 200); }
  function scoreNow() {
    var C = seoChecks(cur.fm, cur.body), ok = C.filter(function (c) { return c.ok; }).length, pct = Math.round(ok / C.length * 100);
    var s = document.getElementById('score'), ul = document.getElementById('checks'); if (!s) return;
    s.className = 'score ' + (pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'low'));
    s.innerHTML = '<b>' + pct + '</b><span>/ 100</span>';
    ul.innerHTML = C.map(function (c) { return '<li class="' + (c.ok ? 'ok' : (c.block ? 'no' : 'wa')) + '"><span class="i">' + (c.ok ? '✓' : (c.block ? '✕' : '!')) + '</span><span>' + esc(c.label) + '</span></li>'; }).join('');
  }

  /* ---------- preview (sandboxed iframe: no scripts can run) ---------- */
  function previewHtml() {
    var fm = cur.fm, cat = (CATS.filter(function (c) { return c[0] === fm.category; })[0] || ['', ''])[1];
    var toc = tocFromBody(cur.body);
    var css = 'body{font-family:Georgia,"Times New Roman",serif;color:#1d2b3f;line-height:1.75;margin:0;background:#f4f8fd}main{max-width:760px;margin:0 auto;padding:1.4rem 1.1rem 3rem;background:#fff}' +
      'h1{font-family:system-ui,sans-serif;color:#0b2b57;font-size:2rem;line-height:1.2;margin:.3rem 0 .8rem}h2{font-family:system-ui,sans-serif;color:#0b2b57;margin-top:2.2rem}h3{font-family:system-ui,sans-serif;color:#00448b}' +
      '.eyebrow{font-family:system-ui,sans-serif;font-size:.78rem;font-weight:800;letter-spacing:.08em;color:#00448b;text-transform:uppercase}.lead{font-size:1.15rem;color:#40526b}' +
      '.qa{background:#fff8e1;border-left:5px solid #f5b400;padding:.8rem 1.1rem;border-radius:8px;margin:1.2rem 0;font-family:system-ui,sans-serif}.qa b{display:block;color:#7a5a00;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}' +
      '.toc{background:#eef4fb;border-radius:10px;padding:.8rem 1.2rem;font-family:system-ui,sans-serif}.highlight-box{background:#e9f2fd;border-left:5px solid #00448b;padding:.8rem 1.1rem;border-radius:8px}' +
      'a{color:#00448b}details{border:1px solid #dbe5f1;border-radius:10px;padding:.6rem 1rem;margin:.6rem 0}summary{font-weight:700;cursor:pointer;font-family:system-ui,sans-serif}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dbe5f1;padding:.4rem .6rem}';
    var html = '<p class="eyebrow">' + esc(cat) + ' · ' + esc(fm.readTime || '') + ' min read</p><h1>' + esc(fm.h1 || fm.title) + '</h1><p class="lead">' + esc(fm.leadParagraph) + '</p>' +
      '<div class="qa"><b>Quick answer</b>' + esc(fm.quickAnswer) + '</div>' +
      (toc.length ? '<div class="toc"><b>In this guide</b><ol>' + toc.map(function (t) { return '<li>' + esc(t.label) + '</li>'; }).join('') + '</ol></div>' : '') +
      window.marked.parse(cur.body) +
      ((fm.keyTakeaways || []).length ? '<h2>Key takeaways</h2><ul>' + fm.keyTakeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      ((fm.faq || []).length ? '<h2>Frequently asked questions</h2>' + fm.faq.map(function (f) { return '<details open><summary>' + esc(f.question) + '</summary><p>' + esc(f.answer) + '</p></details>'; }).join('') : '') +
      ((fm.relatedGuides || []).length ? '<h2>Related guides</h2><ul>' + fm.relatedGuides.map(function (r) { return '<li>' + esc(r.label) + ' <small>(' + esc(r.url) + ')</small></li>'; }).join('') + '</ul>' : '');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><main>' + html + '</main></body></html>';
  }
  function openPreview() {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box"><div class="hd"><b>Preview (approximate; the live page uses the full site design)</b><span class="dev"><button class="btn ghost sm" data-d="d">Desktop</button><button class="btn ghost sm" data-d="m">Mobile</button></span><button class="btn sm" id="pclose">Close</button></div><iframe sandbox="" title="Preview"></iframe></div>';
    document.body.appendChild(m);
    m.querySelector('iframe').srcdoc = previewHtml();
    m.querySelector('#pclose').onclick = function () { m.remove(); };
    m.addEventListener('click', function (e) { var d = e.target.getAttribute('data-d'); if (d) m.classList.toggle('mob', d === 'm'); });
  }

  /* ---------- save / publish ---------- */
  function finalize() {
    var fm = cur.fm;
    fm.tocEntries = tocFromBody(cur.body);
    fm.keywords = (fm.keywords || []).filter(Boolean);
    fm.faq = (fm.faq || []).filter(function (f) { return f.question && f.answer; });
    fm.relatedGuides = (fm.relatedGuides || []).filter(function (r) { return r.url && r.label; });
    if (!cur.published && !fm.datePublished) fm.datePublished = today();
    if (cur.published) fm.dateModified = today();
    fm.readTime = Math.max(1, Math.round(words(cur.body) / 200)) || fm.readTime || 5;
  }
  function saveDraft() {
    if (cur.published) { toast('This post is live. Use "Update live post".', true); return; }
    if (!cur.fm.canonicalSlug) { toast('Add a title first (the slug comes from it).', true); return; }
    finalize();
    var name = cur.kind === 'draft' ? cur.name : cur.fm.canonicalSlug + '.md';
    var path = 'drafts/' + name;
    var btn = document.getElementById('save'); btn.disabled = true;
    getFile(path, DRAFTS).then(function (g) {
      return putFile(path, DRAFTS, b64enc(serializePost(cur.fm, cur.body)), 'Save draft ' + name, g && g.sha);
    }).then(function (res) { cur.kind = 'draft'; cur.name = name; cur.sha = res.content.sha; toast('Draft saved'); document.getElementById('st').textContent = 'Draft saved'; })
      .catch(function (e) { if (e.status === 404 || e.status === 422) toast('Cannot save: the drafts branch does not exist yet. Write one blog with the Write button first.', true); else toast(e.message, true); })
      .then(function () { btn.disabled = false; });
  }
  function publish() {
    finalize();
    var C = seoChecks(cur.fm, cur.body), blockers = C.filter(function (c) { return c.block; });
    if (blockers.length) { alert('Fix these before publishing:\n\n- ' + blockers.map(function (b) { return b.label; }).join('\n- ')); return; }
    var fm = cur.fm, path = 'content/blog/' + fm.canonicalSlug + '.md';
    var btn = document.getElementById('pub'); btn.disabled = true;
    getFile(path, BRANCH).then(function (existing) {
      if (existing && !cur.published) { throw new Error('A live post already uses the slug "' + fm.canonicalSlug + '". Change the slug.'); }
      if (!window.confirm((cur.published ? 'Update the live post' : 'Publish this post') + ' on lmshandling.com now?\n\n' + fm.title)) { btn.disabled = false; return null; }
      var chain = Promise.resolve();
      if (cur.image) chain = chain.then(function () { return getFile('assets/blog-images/' + cur.image.name, BRANCH); }).then(function (img) { return putFile('assets/blog-images/' + cur.image.name, BRANCH, cur.image.b64, 'Blog image ' + cur.image.name, img && img.sha); });
      return chain.then(function () { return putFile(path, BRANCH, b64enc(serializePost(fm, cur.body)), (cur.published ? 'Update post: ' : 'Publish post: ') + fm.title, existing && existing.sha); })
        .then(function (res) {
          var after = Promise.resolve();
          if (cur.kind === 'draft') after = getFile('drafts/' + cur.name, DRAFTS).then(function (d) { return d ? delFile('drafts/' + cur.name, DRAFTS, d.sha, 'Published ' + fm.canonicalSlug) : null; }).catch(function () { /* draft cleanup is best effort */ });
          return after.then(function () { showDeploy(res.commit.sha, fm.canonicalSlug); });
        });
    }).catch(function (e) { toast(e.message, true); btn.disabled = false; });
  }
  function showDeploy(sha, slug) {
    var url = SITE + '/blog/' + slug;
    shell('<div class="wrap"><div class="card"><h2>Published. Deploying to the live site…</h2><p class="sub">Build and upload take about a minute.</p><div id="dp" class="alert info">Waiting for the deploy to start…</div>' +
      '<p><a class="btn ghost" href="#/">Back to dashboard</a></p></div></div>');
    var tries = 0;
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      tries++;
      gh('/repos/' + REPO + '/actions/runs?event=push&branch=' + encodeURIComponent(BRANCH) + '&per_page=10').then(function (d) {
        var run = ((d && d.workflow_runs) || []).filter(function (r) { return r.head_sha === sha; })[0];
        var box = document.getElementById('dp'); if (!box) return;
        if (!run) { if (tries > 10) { box.textContent = 'Deploy not detected. Check GitHub Actions.'; clearInterval(pollTimer); } return; }
        if (run.status !== 'completed') { box.textContent = 'Deploying… (' + run.status + ')'; return; }
        clearInterval(pollTimer);
        if (run.conclusion === 'success') { box.className = 'alert ok'; box.innerHTML = 'Live now: <a target="_blank" rel="noopener" href="' + esc(url) + '">' + esc(url) + '</a>'; }
        else { box.className = 'alert err'; box.innerHTML = 'Deploy failed. <a target="_blank" rel="noopener" href="' + esc(run.html_url) + '">Open the log</a>'; }
      }).catch(function () { /* keep polling */ });
    }, 6000);
  }

  /* ---------- router ---------- */
  function route() {
    clearInterval(pollTimer);
    if (!token) { renderLogin(); return; }
    var h = location.hash.replace(/^#/, '');
    var m = /^\/edit\/(draft|post):(.+)$/.exec(h);
    if (m) { loadForEdit(m[1], decodeURIComponent(m[2])).catch(function (e) { toast(e.message, true); location.hash = '#/'; }); return; }
    if (h === '/edit' && cur) { renderEditor(); return; }
    // verify the account can write before showing the dashboard
    gh('/repos/' + REPO).then(function (r) {
      if (!r.permissions || !r.permissions.push) { logout(); renderLogin('This GitHub account does not have write access to the site repository.'); return; }
      renderDashboard();
    }).catch(function (e) { renderLogin(e.message); });
  }
  window.addEventListener('hashchange', route);
  route();
})();
