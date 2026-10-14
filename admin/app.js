/* Blog Studio UI for lmshandling.com (screens only; helpers live in lib.js). */
(function () {
  'use strict';
  var L = window.L, esc = L.esc, icon = L.icon;
  var $app = document.getElementById('app');
  var me = null, data = null, loading = null, cur = null, poll = null, scoreTimer = null;
  var F = { q: '', cat: '', status: '', upd: '', show: 25 };
  var DEFAULTS = { autoUpdate: { enabled: true, staleDays: 90, perRun: 2 } };

  /* ======================= auth screens ======================= */
  function authShell(title, sub, form) {
    $app.innerHTML = '<div class="authwrap"><div class="authside"><img src="/assets/logo.png" alt="">' +
      '<h1>Blog Studio</h1><p>Write, update and publish every blog on lmshandling.com from one place.</p>' +
      '<ul><li>Keyword in, full SEO blog out</li><li>Auto-update keeps old posts fresh</li><li>See exactly which posts changed and when</li></ul></div>' +
      '<div class="authform"><div class="box"><h2>' + esc(title) + '</h2><p class="sub">' + esc(sub) + '</p>' + form + '</div></div></div>';
  }
  function renderLogin(msg) {
    clearInterval(poll); me = null; data = null;
    authShell('Welcome back', 'Sign in with your Blog Studio username.',
      (msg ? '<div class="alert err">' + esc(msg) + '</div>' : '') +
      '<form id="lf"><label class="f">Username</label><input type="text" id="lu" autocomplete="username" autocapitalize="none" autofocus>' +
      '<label class="f">Password</label><input type="password" id="lp" autocomplete="current-password">' +
      '<div id="lerr"></div><button class="btn" type="submit" id="lgo">Sign in</button></form>');
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var b = document.getElementById('lgo'); b.disabled = true; b.textContent = 'Signing in…';
      L.api('/login', { method: 'POST', body: { username: document.getElementById('lu').value, password: document.getElementById('lp').value }, noAuthRedirect: true })
        .then(function (r) { me = r.user; start(); })
        .catch(function (er) { b.disabled = false; b.textContent = 'Sign in'; document.getElementById('lerr').innerHTML = '<div class="alert err">' + esc(er.message) + '</div>'; });
    };
  }
  function connectGitHub(done) {
    var popup = window.open('/auth', 'lmh-oauth', 'width=620,height=760');
    if (!popup) { L.toast('Allow pop-ups for this site, then try again.', true); return; }
    function onMsg(e) {
      if (e.origin !== location.origin) return;
      if (e.data === 'studio-ready') { e.source.postMessage('go', e.origin); return; }
      if (typeof e.data === 'string' && e.data.indexOf('studio-grant:') === 0) {
        window.removeEventListener('message', onMsg);
        try { done(JSON.parse(e.data.slice('studio-grant:'.length)).grant); } catch (err) { L.toast('GitHub connection failed', true); }
      }
    }
    window.addEventListener('message', onMsg);
  }
  function renderSetup() {
    var grant = null;
    authShell('Set up Blog Studio', 'One-time setup. Connect GitHub, then choose your admin username and password.',
      '<div class="alert info">Step 1: connect the GitHub account that owns the site repository. You only do this once; after that nobody needs GitHub to sign in.</div>' +
      '<button class="btn ghost" id="gh" type="button" style="margin-top:.2rem">Connect GitHub</button><div id="ghok"></div>' +
      '<form id="sf" style="display:none"><label class="f">Admin username</label><input type="text" id="su" autocomplete="username" autocapitalize="none" placeholder="e.g. muneeb">' +
      '<label class="f">Password <small>(8+ characters)</small></label><input type="password" id="sp" autocomplete="new-password">' +
      '<label class="f">Repeat password</label><input type="password" id="sp2" autocomplete="new-password"><div id="serr"></div>' +
      '<button class="btn" type="submit" id="sgo">Create admin account</button></form>');
    document.getElementById('gh').onclick = function () {
      connectGitHub(function (g) {
        grant = g;
        document.getElementById('gh').style.display = 'none';
        document.getElementById('ghok').innerHTML = '<div class="alert ok">GitHub connected. Now create your admin account.</div>';
        document.getElementById('sf').style.display = 'block';
      });
    };
    document.getElementById('sf').onsubmit = function (e) {
      e.preventDefault();
      var p = document.getElementById('sp').value, p2 = document.getElementById('sp2').value, err = document.getElementById('serr');
      if (p !== p2) { err.innerHTML = '<div class="alert err">Passwords do not match.</div>'; return; }
      var b = document.getElementById('sgo'); b.disabled = true;
      L.api('/setup', { method: 'POST', body: { grant: grant, username: document.getElementById('su').value, password: p }, noAuthRedirect: true })
        .then(function (r) { me = r.user; start(); })
        .catch(function (er) { b.disabled = false; err.innerHTML = '<div class="alert err">' + esc(er.message) + '</div>'; });
    };
  }
  function boot() {
    L.api('/state', { noAuthRedirect: true }).then(function (s) {
      if (s.setup) return renderSetup();
      if (!s.user) return renderLogin();
      me = s.user; start();
    }).catch(function (e) { $app.innerHTML = '<p class="boot">Could not reach the Blog Studio server (' + esc(e.message) + '). <a href="">Retry</a></p>'; });
  }
  window.addEventListener('studio:unauth', function () { if (me) renderLogin('Your session ended. Please sign in again.'); });

  /* ======================= shell ======================= */
  var NAV = [
    ['Main', [['dash', '#/', 'home', 'Dashboard'], ['posts', '#/posts', 'file', 'All Posts'], ['new', '#/new', 'pen', 'Write New']]],
    ['Content', [['review', '#/review', 'inbox', 'Drafts & Review'], ['cats', '#/categories', 'folder', 'Categories'], ['tags', '#/tags', 'tag', 'Tags']]],
    ['Manage', [['activity', '#/activity', 'activity', 'Activity'], ['settings', '#/settings', 'users', 'Settings']]]
  ];
  function ensureShell() {
    if (document.getElementById('shell')) return;
    $app.innerHTML = '<div class="shell" id="shell"><aside class="side"><div class="brand"><img src="/assets/logo.png" alt=""><div><b>Nibaha Haq</b><span>Blog Studio</span></div></div>' +
      '<nav class="nav" id="nav"></nav><div class="me"><div class="av">' + esc(me.name.charAt(0)) + '</div><div><b>' + esc(me.name) + '</b><small>' + esc(me.role) + '</small></div>' +
      '<button id="out" title="Sign out">' + icon('logout') + '</button></div></aside><div class="scrim" id="scrim"></div>' +
      '<div class="main"><div class="topbar"><button class="burger" id="burger" aria-label="Menu">' + icon('menu') + '</button><div class="crumb" id="crumb"></div><div class="sp"></div>' +
      '<a class="btn ghost sm" href="' + L.SITE + '/blog/" target="_blank" rel="noopener">' + icon('ext') + ' View site</a></div><div class="content" id="content"></div></div></div>';
    document.getElementById('out').onclick = function () { L.api('/logout', { method: 'POST' }).then(function () { renderLogin(); }); };
    document.getElementById('burger').onclick = function () { document.getElementById('shell').classList.toggle('open'); };
    document.getElementById('scrim').onclick = function () { document.getElementById('shell').classList.remove('open'); };
  }
  function drawNav(active) {
    var pend = data ? data.proposals.length + data.drafts.length : 0;
    document.getElementById('nav').innerHTML = NAV.map(function (sec) {
      return '<h6>' + sec[0] + '</h6>' + sec[1].filter(function (i) { return i[0] !== 'settings' || true; }).map(function (i) {
        return '<a href="' + i[1] + '" class="' + (i[0] === active ? 'on' : '') + '">' + icon(i[2]) + '<span>' + i[3] + '</span>' + (i[0] === 'review' && pend ? '<span class="badge">' + pend + '</span>' : '') + '</a>';
      }).join('');
    }).join('');
    document.getElementById('nav').onclick = function () { document.getElementById('shell').classList.remove('open'); };
  }
  function page(active, crumb, html) {
    ensureShell(); drawNav(active);
    document.getElementById('crumb').innerHTML = crumb;
    var c = document.getElementById('content'); c.innerHTML = html; window.scrollTo(0, 0);
    return c;
  }
  function loadingPage(active, crumb) { return page(active, crumb, '<p class="empty">Loading…</p>'); }
  function head(title, sub, right) { return '<div class="ph"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="sp"></div>' + (right || '') + '</div>'; }
  function crumb(t) { return 'Blog Studio / <b>' + esc(t) + '</b>'; }

  /* ======================= data ======================= */
  function commitsFor(path) {
    return L.gh('repos/' + L.REPO + '/commits?sha=' + encodeURIComponent(L.BRANCH) + '&path=' + encodeURIComponent(path) + '&per_page=60').catch(function () { return []; });
  }
  function loadData(force) {
    if (data && !force) return Promise.resolve(data);
    if (loading) return loading;
    loading = Promise.all([
      L.listDir('content/blog', L.BRANCH), L.getFile('_data/existingPosts.json', L.BRANCH), L.listDir('drafts', L.DRAFTS),
      L.listDir('drafts/refresh', L.DRAFTS), commitsFor('content/blog'), commitsFor('blog'), L.getFile('.github/cms-settings.json', L.BRANCH),
      L.gh('repos/' + L.REPO + '/actions/runs?per_page=25').catch(function () { return { workflow_runs: [] }; })
    ]).then(function (r) {
      var mdFiles = r[0].filter(function (f) { return /\.md$/.test(f.name); });
      var legacy = []; try { legacy = JSON.parse(r[1].text); } catch (e) { /* ignore */ }
      var draftFiles = r[2].filter(function (f) { return /\.md$/.test(f.name); });
      var proposals = r[3].filter(function (f) { return /\.(md|html)$/.test(f.name); }).map(function (f) { return { name: f.name, slug: f.name.replace(/\.(md|html)$/, ''), ext: f.name.split('.').pop() }; });
      var settings = DEFAULTS; try { settings = Object.assign({}, DEFAULTS, JSON.parse(r[6].text)); settings.autoUpdate = Object.assign({}, DEFAULTS.autoUpdate, settings.autoUpdate); } catch (e) { /* defaults */ }
      var seen = {}, commits = [];
      r[4].concat(r[5]).forEach(function (c) { if (!seen[c.sha] && c.parents && c.parents.length < 2) { seen[c.sha] = 1; commits.push(L.parseCommit(c)); } });
      commits.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var last = {}; commits.forEach(function (c) { if (c.slug && !last[c.slug]) last[c.slug] = c; });
      var runs = (r[7].workflow_runs || []).filter(function (x) { return /Write blog|Refresh blogs/.test(x.name || ''); });
      return Promise.all([
        L.pool(mdFiles, 6, function (f) {
          return L.getFile('content/blog/' + f.name, L.BRANCH).then(function (g) {
            var p = L.parsePost(g.text), fm = p.fm;
            return { kind: 'md', file: f.name, slug: fm.canonicalSlug || f.name.replace(/\.md$/, ''), title: fm.title || f.name, category: fm.category, tags: fm.tags || [], published: fm.datePublished, modified: fm.dateModified, words: L.words(p.body), status: 'Published' };
          }).catch(function () { return null; });
        }),
        L.pool(draftFiles, 6, function (f) {
          return L.getFile('drafts/' + f.name, L.DRAFTS).then(function (g) {
            var fm = L.parsePost(g.text).fm;
            return { kind: 'draft', file: f.name, slug: fm.canonicalSlug || f.name.replace(/\.md$/, ''), title: fm.title || f.name, category: fm.category, tags: fm.tags || [], published: fm.datePublished, modified: fm.dateModified, status: 'Draft' };
          }).catch(function () { return null; });
        })
      ]).then(function (x) {
        var md = x[0].filter(Boolean), drafts = x[1].filter(Boolean), mdSlugs = {};
        md.forEach(function (p) { mdSlugs[p.slug] = 1; });
        var leg = legacy.filter(function (p) { return !mdSlugs[p.slug]; }).map(function (p) {
          return { kind: 'legacy', slug: p.slug, title: p.cardTitle || p.title || p.slug, category: p.category, tags: [], published: p.datePublished, modified: p.dateModified, status: 'Legacy' };
        });
        var posts = md.concat(leg); posts.forEach(function (p) { var c = last[p.slug]; p.source = c ? c.source : null; p.lastBy = c ? c.by : ''; });
        var bySlug = {}; posts.forEach(function (p) { bySlug[p.slug] = p; });
        proposals.forEach(function (p) { p.title = (bySlug[p.slug] || {}).title || p.slug; });
        data = { posts: posts, drafts: drafts, proposals: proposals, commits: commits, runs: runs, settings: settings, bySlug: bySlug, settingsSha: r[6] ? r[6].sha : null, loadedAt: Date.now() };
        loading = null; return data;
      });
    }).catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function tagIndex() {
    var t = {}; data.posts.forEach(function (p) { (p.tags || []).forEach(function (x) { (t[x] = t[x] || []).push(p); }); }); return t;
  }
  function srcBadge(p) { return p.source === 'auto' ? '<span class="pill gold">Auto</span>' : (p.source === 'manual' ? '<span class="pill grey">Manual</span>' : ''); }
  function errPage(active, e) { page(active, crumb('Error'), '<div class="alert err">' + esc(e.message) + '</div><button class="btn" id="rt">Retry</button>'); document.getElementById('rt').onclick = function () { data = null; route(); }; }

  /* ======================= auto-update ======================= */
  function autoUpdate(slugs) {
    if (!slugs.length) return;
    if (slugs.length > 5) { L.toast('Pick at most 5 posts at a time.', true); return; }
    var names = slugs.map(function (s) { return (data.bySlug[s] || {}).title || s; });
    if (!window.confirm('Ask Claude to refresh ' + slugs.length + ' post(s)?\n\n- ' + names.join('\n- ') + '\n\nNothing goes live. You will review each update first.')) return;
    L.dispatch('refresh-blog.yml', { slugs: slugs.join(','), requested_by: me.name }).then(function () {
      L.toast('Auto-update started. Check Drafts & Review in about 5 minutes.');
    }).catch(function (e) { L.toast(e.message, true); });
  }

  /* ======================= dashboard ======================= */
  function pageDash() {
    loadingPage('dash', crumb('Dashboard'));
    loadData().then(function () {
      var s = data.settings.autoUpdate, live = data.posts.length;
      var upd30 = data.posts.filter(function (p) { return L.daysSince(p.modified) <= 30; }).length;
      var stale = data.posts.filter(function (p) { return L.daysSince(p.modified) > s.staleDays; }).sort(function (a, b) { return String(a.modified) > String(b.modified) ? 1 : -1; });
      var pend = data.proposals.length + data.drafts.length;
      var feed = data.commits.slice(0, 7).map(feedItem).join('') || '<li class="empty">No activity yet.</li>';
      var html = head('Hello, ' + me.name, 'Here is what is happening on lmshandling.com', '<a class="btn" href="#/new">' + icon('plus') + ' New post</a>') +
        '<div class="grid4">' +
        stat('file', '', live, 'Live posts') + stat('inbox', 'y', pend, 'Drafts & updates to review') +
        stat('check', 'g', upd30, 'Updated in last 30 days') + stat('clock', stale.length ? 'r' : 'g', stale.length, 'Need a refresh (' + s.staleDays + '+ days)') + '</div>' +
        '<div class="cols"><div>' +
        '<div class="card flush"><div class="hd"><h2>Needs a refresh</h2><a class="btn ghost sm" href="#/posts">All posts</a></div>' +
        (stale.length ? '<div class="tw"><table class="t"><tbody>' + stale.slice(0, 6).map(function (p) {
          return '<tr><td class="ti"><b>' + esc(p.title) + '</b><small>' + esc(L.catLabel(p.category)) + ' · last updated ' + esc(L.fmtDate(p.modified)) + ' (' + esc(L.rel(p.modified)) + ')</small></td><td class="act"><button class="btn sm" data-au="' + esc(p.slug) + '">' + icon('refresh') + ' Auto-update</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Every post was updated within ' + s.staleDays + ' days. 🎉</p>') + '</div>' +
        '<div class="card flush"><div class="hd"><h2>Recent activity</h2><a class="btn ghost sm" href="#/activity">See all</a></div><ul class="feed">' + feed + '</ul></div></div>' +
        '<div>' + writeCard() + '<div class="card"><h2>Auto-update</h2><p class="sub">' + (s.enabled ? 'Every Monday Claude refreshes up to ' + s.perRun + ' post(s) older than ' + s.staleDays + ' days and leaves them for your review.' : 'Weekly auto-update is off.') + '</p>' +
        '<a class="btn ghost sm" href="#/settings">Change settings</a> ' + (pend ? '<a class="btn gold sm" href="#/review">Review ' + pend + '</a>' : '') + '</div></div></div>';
      var c = page('dash', crumb('Dashboard'), html);
      c.onclick = function (e) { var a = e.target.closest('[data-au]'); if (a) autoUpdate([a.getAttribute('data-au')]); };
      wireWrite(c);
    }).catch(function (e) { errPage('dash', e); });
  }
  function stat(ic, cls, n, label) { return '<div class="stat"><div class="ic ' + cls + '">' + icon(ic) + '</div><div><b>' + n + '</b><span>' + esc(label) + '</span></div></div>'; }
  function feedItem(c) {
    return '<li><div class="dot ' + (c.source === 'auto' ? 'auto' : '') + '">' + icon(c.source === 'auto' ? 'refresh' : 'edit') + '</div><div><b>' + esc(c.title) + '</b><small>' +
      (c.known ? esc(c.kind === 'Publish' ? 'Published' : 'Updated') + ' · ' + (c.source === 'auto' ? 'Auto-update (Claude), approved by ' : 'by ') + esc(c.by) : 'Site change by ' + esc(c.by)) + ' · ' + esc(L.rel(c.date)) + '</small></div></li>';
  }

  /* ======================= write ======================= */
  var STEPS = ['Request sent', 'Waiting for a runner', 'Claude is researching and writing', 'Checking SEO rules', 'Draft ready'];
  function writeCard() {
    return '<div class="card write"><h2>Write a new blog</h2><p class="sub">Type a keyword. Claude researches and writes the full SEO post, then you preview and publish.</p>' +
      '<label class="f">Keyword / topic</label><input type="text" id="kw" placeholder="e.g. VU GDB schedule and marking">' +
      '<div class="row"><div><label class="f">Category</label><select id="cat"><option value="auto">Auto-pick</option>' + L.CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="f">Extra instructions <small>(optional)</small></label><textarea id="notes" rows="2" placeholder="e.g. target Spring 2026 students"></textarea>' +
      '<div style="margin-top:1rem"><button class="btn gold" id="write">' + icon('pen') + ' Write blog</button> <button class="btn ghost" id="blank">Start blank</button></div><div id="prog"></div></div>';
  }
  function wireWrite(c) {
    var q = (location.hash.split('?')[1] || '').match(/kw=([^&]*)/); if (q) document.getElementById('kw').value = decodeURIComponent(q[1]);
    document.getElementById('write').onclick = startWrite;
    document.getElementById('blank').onclick = function () { cur = { kind: 'new', fm: L.blankPost(), body: '', image: null }; location.hash = '#/edit'; };
    var pending = null; try { pending = JSON.parse(localStorage.getItem('lmh_pending') || 'null'); } catch (e) { /* ignore */ }
    if (pending && Date.now() - pending.t < 25 * 60000) watchRun(pending);
  }
  function drawProgress(step, failed, link) {
    var box = document.getElementById('prog'); if (!box) return;
    box.innerHTML = '<ul class="steps">' + STEPS.map(function (s, i) {
      var cls = failed && i === step ? 'fail' : (i < step ? 'done' : (i === step ? 'on' : ''));
      return '<li class="' + cls + '"><span class="d">' + (cls === 'done' ? '✓' : (cls === 'fail' ? '!' : i + 1)) + '</span>' + esc(s) + '</li>';
    }).join('') + '</ul>' + (link ? '<p class="hint" style="color:#c9dbf3"><a style="color:#fff" target="_blank" rel="noopener" href="' + esc(link) + '">View run log</a></p>' : '');
  }
  function startWrite() {
    var kw = document.getElementById('kw').value.trim();
    if (kw.length < 4) { L.toast('Enter a keyword first', true); return; }
    var id = 'r' + Date.now().toString(36), btn = document.getElementById('write'); btn.disabled = true; drawProgress(0);
    L.dispatch('write-blog.yml', { request_id: id, keyword: kw, category: document.getElementById('cat').value, notes: document.getElementById('notes').value.trim() }).then(function () {
      var p = { id: id, t: Date.now(), kw: kw }; try { localStorage.setItem('lmh_pending', JSON.stringify(p)); } catch (e) { /* ignore */ }
      watchRun(p);
    }).catch(function (e) {
      btn.disabled = false; document.getElementById('prog').innerHTML = '<div class="alert err">Could not start the writer: ' + esc(e.message) + '</div>';
    });
  }
  function clearPending() { try { localStorage.removeItem('lmh_pending'); } catch (e) { /* ignore */ } }
  function watchRun(p) {
    clearInterval(poll);
    var btn = document.getElementById('write'); if (btn) btn.disabled = true; drawProgress(1);
    var tries = 0;
    function fail(m) { clearInterval(poll); clearPending(); drawProgress(1, true); L.toast(m, true); var b = document.getElementById('write'); if (b) b.disabled = false; }
    function finish() {
      var n = 0;
      (function open() {
        L.getFile('drafts/' + p.id + '.md', L.DRAFTS).then(function (g) {
          if (!g && n++ < 6) { setTimeout(open, 2500); return; }
          clearPending(); data = null;
          if (!g) { L.toast('Draft not found yet. Open Drafts & Review.', true); location.hash = '#/review'; return; }
          location.hash = '#/edit/draft:' + p.id + '.md';
        }).catch(function (e) { L.toast(e.message, true); });
      })();
    }
    function tick() {
      tries++;
      L.gh('repos/' + L.REPO + '/actions/runs?event=workflow_dispatch&per_page=15').then(function (d) {
        var run = ((d && d.workflow_runs) || []).filter(function (r) { return r.display_title === 'Write blog ' + p.id; })[0];
        if (!run) { if (tries > 12) fail('The run never started. Check Actions on GitHub.'); return; }
        if (run.status === 'queued') drawProgress(1, false, run.html_url);
        else if (run.status === 'in_progress') drawProgress(2, false, run.html_url);
        else if (run.status === 'completed') {
          clearInterval(poll);
          if (run.conclusion === 'success') { drawProgress(4, false, run.html_url); finish(); }
          else { drawProgress(2, true, run.html_url); clearPending(); var b = document.getElementById('write'); if (b) b.disabled = false; L.toast('Writing failed. Open the run log.', true); }
        }
        if (Date.now() - p.t > 25 * 60000) fail('Timed out after 25 minutes.');
      }).catch(function (e) { L.toast(e.message, true); });
    }
    poll = setInterval(tick, 6000); tick();
  }
  function pageNew() {
    var c = page('new', crumb('Write New'), head('Write New', 'Let Claude write from a keyword, or start from a blank page.') + writeCard());
    wireWrite(c);
  }

  /* ======================= all posts ======================= */
  function allRows() {
    var rows = data.posts.concat(data.drafts.map(function (d) { return d; }));
    var prop = {}; data.proposals.forEach(function (p) { prop[p.slug] = 1; });
    rows.forEach(function (r) { r.hasProposal = !!prop[r.slug]; });
    return rows;
  }
  function filtered() {
    return allRows().filter(function (p) {
      if (F.q && (p.title + ' ' + p.slug).toLowerCase().indexOf(F.q.toLowerCase()) < 0) return false;
      if (F.cat && p.category !== F.cat) return false;
      if (F.status && p.status !== F.status) return false;
      var d = L.daysSince(p.modified), s = data.settings.autoUpdate.staleDays;
      if (F.upd === '7' && d > 7) return false;
      if (F.upd === '30' && d > 30) return false;
      if (F.upd === 'stale' && d <= s) return false;
      if (F.upd === 'auto' && p.source !== 'auto') return false;
      if (F.upd === 'manual' && p.source !== 'manual') return false;
      return true;
    }).sort(function (a, b) { return String(b.modified || '') > String(a.modified || '') ? 1 : -1; });
  }
  function pageRows() {
    var rows = filtered(), show = rows.slice(0, F.show);
    var body = show.map(function (p) {
      var live = p.kind !== 'draft', stale = live && L.daysSince(p.modified) > data.settings.autoUpdate.staleDays;
      return '<tr><td style="width:30px">' + (live ? '<input type="checkbox" data-pick="' + esc(p.slug) + '">' : '') + '</td>' +
        '<td class="ti"><b>' + esc(p.title) + '</b><small>/blog/' + esc(p.slug) + '</small></td><td>' + esc(L.catLabel(p.category)) + '</td>' +
        '<td><span class="pill ' + (p.status === 'Draft' ? 'warn' : (p.status === 'Published' ? 'ok' : 'grey')) + '">' + p.status + '</span>' + (p.hasProposal ? ' <a href="#/review/' + esc(p.slug) + '" class="pill gold" style="text-decoration:none">Update ready</a>' : '') + '</td>' +
        '<td>' + esc(L.fmtDate(p.modified)) + ' <small style="color:var(--mute)">' + esc(L.rel(p.modified)) + '</small> ' + (stale ? '<span class="pill bad">Stale</span> ' : '') + srcBadge(p) + '</td>' +
        '<td class="act">' + (live ? '<a class="iconbtn" title="Open live page" href="' + L.SITE + '/blog/' + esc(p.slug) + '" target="_blank" rel="noopener">' + icon('ext') + '</a>' : '') +
        (p.kind === 'md' ? '<a class="btn ghost sm" href="#/edit/post:' + esc(encodeURIComponent(p.file)) + '">' + icon('edit') + ' Edit</a>' : '') +
        (p.kind === 'draft' ? '<a class="btn ghost sm" href="#/edit/draft:' + esc(encodeURIComponent(p.file)) + '">' + icon('edit') + ' Edit</a>' : '') +
        (live ? '<button class="btn sm" data-au="' + esc(p.slug) + '">' + icon('refresh') + ' Auto-update</button>' : '') + '</td></tr>';
    }).join('');
    return { total: rows.length, html: body || '<tr><td colspan="6" class="empty">No posts match.</td></tr>', more: rows.length > show.length };
  }
  function pagePosts() {
    loadingPage('posts', crumb('All Posts'));
    loadData().then(function () {
      var html = head('All Posts', '<span id="cnt"></span>', '<button class="btn ghost" id="reload">' + icon('refresh') + ' Reload</button> <a class="btn" href="#/new">' + icon('plus') + ' New post</a>') +
        '<div class="card flush"><div class="filters"><input type="text" id="fq" placeholder="Search title or slug…" value="' + esc(F.q) + '">' +
        '<select id="fc"><option value="">All categories</option>' + L.CATS.map(function (c) { return '<option value="' + c[0] + '"' + (F.cat === c[0] ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>' +
        '<select id="fs"><option value="">All status</option>' + ['Published', 'Legacy', 'Draft'].map(function (s) { return '<option' + (F.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<select id="fu"><option value="">Any update date</option>' + [['7', 'Updated last 7 days'], ['30', 'Updated last 30 days'], ['stale', 'Stale (needs refresh)'], ['auto', 'Last update: Auto'], ['manual', 'Last update: Manual']].map(function (o) { return '<option value="' + o[0] + '"' + (F.upd === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<div id="bulk" style="display:none;padding:.7rem 1.2rem;background:var(--gold-soft);border-bottom:1px solid var(--line)"><b id="bn"></b> selected <button class="btn sm" id="bgo">' + icon('refresh') + ' Auto-update selected</button></div>' +
        '<div class="tw"><table class="t"><thead><tr><th></th><th>Title</th><th>Category</th><th>Status</th><th>Last updated</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="more" style="padding:1rem;text-align:center"></div></div>';
      var c = page('posts', crumb('All Posts'), html);
      function draw() {
        var r = pageRows(); document.getElementById('rows').innerHTML = r.html;
        document.getElementById('cnt').textContent = r.total + ' post(s)';
        document.getElementById('more').innerHTML = r.more ? '<button class="btn ghost" id="mb">Show more</button>' : '';
        if (r.more) document.getElementById('mb').onclick = function () { F.show += 25; draw(); };
        bulk();
      }
      function picked() { return Array.prototype.map.call(c.querySelectorAll('[data-pick]:checked'), function (x) { return x.getAttribute('data-pick'); }); }
      function bulk() { var n = picked().length; document.getElementById('bulk').style.display = n ? 'block' : 'none'; document.getElementById('bn').textContent = n; }
      document.getElementById('fq').oninput = function () { F.q = this.value; F.show = 25; draw(); };
      document.getElementById('fc').onchange = function () { F.cat = this.value; F.show = 25; draw(); };
      document.getElementById('fs').onchange = function () { F.status = this.value; F.show = 25; draw(); };
      document.getElementById('fu').onchange = function () { F.upd = this.value; F.show = 25; draw(); };
      document.getElementById('reload').onclick = function () { data = null; pagePosts(); };
      document.getElementById('bgo').onclick = function () { autoUpdate(picked()); };
      c.onclick = function (e) { var a = e.target.closest('[data-au]'); if (a) autoUpdate([a.getAttribute('data-au')]); };
      c.onchange = function (e) { if (e.target.hasAttribute('data-pick')) bulk(); };
      draw();
    }).catch(function (e) { errPage('posts', e); });
  }

  /* ======================= drafts & review ======================= */
  function pageReview() {
    loadingPage('review', crumb('Drafts & Review'));
    loadData(true).then(function () {
      var html = head('Drafts & Review', 'Nothing here is live. Review it, then publish.') +
        '<div class="card flush"><div class="hd"><h2>Auto-updates waiting for your review</h2></div>' +
        (data.proposals.length ? '<div class="tw"><table class="t"><tbody>' + data.proposals.map(function (p) {
          return '<tr><td class="ti"><b>' + esc(p.title) + '</b><small>/blog/' + esc(p.slug) + ' · ' + (p.ext === 'html' ? 'legacy page' : 'markdown post') + '</small></td><td class="act"><a class="btn gold sm" href="#/review/' + esc(p.slug) + '">Review changes</a></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No updates waiting. Use <b>Auto-update</b> on any post to ask Claude for a refresh.</p>') + '</div>' +
        '<div class="card flush"><div class="hd"><h2>New post drafts</h2></div>' +
        (data.drafts.length ? '<div class="tw"><table class="t"><tbody>' + data.drafts.map(function (d) {
          return '<tr><td class="ti"><b>' + esc(d.title) + '</b><small>' + esc(L.catLabel(d.category)) + ' · ' + esc(L.fmtDate(d.modified)) + '</small></td><td class="act"><a class="btn ghost sm" href="#/edit/draft:' + esc(encodeURIComponent(d.file)) + '">' + icon('edit') + ' Edit</a><button class="btn danger sm" data-del="' + esc(d.file) + '">' + icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No drafts. <a href="#/new">Write a new post</a>.</p>') + '</div>';
      var c = page('review', crumb('Drafts & Review'), html);
      c.onclick = function (e) {
        var d = e.target.closest('[data-del]'); if (!d) return;
        var f = d.getAttribute('data-del');
        if (!window.confirm('Delete this draft permanently?')) return;
        L.getFile('drafts/' + f, L.DRAFTS).then(function (g) { return L.delFile('drafts/' + f, L.DRAFTS, g.sha, 'Delete draft ' + f); })
          .then(function () { L.toast('Draft deleted'); data = null; pageReview(); }).catch(function (er) { L.toast(er.message, true); });
      };
    }).catch(function (e) { errPage('review', e); });
  }

  function pageReviewItem(slug) {
    loadingPage('review', crumb('Review update'));
    loadData().then(function () {
      var prop = data.proposals.filter(function (p) { return p.slug === slug; })[0];
      if (!prop) { L.toast('That update is no longer waiting.', true); location.hash = '#/review'; return; }
      var isHtml = prop.ext === 'html';
      var livePath = isHtml ? 'blog/' + slug + '.html' : 'content/blog/' + slug + '.md';
      return Promise.all([L.getFile(livePath, L.BRANCH), L.getFile('drafts/refresh/' + prop.name, L.DRAFTS)]).then(function (r) {
        var live = r[0], draft = r[1];
        if (!live || !draft) throw new Error('Could not load both versions.');
        var liveBlocks, newBlocks, metaRows = [], draftHtml;
        if (isHtml) {
          liveBlocks = L.textBlocks(live.text); newBlocks = L.textBlocks(draft.text); draftHtml = draft.text;
          var pick = function (t, re) { var m = re.exec(t); return m ? m[1] : ''; };
          [['Title', /<title>([^<]*)/i], ['Description', /<meta name="description" content="([^"]*)/i]].forEach(function (x) { var a = pick(live.text, x[1]), b = pick(draft.text, x[1]); if (a !== b) metaRows.push([x[0], a, b]); });
        } else {
          var lp = L.parsePost(live.text), dp = L.parsePost(draft.text);
          var faqText = function (fm) { return (fm.faq || []).map(function (f) { return 'FAQ: ' + f.question + ' ' + f.answer; }); };
          liveBlocks = L.textBlocks(window.marked.parse(lp.body)).concat(faqText(lp.fm)); newBlocks = L.textBlocks(window.marked.parse(dp.body)).concat(faqText(dp.fm));
          ['title', 'metaDescription', 'quickAnswer', 'leadParagraph'].forEach(function (k) { if (lp.fm[k] !== dp.fm[k]) metaRows.push([k, lp.fm[k], dp.fm[k]]); });
          draftHtml = previewHtml(dp.fm, dp.body);
        }
        var ops = L.diffBlocks(liveBlocks, newBlocks), add = ops.filter(function (o) { return o.t === 'add'; }).length, del = ops.filter(function (o) { return o.t === 'del'; }).length;
        // collapse long unchanged runs
        var out = [], run = [];
        function flush() { if (run.length > 4) { out.push({ t: 'gap', s: '… ' + (run.length - 2) + ' unchanged paragraphs …' }); out.splice(out.length - 1, 0, run[0]); out.push(run[run.length - 1]); } else { run.forEach(function (x) { out.push(x); }); } run = []; }
        ops.forEach(function (o) { if (o.t === 'same') run.push(o); else { flush(); out.push(o); } }); flush();
        var html = head('Review: ' + (data.bySlug[slug] || {}).title, 'Claude refreshed this post. Check the changes, then approve or discard.', '<a class="btn ghost" href="#/review">Back</a>') +
          '<div class="alert info"><b>' + add + '</b> paragraph(s) added or changed, <b>' + del + '</b> removed. The live page does not change until you press <b>Approve & publish</b>.</div>' +
          (metaRows.length ? '<div class="card"><h2>SEO fields that changed</h2>' + metaRows.map(function (m) { return '<p style="margin:.5rem 0"><b>' + esc(m[0]) + '</b><br><span class="diff"><div class="del">' + esc(m[1]) + '</div><div class="add">' + esc(m[2]) + '</div></span></p>'; }).join('') + '</div>' : '') +
          '<div class="card flush"><div class="hd"><h2>Content changes</h2></div><div class="diff">' + out.map(function (o) { return '<div class="' + o.t + '">' + esc(o.s) + '</div>'; }).join('') + '</div></div>' +
          '<div class="bar"><span class="st">Live page: ' + L.SITE + '/blog/' + esc(slug) + '</span><button class="btn danger" id="disc">Discard</button><button class="btn ghost" id="prev">Preview new version</button><button class="btn gold" id="ok">' + icon('check') + ' Approve & publish</button></div>';
        page('review', crumb('Review update'), html);
        document.getElementById('prev').onclick = function () { openModal('Preview of the updated page', draftHtml); };
        document.getElementById('disc').onclick = function () {
          if (!window.confirm('Discard this update? The live post stays as it is.')) return;
          L.delFile('drafts/refresh/' + prop.name, L.DRAFTS, draft.sha, 'Discard update ' + slug).then(function () { data = null; L.toast('Update discarded'); location.hash = '#/review'; }).catch(function (e) { L.toast(e.message, true); });
        };
        document.getElementById('ok').onclick = function () {
          var title = (data.bySlug[slug] || {}).title || slug;
          if (!window.confirm('Publish this update to lmshandling.com now?\n\n' + title)) return;
          var text = draft.text;
          if (!isHtml) { var q = L.parsePost(draft.text); delete q.fm.updateOf; q.fm.dateModified = L.today(); text = L.serializePost(q.fm, q.body); }
          this.disabled = true;
          L.putFile(livePath, L.BRANCH, L.b64enc(text), L.commitMsg('auto', 'Update', title, slug, me.name, 'approved by'), live.sha).then(function (res) {
            return L.delFile('drafts/refresh/' + prop.name, L.DRAFTS, draft.sha, 'Published update ' + slug).catch(function () { /* best effort */ }).then(function () { data = null; showDeploy(res.commit.sha, slug); });
          }).catch(function (e) { L.toast(e.message, true); });
        };
      });
    }).catch(function (e) { errPage('review', e); });
  }

  /* ======================= categories & tags ======================= */
  function pageCats() {
    loadingPage('cats', crumb('Categories'));
    loadData().then(function () {
      var rows = L.CATS.map(function (c) {
        var ps = data.posts.filter(function (p) { return p.category === c[0]; }), last = ps.map(function (p) { return p.modified; }).sort().pop();
        return '<tr><td class="ti"><b>' + esc(c[1]) + '</b><small>/blog/category/' + c[0] + '</small></td><td><span class="pill">' + ps.length + ' posts</span></td><td>' + esc(L.fmtDate(last)) + '</td>' +
          '<td class="act"><a class="iconbtn" target="_blank" rel="noopener" title="Open category page" href="' + L.SITE + '/blog/category/' + c[0] + '">' + icon('ext') + '</a> <a class="btn ghost sm" href="#/posts" data-cat="' + c[0] + '">View posts</a></td></tr>';
      }).join('');
      var c = page('cats', crumb('Categories'), head('Categories', 'The blog sections visitors browse. Each has its own page on the site.') +
        '<div class="card flush"><div class="tw"><table class="t"><thead><tr><th>Category</th><th>Posts</th><th>Last updated</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
        '<div class="alert info">Adding a brand new category needs a new page design on the website, so it is not a button yet. Ask Claude in your terminal session to add one and it will appear here.</div>');
      c.onclick = function (e) { var a = e.target.closest('[data-cat]'); if (a) { F.cat = a.getAttribute('data-cat'); F.q = ''; F.status = ''; F.upd = ''; } };
    }).catch(function (e) { errPage('cats', e); });
  }
  function pageTags() {
    loadingPage('tags', crumb('Tags'));
    loadData().then(function () {
      var idx = tagIndex(), names = Object.keys(idx).sort(function (a, b) { return idx[b].length - idx[a].length || a.localeCompare(b); });
      var c = page('tags', crumb('Tags'), head('Tags', names.length + ' tag(s) on posts made in Blog Studio') +
        '<div class="card">' + (names.length ? '<div class="chips">' + names.map(function (n) { return '<span class="chip">' + esc(n) + ' <i>' + idx[n].length + '</i><button title="Rename or merge" data-ren="' + esc(n) + '">' + icon('edit') + '</button><button title="Remove from all posts" data-rm="' + esc(n) + '">×</button></span>'; }).join('') + '</div>' : '<p class="empty">No tags yet. Add tags while editing a post.</p>') +
        '<p class="hint" style="margin-top:1rem">Rename a tag to an existing name to merge them. The older hand-built posts do not store tags, so they are not listed here.</p></div>');
      function rewrite(from, to) {
        var posts = idx[from]; if (!posts) return;
        if (!window.confirm((to ? 'Rename' : 'Remove') + ' "' + from + '"' + (to ? ' to "' + to + '"' : '') + ' on ' + posts.length + ' post(s)?')) return;
        L.pool(posts, 3, function (p) {
          return L.getFile('content/blog/' + p.file, L.BRANCH).then(function (g) {
            var q = L.parsePost(g.text), t = (q.fm.tags || []).map(function (x) { return x === from ? to : x; }).filter(Boolean);
            q.fm.tags = t.filter(function (x, i) { return t.indexOf(x) === i; });
            return L.putFile('content/blog/' + p.file, L.BRANCH, L.b64enc(L.serializePost(q.fm, q.body)), L.commitMsg('manual', 'Update', p.title, p.slug, me.name), g.sha);
          });
        }).then(function () { data = null; L.toast('Tags updated'); pageTags(); }).catch(function (e) { L.toast(e.message, true); });
      }
      c.onclick = function (e) {
        var r = e.target.closest('[data-ren]'), m = e.target.closest('[data-rm]');
        if (r) { var to = (window.prompt('New name for "' + r.getAttribute('data-ren') + '" (use an existing tag name to merge):', r.getAttribute('data-ren')) || '').trim(); if (to && to !== r.getAttribute('data-ren')) rewrite(r.getAttribute('data-ren'), to); }
        if (m) rewrite(m.getAttribute('data-rm'), '');
      };
    }).catch(function (e) { errPage('tags', e); });
  }

  /* ======================= activity ======================= */
  var RUNCLS = { success: 'ok', failure: 'bad', cancelled: 'grey' };
  function pageActivity() {
    loadingPage('activity', crumb('Activity'));
    loadData(true).then(function () {
      var s = data.settings.autoUpdate;
      var u30 = data.posts.filter(function (p) { return L.daysSince(p.modified) <= 30; }).sort(function (a, b) { return String(b.modified) > String(a.modified) ? 1 : -1; });
      var old = data.posts.filter(function (p) { return L.daysSince(p.modified) > s.staleDays; }).sort(function (a, b) { return String(a.modified) > String(b.modified) ? 1 : -1; });
      function list(ps, n) { return ps.slice(0, n).map(function (p) { return '<li><div class="dot">' + icon('file') + '</div><div><b>' + esc(p.title) + '</b><small>' + esc(L.fmtDate(p.modified)) + ' · ' + esc(L.rel(p.modified)) + ' · ' + esc(L.catLabel(p.category)) + '</small> ' + srcBadge(p) + '</div></li>'; }).join('') || '<li class="empty">None</li>'; }
      var html = head('Activity', 'Every update to every blog, who made it, and what is overdue.') +
        '<div class="grid4">' + stat('check', 'g', u30.length, 'Posts updated (30 days)') + stat('clock', old.length ? 'r' : 'g', old.length, 'Not updated in ' + s.staleDays + '+ days') +
        stat('refresh', 'y', data.commits.filter(function (c) { return c.source === 'auto' && c.known; }).length, 'Auto-updates published') + stat('edit', '', data.commits.filter(function (c) { return c.source === 'manual' && c.known; }).length, 'Manual updates') + '</div>' +
        '<div class="cols"><div><div class="card flush"><div class="hd"><h2>Update history</h2><select id="as" style="width:auto"><option value="">All</option><option value="auto">Auto only</option><option value="manual">Manual only</option></select></div><ul class="feed" id="hist"></ul></div>' +
        '<div class="card flush"><div class="hd"><h2>Writer and auto-update runs</h2></div><div class="tw"><table class="t"><tbody>' + (data.runs.slice(0, 8).map(function (r) {
          return '<tr><td class="ti"><b>' + esc(r.display_title || r.name) + '</b><small>' + esc(L.rel(r.created_at)) + '</small></td><td><span class="pill ' + (r.status !== 'completed' ? 'warn' : (RUNCLS[r.conclusion] || 'grey')) + '">' + esc(r.status === 'completed' ? r.conclusion : r.status) + '</span></td><td class="act"><a class="iconbtn" target="_blank" rel="noopener" href="' + esc(r.html_url) + '">' + icon('ext') + '</a></td></tr>';
        }).join('') || '<tr><td class="empty">No runs yet.</td></tr>') + '</tbody></table></div></div></div>' +
        '<div><div class="card flush"><div class="hd"><h2>Updated in the last 30 days</h2></div><ul class="feed">' + list(u30, 12) + '</ul></div>' +
        '<div class="card flush"><div class="hd"><h2>Overdue for a refresh</h2></div><ul class="feed">' + list(old, 12) + '</ul></div></div></div>';
      page('activity', crumb('Activity'), html);
      function drawHist() {
        var f = document.getElementById('as').value, rows = data.commits.filter(function (c) { return !f || (c.known && c.source === f); });
        document.getElementById('hist').innerHTML = rows.slice(0, 40).map(feedItem).join('') || '<li class="empty">No activity.</li>';
      }
      document.getElementById('as').onchange = drawHist; drawHist();
    }).catch(function (e) { errPage('activity', e); });
  }

  /* ======================= settings ======================= */
  function pageSettings() {
    loadingPage('settings', crumb('Settings'));
    var isAdmin = me.role === 'admin';
    Promise.all([loadData(), isAdmin ? L.api('/users') : Promise.resolve({ users: [] }), L.api('/state', { noAuthRedirect: true })]).then(function (r) {
      var users = r[1].users, s = data.settings.autoUpdate;
      var html = head('Settings', 'Account, team and automation') +
        '<div class="cols"><div>' +
        '<div class="card"><h2>Change my password</h2><label class="f">Current password</label><input type="password" id="pc" autocomplete="current-password"><label class="f">New password <small>(8+ characters)</small></label><input type="password" id="pn" autocomplete="new-password"><div style="margin-top:1rem"><button class="btn" id="pgo">Update password</button></div></div>' +
        (isAdmin ? '<div class="card flush"><div class="hd"><h2>Team</h2></div><div class="tw"><table class="t"><tbody>' + users.map(function (u) {
          return '<tr><td class="ti"><b>' + esc(u.name) + '</b><small>' + esc(u.role) + ' · added ' + esc(L.fmtDate(u.created)) + '</small></td><td class="act"><button class="btn ghost sm" data-pw="' + esc(u.name) + '">Reset password</button>' + (u.name !== me.name ? '<button class="btn danger sm" data-del="' + esc(u.name) + '">' + icon('trash') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><div style="padding:1.1rem 1.2rem;border-top:1px solid var(--line)"><h2 style="font-size:.92rem">Add a team member</h2><div class="row"><div><label class="f">Username</label><input type="text" id="nu" autocapitalize="none"></div><div><label class="f">Password</label><input type="password" id="np" autocomplete="new-password"></div><div class="fit"><label class="f">Role</label><select id="nr"><option value="editor">Editor</option><option value="admin">Admin</option></select></div><div class="fit"><button class="btn" id="nadd">Add</button></div></div><p class="hint">Editors can write, edit and publish posts. Admins can also manage the team and settings.</p></div></div>' : '') +
        '</div><div>' +
        (isAdmin ? '<div class="card"><h2>Auto-update</h2><p class="sub">Claude refreshes old posts and leaves them for your review. It never publishes by itself.</p>' +
          '<label class="f" style="display:flex;gap:.6rem;align-items:center;margin-top:0"><input type="checkbox" id="ae"' + (s.enabled ? ' checked' : '') + ' style="width:auto"> Run automatically every Monday (08:00 Pakistan time)</label>' +
          '<div class="row"><div><label class="f">Stale after (days)</label><input type="number" id="sd" min="30" max="720" value="' + s.staleDays + '"></div><div><label class="f">Posts per run</label><input type="number" id="pr" min="1" max="5" value="' + s.perRun + '"></div></div>' +
          '<div style="margin-top:1rem"><button class="btn" id="asv">Save</button> <button class="btn ghost" id="arun">' + icon('refresh') + ' Run now</button></div></div>' +
          '<div class="card"><h2>GitHub connection</h2><p class="sub">' + (r[2].github ? 'Connected. Blog Studio publishes through this account.' : 'Not connected.') + '</p><button class="btn ghost" id="gc">Reconnect GitHub</button></div>' : '') +
        '</div></div>';
      var c = page('settings', crumb('Settings'), html);
      document.getElementById('pgo').onclick = function () {
        L.api('/me/password', { method: 'POST', body: { current: document.getElementById('pc').value, password: document.getElementById('pn').value } }).then(function () { L.toast('Password updated'); document.getElementById('pc').value = ''; document.getElementById('pn').value = ''; }).catch(function (e) { L.toast(e.message, true); });
      };
      if (!isAdmin) return;
      document.getElementById('nadd').onclick = function () {
        L.api('/users', { method: 'POST', body: { username: document.getElementById('nu').value, password: document.getElementById('np').value, role: document.getElementById('nr').value } }).then(function () { L.toast('Member added'); pageSettings(); }).catch(function (e) { L.toast(e.message, true); });
      };
      c.onclick = function (e) {
        var pw = e.target.closest('[data-pw]'), del = e.target.closest('[data-del]');
        if (pw) { var np = window.prompt('New password for ' + pw.getAttribute('data-pw') + ' (8+ characters):'); if (np) L.api('/users/' + encodeURIComponent(pw.getAttribute('data-pw')) + '/password', { method: 'POST', body: { password: np } }).then(function () { L.toast('Password reset'); }).catch(function (er) { L.toast(er.message, true); }); }
        if (del && window.confirm('Remove ' + del.getAttribute('data-del') + '? They will be signed out immediately.')) L.api('/users/' + encodeURIComponent(del.getAttribute('data-del')), { method: 'DELETE' }).then(function () { L.toast('Member removed'); pageSettings(); }).catch(function (er) { L.toast(er.message, true); });
      };
      document.getElementById('asv').onclick = function () {
        var st = { autoUpdate: { enabled: document.getElementById('ae').checked, staleDays: Math.max(30, parseInt(document.getElementById('sd').value, 10) || 90), perRun: Math.min(5, Math.max(1, parseInt(document.getElementById('pr').value, 10) || 2)) } };
        L.getFile('.github/cms-settings.json', L.BRANCH).then(function (g) {
          return L.putFile('.github/cms-settings.json', L.BRANCH, L.b64enc(JSON.stringify(st, null, 2) + '\n'), '[manual] Auto-update settings (by ' + me.name + ')', g && g.sha);
        }).then(function () { data = null; L.toast('Settings saved'); }).catch(function (e) { L.toast(e.message, true); });
      };
      document.getElementById('arun').onclick = function () {
        if (!window.confirm('Ask Claude to refresh the ' + s.perRun + ' stalest post(s) now? You will review them first.')) return;
        L.dispatch('refresh-blog.yml', { slugs: 'auto', requested_by: me.name }).then(function () { L.toast('Started. Check Drafts & Review in about 5 minutes.'); }).catch(function (e) { L.toast(e.message, true); });
      };
      document.getElementById('gc').onclick = function () {
        connectGitHub(function (g) { L.api('/github/connect', { method: 'POST', body: { grant: g } }).then(function () { L.toast('GitHub reconnected'); pageSettings(); }).catch(function (e) { L.toast(e.message, true); }); });
      };
    }).catch(function (e) { errPage('settings', e); });
  }

  /* ======================= preview ======================= */
  var FONT_CSS = '';
  function loadFonts() {
    if (FONT_CSS) return Promise.resolve();
    return Promise.all([400, 600, 700, 800].map(function (w) {
      return fetch('/admin/vendor/fonts/poppins-' + w + '.woff2').then(function (r) { return r.blob(); }).then(function (b) {
        return new Promise(function (res) { var rd = new FileReader(); rd.onload = function () { res('@font-face{font-family:"Poppins";font-weight:' + w + ';src:url(' + rd.result + ') format("woff2")}'); }; rd.readAsDataURL(b); });
      });
    })).then(function (p) { FONT_CSS = p.join(''); }).catch(function () { FONT_CSS = ''; });
  }
  function previewHtml(fm, bodyMd) {
    var cat = L.catLabel(fm.category), toc = L.tocFromBody(bodyMd);
    var css = FONT_CSS + 'body{font-family:"Poppins",system-ui,sans-serif;color:#1d2b3f;line-height:1.75;margin:0;background:#f4f8fd}main{max-width:760px;margin:0 auto;padding:1.4rem 1.1rem 3rem;background:#fff}' +
      'h1,h2,h3{font-family:"Poppins",system-ui,sans-serif}h1{color:#0b2b57;font-size:2rem;line-height:1.15;letter-spacing:-.02em;font-weight:800;margin:.3rem 0 .8rem}h2{color:#0b2b57;margin-top:2.2rem;font-weight:700}h3{color:#00448b;font-weight:600}' +
      '.eyebrow{font-size:.74rem;font-weight:700;letter-spacing:.14em;color:#00448b;text-transform:uppercase}.lead{font-size:1.1rem;color:#40526b}' +
      '.qa{background:#fff8e1;border-left:5px solid #f5b400;padding:.8rem 1.1rem;border-radius:8px;margin:1.2rem 0}.qa b{display:block;color:#7a5a00;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase}' +
      '.toc{background:#eef4fb;border-radius:10px;padding:.8rem 1.2rem}.highlight-box{background:#e9f2fd;border-left:5px solid #00448b;padding:.8rem 1.1rem;border-radius:8px}' +
      'a{color:#00448b}details{border:1px solid #dbe5f1;border-radius:10px;padding:.6rem 1rem;margin:.6rem 0}summary{font-weight:600;cursor:pointer}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dbe5f1;padding:.4rem .6rem}';
    var html = '<p class="eyebrow">' + esc(cat) + ' · ' + esc(fm.readTime || '') + ' min read</p><h1>' + esc(fm.h1 || fm.title) + '</h1><p class="lead">' + esc(fm.leadParagraph) + '</p>' +
      '<div class="qa"><b>Quick answer</b>' + esc(fm.quickAnswer) + '</div>' +
      (toc.length ? '<div class="toc"><b>In this guide</b><ol>' + toc.map(function (t) { return '<li>' + esc(t.label) + '</li>'; }).join('') + '</ol></div>' : '') +
      window.marked.parse(bodyMd) +
      ((fm.keyTakeaways || []).length ? '<h2>Key takeaways</h2><ul>' + fm.keyTakeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      ((fm.faq || []).length ? '<h2>Frequently asked questions</h2>' + fm.faq.map(function (f) { return '<details open><summary>' + esc(f.question) + '</summary><p>' + esc(f.answer) + '</p></details>'; }).join('') : '') +
      ((fm.relatedGuides || []).length ? '<h2>Related guides</h2><ul>' + fm.relatedGuides.map(function (r) { return '<li>' + esc(r.label) + ' <small>(' + esc(r.url) + ')</small></li>'; }).join('') + '</ul>' : '');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body><main>' + html + '</main></body></html>';
  }
  function openModal(title, srcdoc) {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box"><div class="hd"><b>' + esc(title) + '</b><span class="dev"><button class="btn ghost sm" data-d="d">Desktop</button><button class="btn ghost sm" data-d="m">Mobile</button></span><button class="btn sm" id="pclose">Close</button></div><iframe sandbox="" title="Preview"></iframe></div>';
    document.body.appendChild(m);
    loadFonts().then(function () { m.querySelector('iframe').srcdoc = srcdoc.replace('<style>', '<style>' + FONT_CSS); });
    m.querySelector('#pclose').onclick = function () { m.remove(); };
    m.addEventListener('click', function (e) { var d = e.target.getAttribute('data-d'); if (d) m.classList.toggle('mob', d === 'm'); });
  }

  /* ======================= editor ======================= */
  function loadForEdit(kind, name) {
    loadingPage('posts', crumb('Edit'));
    var path = (kind === 'draft' ? 'drafts/' : 'content/blog/') + name;
    return L.getFile(path, kind === 'draft' ? L.DRAFTS : L.BRANCH).then(function (g) {
      if (!g) throw new Error('File not found: ' + path);
      var p = L.parsePost(g.text);
      cur = { kind: kind, name: name, sha: g.sha, fm: p.fm, body: p.body, image: null, published: kind === 'post' };
      renderEditor();
    });
  }
  function bindVal(id, get, set) { var n = document.getElementById(id); if (!n) return; n.value = get(); n.addEventListener('input', function () { set(n.value); queueScore(); }); }
  function renderEditor() {
    loadData().catch(function () { return null; }).then(function () {
      var fm = cur.fm; fm.keywords = fm.keywords || []; fm.faq = fm.faq || []; fm.relatedGuides = fm.relatedGuides || []; fm.keyTakeaways = fm.keyTakeaways || []; fm.tags = fm.tags || []; fm.coverHighlights = fm.coverHighlights || [];
      var locked = !!cur.published;
      var html = head(cur.published ? 'Edit live post' : (cur.kind === 'draft' ? 'Edit draft' : 'New post'), cur.published ? 'Changes go live as soon as you press Update.' : 'Not live until you press Publish.', '<a class="btn ghost" href="#/posts">Back</a>') +
        '<div class="layout"><div>' +
        '<details class="step" open><summary><span class="n">1</span><div><b>Content</b><span class="s">What visitors read</span></div></summary><div class="in">' +
        '<label class="f">Title <small>(browser tab and Google; " | Nibaha Haq" is added)</small></label><input type="text" id="f-title">' +
        '<label class="f">URL slug' + (locked ? ' <small>(locked: the post is live)</small>' : '') + '</label><input type="text" id="f-slug"' + (locked ? ' disabled' : '') + '><div class="hint" id="slugurl"></div>' +
        '<label class="f">Heading (H1) <small>(big title on the page)</small></label><input type="text" id="f-h1">' +
        '<label class="f">Lead paragraph</label><textarea id="f-lead" rows="3"></textarea>' +
        '<label class="f">Quick answer <small>(40-70 words, quoted by Google and AI answers)</small></label><textarea id="f-qa" rows="4"></textarea><div class="hint" id="qacount"></div>' +
        '<label class="f">Body <small>(HTML headings + markdown text)</small></label><div class="tb"><button type="button" class="btn ghost sm" data-ins="h2">+ Section (H2)</button><button type="button" class="btn ghost sm" data-ins="h3">+ Sub-heading</button><button type="button" class="btn ghost sm" data-ins="b">Bold</button><button type="button" class="btn ghost sm" data-ins="ul">List</button><button type="button" class="btn ghost sm" data-ins="a">Link</button><button type="button" class="btn ghost sm" data-ins="cta">WhatsApp box</button></div>' +
        '<textarea class="body" id="f-body"></textarea><div class="hint" id="bodycount"></div>' +
        '<label class="f">Key takeaways <small>(one per line)</small></label><textarea id="f-take" rows="4"></textarea>' +
        '<label class="f">FAQs <small>(each answer 40-60 words works best)</small></label><div id="faqs"></div><button type="button" class="btn ghost sm" id="addfaq">+ Add question</button></div></details>' +
        '<details class="step"><summary><span class="n">2</span><div><b>SEO and organisation</b><span class="s">Search metadata, category, tags, links</span></div></summary><div class="in">' +
        '<label class="f">Meta description <small>(70-160 chars)</small></label><textarea id="f-meta" rows="3"></textarea><div class="hint" id="metacount"></div>' +
        '<label class="f">Keywords <small>(comma separated, the FIRST one is the focus keyword)</small></label><input type="text" id="f-kw">' +
        '<div class="row"><div><label class="f">Category</label><select id="f-cat">' + L.CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div><div><label class="f">Read time (min)</label><input type="number" id="f-rt" min="1" max="30"></div></div>' +
        '<label class="f">Tags <small>(press Enter or comma to add)</small></label><div class="tagbox" id="tagbox"></div><div class="sugg" id="tagsugg"></div>' +
        '<label class="f">Related guides <small>(internal links; hub and spoke)</small></label><div id="rels"></div><button type="button" class="btn ghost sm" id="addrel">+ Add related guide</button></div></details>' +
        '<details class="step"><summary><span class="n">3</span><div><b>Page extras</b><span class="s">Cover card, image, dates</span></div></summary><div class="in">' +
        '<label class="f">Cover card line 1 (eyebrow)</label><input type="text" id="f-eb"><label class="f">Cover highlights <small>(2-3 short lines, one per line)</small></label><textarea id="f-hl" rows="3"></textarea>' +
        '<label class="f">Cover contact line</label><input type="text" id="f-cl"><label class="f">WhatsApp button text</label><input type="text" id="f-cta">' +
        '<label class="f">Cover / share image <small>(1200x630, jpg or png, under 1.5 MB. Leave empty for the default.)</small></label><input type="file" id="f-img" accept="image/png,image/jpeg,image/webp">' +
        '<img class="imgprev" id="imgprev" alt="" src="' + L.SITE + '/assets/blog-images/' + esc(fm.ogImage || 'default-cover.png') + '">' +
        '<div class="row"><div><label class="f">Date published</label><input type="date" id="f-dp"></div><div><label class="f">Date modified</label><input type="date" id="f-dm"></div></div></div></details>' +
        '</div><aside class="sidepanel card"><div class="score" id="score"></div><p class="sub" style="margin:.2rem 0 0">SEO score (live)</p><ul class="checks" id="checks"></ul></aside></div>' +
        '<div class="bar"><span class="st" id="st">' + (cur.published ? 'Editing a live post' : (cur.kind === 'draft' ? 'Draft' : 'New post (not saved)')) + '</span><button class="btn ghost" id="save">Save draft</button><button class="btn ghost" id="prev">Preview</button><button class="btn gold" id="pub">' + (cur.published ? 'Update live post' : 'Publish') + '</button></div>';
      page('posts', crumb('Edit'), html);
      bindVal('f-title', function () { return fm.title || ''; }, function (v) { fm.title = v; if (!locked && !cur.slugEdited) { fm.canonicalSlug = L.slugify(v); document.getElementById('f-slug').value = fm.canonicalSlug; slugHint(); } });
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
      document.getElementById('prev').onclick = function () { finalize(true); openModal('Preview (approximate; the live page uses the full site design)', previewHtml(cur.fm, cur.body)); };
      document.getElementById('pub').onclick = publish;
      drawReps(); drawTags(); counts(); slugHint(); scoreNow();
    });
  }
  function drawTags() {
    var fm = cur.fm, box = document.getElementById('tagbox'); if (!box) return;
    box.innerHTML = fm.tags.map(function (t, i) { return '<span class="chip">' + esc(t) + '<button type="button" data-rt="' + i + '">×</button></span>'; }).join('') + '<input type="text" id="tagin" placeholder="Add a tag…">';
    var all = data ? tagIndex() : {}, sug = Object.keys(all).filter(function (t) { return fm.tags.indexOf(t) < 0; }).sort(function (a, b) { return all[b].length - all[a].length; }).slice(0, 10);
    document.getElementById('tagsugg').innerHTML = sug.map(function (t) { return '<button type="button" data-st="' + esc(t) + '">+ ' + esc(t) + '</button>'; }).join('');
    function add(v) { v = v.trim().replace(/,$/, '').trim(); if (v && fm.tags.indexOf(v) < 0) { fm.tags.push(v); } drawTags(); document.getElementById('tagin').focus(); }
    var inp = document.getElementById('tagin');
    inp.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inp.value); } else if (e.key === 'Backspace' && !inp.value && fm.tags.length) { fm.tags.pop(); drawTags(); } };
    inp.onblur = function () { if (inp.value.trim()) add(inp.value); };
    box.onclick = function (e) { var r = e.target.getAttribute('data-rt'); if (r !== null) { fm.tags.splice(r, 1); drawTags(); } };
    document.getElementById('tagsugg').onclick = function (e) { var s = e.target.getAttribute('data-st'); if (s) add(s); };
  }
  function slugHint() { var n = document.getElementById('slugurl'); if (n) n.textContent = L.SITE + '/blog/' + (cur.fm.canonicalSlug || '…'); }
  function counts() {
    var q = document.getElementById('qacount'), b = document.getElementById('bodycount'), m = document.getElementById('metacount');
    var qw = L.words(cur.fm.quickAnswer), ml = L.plainLen(cur.fm.metaDescription);
    if (q) { q.textContent = qw + ' words'; q.className = 'hint ' + (qw >= 40 && qw <= 70 ? 'ok' : 'bad'); }
    if (m) { m.textContent = ml + ' / 160 characters'; m.className = 'hint ' + (ml >= 70 && ml <= 160 ? 'ok' : 'bad'); }
    if (b) b.textContent = L.words(cur.body) + ' words · ' + L.tocFromBody(cur.body).length + ' sections';
  }
  function drawReps() {
    var fm = cur.fm, faqs = document.getElementById('faqs'), rels = document.getElementById('rels');
    faqs.innerHTML = fm.faq.map(function (f, i) { return '<div class="rep"><button type="button" class="btn danger sm rm" data-rmf="' + i + '">Remove</button><label class="f" style="margin-top:0">Question</label><input type="text" data-fq="' + i + '" value="' + esc(f.question) + '"><label class="f">Answer</label><textarea rows="3" data-fa="' + i + '">' + esc(f.answer) + '</textarea></div>'; }).join('');
    rels.innerHTML = fm.relatedGuides.map(function (r, i) { return '<div class="rep"><button type="button" class="btn danger sm rm" data-rmr="' + i + '">Remove</button><label class="f" style="margin-top:0">URL <small>(like /blog/vu-help-guide)</small></label><input type="text" data-ru="' + i + '" value="' + esc(r.url) + '"><label class="f">Link text</label><input type="text" data-rl="' + i + '" value="' + esc(r.label) + '"></div>'; }).join('');
    faqs.oninput = function (e) { var q = e.target.getAttribute('data-fq'), a = e.target.getAttribute('data-fa'); if (q !== null) fm.faq[q].question = e.target.value; if (a !== null) fm.faq[a].answer = e.target.value; queueScore(); };
    rels.oninput = function (e) { var u = e.target.getAttribute('data-ru'), l = e.target.getAttribute('data-rl'); if (u !== null) fm.relatedGuides[u].url = e.target.value.trim(); if (l !== null) fm.relatedGuides[l].label = e.target.value; queueScore(); };
    faqs.onclick = function (e) { var i = e.target.getAttribute('data-rmf'); if (i !== null) { fm.faq.splice(i, 1); drawReps(); queueScore(); } };
    rels.onclick = function (e) { var i = e.target.getAttribute('data-rmr'); if (i !== null) { fm.relatedGuides.splice(i, 1); drawReps(); queueScore(); } };
  }
  function insertTool(kind) {
    var ta = document.getElementById('f-body'), s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e), ins;
    if (kind === 'h2') ins = '\n<h2 id="' + (L.slugify(sel) || 'new-section') + '">' + (sel || 'New section heading') + '</h2>\n\n';
    else if (kind === 'h3') ins = '\n<h3>' + (sel || 'Sub-heading') + '</h3>\n\n';
    else if (kind === 'b') ins = '**' + (sel || 'bold text') + '**';
    else if (kind === 'ul') ins = '\n- ' + (sel || 'First point') + '\n- Second point\n- Third point\n\n';
    else if (kind === 'a') { var u = window.prompt('Link to (e.g. /blog/vu-help-guide):', '/blog/'); if (!u) return; ins = '<a class="inline-link" href="' + u.replace(/"/g, '') + '">' + (sel || 'link text') + '</a>'; }
    else ins = '\n<div class="highlight-box"><p>Need help with this? <a class="inline-link" data-whatsapp="Hello Nibaha Haq, I need help with: " target="_blank" rel="noopener" href="https://wa.me/923295209868?text=Hello%20Nibaha%20Haq%2C%20I%20need%20help%20with%3A%20">Message us on WhatsApp</a> and get a clear direction.</p></div>\n\n';
    ta.setRangeText(ins, s, e, 'end'); ta.focus(); cur.body = ta.value; counts(); queueScore();
  }
  function pickImage(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { L.toast('Image is over 1.5 MB. Compress it first.', true); e.target.value = ''; return; }
    var ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg'), rd = new FileReader();
    rd.onload = function () { var name = (cur.fm.canonicalSlug || 'cover') + '-cover.' + ext; cur.image = { name: name, b64: String(rd.result).split(',')[1] }; cur.fm.ogImage = name; document.getElementById('imgprev').src = rd.result; };
    rd.readAsDataURL(f);
  }
  function queueScore() { clearTimeout(scoreTimer); scoreTimer = setTimeout(scoreNow, 200); }
  function scoreNow() {
    var C = L.seoChecks(cur.fm, cur.body), ok = C.filter(function (c) { return c.ok; }).length, pct = Math.round(ok / C.length * 100);
    var s = document.getElementById('score'), ul = document.getElementById('checks'); if (!s) return;
    s.className = 'score ' + (pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'low')); s.innerHTML = '<b>' + pct + '</b><span>/ 100</span>';
    ul.innerHTML = C.map(function (c) { return '<li class="' + (c.ok ? 'ok' : (c.block ? 'no' : 'wa')) + '"><span class="i">' + (c.ok ? '✓' : (c.block ? '✕' : '!')) + '</span><span>' + esc(c.label) + '</span></li>'; }).join('');
  }
  function finalize(light) {
    var fm = cur.fm; fm.tocEntries = L.tocFromBody(cur.body); fm.keywords = (fm.keywords || []).filter(Boolean);
    fm.faq = (fm.faq || []).filter(function (f) { return f.question && f.answer; }); fm.relatedGuides = (fm.relatedGuides || []).filter(function (r) { return r.url && r.label; });
    if (light) return;
    if (!cur.published && !fm.datePublished) fm.datePublished = L.today();
    if (cur.published) fm.dateModified = L.today();
    fm.readTime = Math.max(1, Math.round(L.words(cur.body) / 200)) || fm.readTime || 5;
  }
  function saveDraft() {
    if (cur.published) { L.toast('This post is live. Use "Update live post".', true); return; }
    if (!cur.fm.canonicalSlug) { L.toast('Add a title first (the slug comes from it).', true); return; }
    finalize(); var name = cur.kind === 'draft' ? cur.name : cur.fm.canonicalSlug + '.md', path = 'drafts/' + name, btn = document.getElementById('save'); btn.disabled = true;
    L.getFile(path, L.DRAFTS).then(function (g) { return L.putFile(path, L.DRAFTS, L.b64enc(L.serializePost(cur.fm, cur.body)), 'Save draft ' + name, g && g.sha); })
      .then(function (res) { cur.kind = 'draft'; cur.name = name; cur.sha = res.content.sha; data = null; L.toast('Draft saved'); document.getElementById('st').textContent = 'Draft saved'; })
      .catch(function (e) { L.toast(e.status === 404 || e.status === 422 ? 'Cannot save yet: write one blog with the Write button first so the drafts area exists.' : e.message, true); })
      .then(function () { btn.disabled = false; });
  }
  function publish() {
    finalize(); var C = L.seoChecks(cur.fm, cur.body), blockers = C.filter(function (c) { return c.block; });
    if (blockers.length) { window.alert('Fix these before publishing:\n\n- ' + blockers.map(function (b) { return b.label; }).join('\n- ')); return; }
    var fm = cur.fm, path = 'content/blog/' + fm.canonicalSlug + '.md', btn = document.getElementById('pub'); btn.disabled = true;
    L.getFile(path, L.BRANCH).then(function (existing) {
      if (existing && !cur.published) throw new Error('A live post already uses the slug "' + fm.canonicalSlug + '". Change the slug.');
      if (!window.confirm((cur.published ? 'Update the live post' : 'Publish this post') + ' on lmshandling.com now?\n\n' + fm.title)) { btn.disabled = false; return null; }
      var chain = Promise.resolve();
      if (cur.image) chain = chain.then(function () { return L.getFile('assets/blog-images/' + cur.image.name, L.BRANCH); }).then(function (img) { return L.putFile('assets/blog-images/' + cur.image.name, L.BRANCH, cur.image.b64, 'Blog image ' + cur.image.name, img && img.sha); });
      return chain.then(function () { return L.putFile(path, L.BRANCH, L.b64enc(L.serializePost(fm, cur.body)), L.commitMsg('manual', cur.published ? 'Update' : 'Publish', fm.title, fm.canonicalSlug, me.name), existing && existing.sha); })
        .then(function (res) {
          var after = Promise.resolve();
          if (cur.kind === 'draft') after = L.getFile('drafts/' + cur.name, L.DRAFTS).then(function (d) { return d ? L.delFile('drafts/' + cur.name, L.DRAFTS, d.sha, 'Published ' + fm.canonicalSlug) : null; }).catch(function () { /* cleanup is best effort */ });
          return after.then(function () { data = null; showDeploy(res.commit.sha, fm.canonicalSlug); });
        });
    }).catch(function (e) { L.toast(e.message, true); btn.disabled = false; });
  }
  function showDeploy(sha, slug) {
    var url = L.SITE + '/blog/' + slug;
    page('posts', crumb('Publishing'), head('Published', 'Deploying to the live site. This takes about a minute.') + '<div class="card"><div id="dp" class="alert info">Waiting for the deploy to start…</div><p><a class="btn ghost" href="#/posts">Back to All Posts</a></p></div>');
    var tries = 0; clearInterval(poll);
    poll = setInterval(function () {
      tries++;
      L.gh('repos/' + L.REPO + '/actions/runs?event=push&branch=' + encodeURIComponent(L.BRANCH) + '&per_page=10').then(function (d) {
        var run = ((d && d.workflow_runs) || []).filter(function (r) { return r.head_sha === sha; })[0], box = document.getElementById('dp'); if (!box) return;
        if (!run) { if (tries > 10) { box.textContent = 'Deploy not detected. Check GitHub Actions.'; clearInterval(poll); } return; }
        if (run.status !== 'completed') { box.textContent = 'Deploying… (' + run.status + ')'; return; }
        clearInterval(poll);
        if (run.conclusion === 'success') { box.className = 'alert ok'; box.innerHTML = 'Live now: <a target="_blank" rel="noopener" href="' + esc(url) + '">' + esc(url) + '</a>'; }
        else { box.className = 'alert err'; box.innerHTML = 'Deploy failed. <a target="_blank" rel="noopener" href="' + esc(run.html_url) + '">Open the log</a>'; }
      }).catch(function () { /* keep polling */ });
    }, 6000);
  }

  /* ======================= router ======================= */
  function route() {
    clearInterval(poll);
    if (!me) return;
    var h = location.hash.replace(/^#/, '') || '/', base = h.split('?')[0], m;
    if (base === '/') return pageDash();
    if (base === '/posts') return pagePosts();
    if (base === '/new') return pageNew();
    if (base === '/review') return pageReview();
    if (base === '/categories') return pageCats();
    if (base === '/tags') return pageTags();
    if (base === '/activity') return pageActivity();
    if (base === '/settings') return pageSettings();
    if ((m = /^\/review\/(.+)$/.exec(base))) return pageReviewItem(decodeURIComponent(m[1]));
    if ((m = /^\/edit\/(draft|post):(.+)$/.exec(base))) { loadForEdit(m[1], decodeURIComponent(m[2])).catch(function (e) { L.toast(e.message, true); location.hash = '#/posts'; }); return; }
    if (base === '/edit' && cur) return renderEditor();
    pageDash();
  }
  function start() { ensureShell(); window.removeEventListener('hashchange', route); window.addEventListener('hashchange', route); route(); }

  boot();
})();
