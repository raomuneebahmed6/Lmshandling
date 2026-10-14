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
  // password input with a show/hide eye button
  function pwField(id, label, ac, hint) {
    return '<label class="f">' + label + (hint ? ' <small>' + hint + '</small>' : '') + '</label><div class="pw"><input type="password" id="' + id + '" autocomplete="' + ac + '">' +
      '<button type="button" class="pwt" data-pwt="' + id + '" aria-label="Show password" title="Show password">' + icon('eye') + '</button></div>';
  }
  if (!window.__lmhPw) {
    window.__lmhPw = true;
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pwt]'); if (!b) return;
      var inp = document.getElementById(b.getAttribute('data-pwt')); if (!inp) return;
      var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
      b.innerHTML = icon(show ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.title = show ? 'Hide password' : 'Show password';
    });
  }
  function renderLogin(msg, ok) {
    clearInterval(poll); me = null; data = null;
    authShell('Welcome back', 'Sign in with your Blog Studio username.',
      (msg ? '<div class="alert ' + (ok ? 'ok' : 'err') + '">' + esc(msg) + '</div>' : '') +
      '<form id="lf"><label class="f">Username</label><input type="text" id="lu" autocomplete="username" autocapitalize="none" autofocus>' +
      pwField('lp', 'Password', 'current-password') +
      '<div id="lerr"></div><div id="l2fa"></div><button class="btn" type="submit" id="lgo">Sign in</button>' +
      '<p style="text-align:center;margin:1rem 0 0"><a href="#" id="forgot">Forgot password?</a></p></form>');
    document.getElementById('forgot').onclick = function (e) { e.preventDefault(); renderRecover(); };
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var b = document.getElementById('lgo'); b.disabled = true; b.textContent = 'Signing in…';
      var codeEl = document.getElementById('lc'), body = { username: document.getElementById('lu').value, password: document.getElementById('lp').value };
      if (codeEl) body.code = codeEl.value;
      L.api('/login', { method: 'POST', body: body, noAuthRedirect: true })
        .then(function (r) {
          if (r.need2fa) { // password was right: ask for the authenticator code
            b.disabled = false; b.textContent = 'Verify and sign in';
            if (!document.getElementById('lc')) {
              document.getElementById('l2fa').innerHTML = '<div class="alert info">Two-step login is on. Enter the 6-digit code from your authenticator app, or one of your recovery codes.</div><label class="f">Code</label><input type="text" id="lc" inputmode="numeric" autocomplete="one-time-code" autocapitalize="none" placeholder="123456">';
              document.getElementById('lc').focus();
            }
            return;
          }
          me = r.user; start();
        })
        .catch(function (er) { b.disabled = false; b.textContent = document.getElementById('lc') ? 'Verify and sign in' : 'Sign in'; document.getElementById('lerr').innerHTML = '<div class="alert err">' + esc(er.message) + '</div>'; });
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
  // Forgot password: there is no email service, so ownership of the site's GitHub repository is the proof.
  function renderRecover() {
    var grant = null;
    authShell('Reset your password', 'Prove you own the site, then choose a new password.',
      '<div class="alert info">Step 1: sign in with the GitHub account that owns the site repository (the same one used at setup). Nothing is changed on GitHub.</div>' +
      '<button class="btn ghost" id="gh" type="button">Connect GitHub</button><div id="ghok"></div>' +
      '<form id="rf" style="display:none"><label class="f">Your Blog Studio username</label><input type="text" id="ru" autocomplete="username" autocapitalize="none">' +
      pwField('rp', 'New password', 'new-password', '(10+ characters)') + pwField('rp2', 'Repeat new password', 'new-password') +
      '<div id="rerr"></div><button class="btn" type="submit" id="rgo">Set new password</button></form>' +
      '<p style="text-align:center;margin:1rem 0 0"><a href="#" id="back">Back to sign in</a></p>');
    document.getElementById('back').onclick = function (e) { e.preventDefault(); renderLogin(); };
    document.getElementById('gh').onclick = function () {
      connectGitHub(function (g) {
        grant = g; document.getElementById('gh').style.display = 'none';
        document.getElementById('ghok').innerHTML = '<div class="alert ok">GitHub verified. Choose a new password.</div>';
        document.getElementById('rf').style.display = 'block';
      });
    };
    document.getElementById('rf').onsubmit = function (e) {
      e.preventDefault();
      var p = document.getElementById('rp').value, err = document.getElementById('rerr');
      if (p !== document.getElementById('rp2').value) { err.innerHTML = '<div class="alert err">Passwords do not match.</div>'; return; }
      var b = document.getElementById('rgo'); b.disabled = true;
      L.api('/recover', { method: 'POST', body: { grant: grant, username: document.getElementById('ru').value, password: p }, noAuthRedirect: true })
        .then(function () { renderLogin('Password changed. Sign in with your new password.', true); })
        .catch(function (er) { b.disabled = false; err.innerHTML = '<div class="alert err">' + esc(er.message) + '</div>'; });
    };
  }
  function renderSetup() {
    var grant = null;
    authShell('Set up Blog Studio', 'One-time setup. Connect GitHub, then choose your admin username and password.',
      '<div class="alert info">Step 1: connect the GitHub account that owns the site repository. You only do this once; after that nobody needs GitHub to sign in.</div>' +
      '<button class="btn ghost" id="gh" type="button" style="margin-top:.2rem">Connect GitHub</button><div id="ghok"></div>' +
      '<form id="sf" style="display:none"><label class="f">Admin username</label><input type="text" id="su" autocomplete="username" autocapitalize="none" placeholder="e.g. muneeb">' +
      pwField('sp', 'Password', 'new-password', '(10+ characters)') + pwField('sp2', 'Repeat password', 'new-password') + '<div id="serr"></div>' +
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
  // The GitHub link can no longer be decrypted (the OAuth secret was rotated): admins must reconnect once.
  window.addEventListener('studio:reconnect', function () {
    var c = document.getElementById('content'); if (!c || document.getElementById('rcban')) return;
    var d = document.createElement('div'); d.id = 'rcban'; d.className = 'alert warn';
    d.innerHTML = me && me.role === 'admin' ? 'GitHub needs to be reconnected. <a href="#/settings">Open Settings</a> and press <b>Reconnect GitHub</b>.' : 'GitHub needs to be reconnected. Ask an admin to open Settings and press Reconnect GitHub.';
    c.insertBefore(d, c.firstChild);
  });

  /* ======================= shell ======================= */
  var NAV = [
    ['Main', [['dash', '#/', 'home', 'Dashboard'], ['seo', '#/seo', 'trend', 'SEO Health'], ['search', '#/search', 'chart', 'Search Performance'], ['posts', '#/posts', 'file', 'All Posts'], ['new', '#/new', 'pen', 'Write New']]],
    ['Content', [['review', '#/review', 'inbox', 'Drafts & Review'], ['cats', '#/categories', 'folder', 'Categories'], ['tags', '#/tags', 'tag', 'Tags'], ['media', '#/media', 'image', 'Media']]],
    ['Manage', [['activity', '#/activity', 'activity', 'Activity'], ['redirects', '#/redirects', 'redirect', 'Redirects', true], ['settings', '#/settings', 'users', 'Settings']]]
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
      return '<h6>' + sec[0] + '</h6>' + sec[1].filter(function (i) { return !i[4] || me.role === 'admin'; }).map(function (i) {
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
      L.gh('repos/' + L.REPO + '/actions/runs?per_page=25').catch(function () { return { workflow_runs: [] }; }),
      L.getFile('reports/seo.json', L.DRAFTS).catch(function () { return null; })
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
      var runs = (r[7].workflow_runs || []).filter(function (x) { return /Write blog|Refresh blogs|SEO audit/.test(x.name || ''); });
      var seo = null; try { seo = r[8] ? JSON.parse(r[8].text) : null; } catch (e) { /* no report yet */ }
      var seoByPath = {}; if (seo) (seo.pages || []).forEach(function (p) { seoByPath[p.path] = p; });
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
        posts.forEach(function (p) { var sp = seoByPath['/blog/' + p.slug]; p.seo = sp ? sp.score : null; p.seoFlags = sp ? sp.flags : []; });
        data = { posts: posts, drafts: drafts, proposals: proposals, commits: commits, runs: runs, settings: settings, bySlug: bySlug, seo: seo, settingsSha: r[6] ? r[6].sha : null, loadedAt: Date.now() };
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
        '<div>' + seoCard() + writeCard() + '<div class="card"><h2>Auto-update</h2><p class="sub">' + (s.enabled ? 'Every Monday Claude refreshes up to ' + s.perRun + ' post(s) older than ' + s.staleDays + ' days and leaves them for your review.' : 'Weekly auto-update is off.') + '</p>' +
        '<a class="btn ghost sm" href="#/settings">Change settings</a> ' + (pend ? '<a class="btn gold sm" href="#/review">Review ' + pend + '</a>' : '') + '</div></div></div>';
      var c = page('dash', crumb('Dashboard'), html);
      c.onclick = function (e) { var a = e.target.closest('[data-au]'); if (a) autoUpdate([a.getAttribute('data-au')]); };
      wireWrite(c);
    }).catch(function (e) { errPage('dash', e); });
  }
  function stat(ic, cls, n, label) { return '<div class="stat"><div class="ic ' + cls + '">' + icon(ic) + '</div><div><b>' + n + '</b><span>' + esc(label) + '</span></div></div>'; }
  function feedItem(c) {
    return '<li><div class="dot ' + (c.source === 'auto' ? 'auto' : '') + '">' + icon(c.source === 'auto' ? 'refresh' : 'edit') + '</div><div><b>' + esc(c.title) + '</b><small>' +
      (c.known ? esc(c.kind === 'Publish' ? 'Published' : 'Updated') + ' · ' + (c.source === 'auto' ? 'Auto-update (Claude), approved by ' : 'by ') + esc(c.by) : 'Site change by ' + esc(c.by)) + (c.verified ? ' <span title="Account verified by the server">✓</span>' : '') + ' · ' + esc(L.rel(c.date)) + '</small></div></li>';
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
        '<td>' + (p.seo == null ? '<span class="hint">-</span>' : '<span class="pill ' + (p.seo >= 90 ? 'ok' : (p.seo >= 70 ? 'warn' : 'bad')) + '" title="' + esc((p.seoFlags || []).join(', ') || 'No issues found') + '">' + p.seo + '</span>') + '</td>' +
        '<td>' + esc(L.fmtDate(p.modified)) + ' <small style="color:var(--mute)">' + esc(L.rel(p.modified)) + '</small> ' + (stale ? '<span class="pill bad">Stale</span> ' : '') + srcBadge(p) + '</td>' +
        '<td class="act">' + (live ? '<a class="iconbtn" title="Open live page" href="' + L.SITE + '/blog/' + esc(p.slug) + '" target="_blank" rel="noopener">' + icon('ext') + '</a>' : '') +
        (p.kind === 'md' ? '<a class="btn ghost sm" href="#/edit/post:' + esc(encodeURIComponent(p.file)) + '">' + icon('edit') + ' Edit</a>' : '') +
        (p.kind === 'draft' ? '<a class="btn ghost sm" href="#/edit/draft:' + esc(encodeURIComponent(p.file)) + '">' + icon('edit') + ' Edit</a>' : '') +
        (live ? '<button class="btn sm" data-au="' + esc(p.slug) + '">' + icon('refresh') + ' Auto-update</button>' : '') + '</td></tr>';
    }).join('');
    return { total: rows.length, html: body || '<tr><td colspan="7" class="empty">No posts match.</td></tr>', more: rows.length > show.length };
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
        '<div class="tw"><table class="t"><thead><tr><th></th><th>Title</th><th>Category</th><th>Status</th><th title="Latest SEO audit score for this page">SEO</th><th>Last updated</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="more" style="padding:1rem;text-align:center"></div></div>';
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

  /* ======================= search performance (Google Search Console) ======================= */
  function nfmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function delta(cur, prev, lowerIsBetter, fixed) {
    if (!prev) return '<span class="hint">new</span>';
    var d = cur - prev, pct = prev ? d / prev * 100 : 0, good = lowerIsBetter ? d < 0 : d > 0;
    if (Math.abs(pct) < 0.5 && !lowerIsBetter) return '<span class="hint">no change</span>';
    var txt = lowerIsBetter ? (Math.abs(d)).toFixed(fixed == null ? 1 : fixed) + ' places' : Math.abs(pct).toFixed(0) + '%';
    if (lowerIsBetter && Math.abs(d) < 0.05) return '<span class="hint">no change</span>';
    return '<span class="dl ' + (good ? 'up' : 'down') + '">' + (good ? '▲' : '▼') + ' ' + txt + '</span>';
  }
  function searchSetup(msg, email) {
    return '<div class="card"><h2>' + icon('chart') + ' Connect Google Search Console</h2>' + (msg ? '<div class="alert warn">' + esc(msg) + '</div>' : '') +
      '<p class="sub">This page shows your real Google data: clicks, impressions, average position and the keywords people used. It needs a one-time, read-only connection (about 10 minutes, no cost).</p>' +
      '<ol class="steps2"><li><b>Create a Google Cloud project</b> and turn on the <i>Google Search Console API</i><br><span>console.cloud.google.com → New project → APIs &amp; Services → Library → "Google Search Console API" → Enable.</span></li>' +
      '<li><b>Create a service account and a key</b><br><span>IAM &amp; Admin → Service Accounts → Create. Then open it → Keys → Add key → JSON. A <code>.json</code> file downloads.</span></li>' +
      '<li><b>Give it read access in Search Console</b><br><span>search.google.com/search-console → your property → Settings → Users and permissions → Add user → paste the service account e-mail' + (email ? ' (<code class="key">' + esc(email) + '</code>)' : ' (looks like name@project.iam.gserviceaccount.com)') + ' → permission <b>Restricted</b>.</span></li>' +
      '<li><b>Store the key in the Worker</b> (run in the cloudflare-oauth-worker folder, using the downloaded file name)<br><pre class="cmd">Get-Content .\\key.json -Raw | npx wrangler@4 secret put GSC_SERVICE_ACCOUNT</pre><span>The key goes straight to Cloudflare and is never saved in the repository.</span></li>' +
      '<li><b>Reload this page.</b> If your property is a URL-prefix property instead of a Domain property, tell Claude so it can set <code>GSC_SITE</code>.</li></ol></div>';
  }
  function pageSearch() {
    var days = 28; try { days = parseInt(sessionStorage.getItem('lmh_days'), 10) || 28; } catch (e) { /* default */ }
    loadingPage('search', crumb('Search Performance'));
    function load(fresh) {
      L.api('/gsc/overview?days=' + days + (fresh ? '&fresh=1' : '')).then(function (r) {
        var bar = '<select id="sdays" style="width:auto"><option value="7">Last 7 days</option><option value="28">Last 28 days</option><option value="90">Last 3 months</option></select> <button class="btn ghost" id="sref">' + icon('refresh') + ' Refresh</button>';
        if (!r.configured) { page('search', crumb('Search Performance'), head('Search Performance', 'Real clicks, rankings and keywords from Google.') + searchSetup()); return; }
        if (r.error) { page('search', crumb('Search Performance'), head('Search Performance', 'Real clicks, rankings and keywords from Google.', bar) + searchSetup(r.message, r.email)); wireSearch(); return; }
        var t = r.totals, p = r.prevTotals, win = L.fmtDate(r.range.startDate) + ' to ' + L.fmtDate(r.range.endDate);
        var maxC = Math.max.apply(null, r.daily.map(function (d) { return d.clicks; }).concat([1])), maxI = Math.max.apply(null, r.daily.map(function (d) { return d.impressions; }).concat([1])), W = 640, H = 170, n = r.daily.length || 1, bw = Math.max(2, Math.floor(W / n) - 2);
        var bars = r.daily.map(function (d, i) { var h2 = Math.round(d.clicks / maxC * (H - 24)); return '<rect x="' + Math.round(i * (W / n)) + '" y="' + (H - h2) + '" width="' + bw + '" height="' + h2 + '" rx="2" fill="#1a5fb0"><title>' + esc(d.date) + ': ' + d.clicks + ' clicks</title></rect>'; }).join('');
        var line = r.daily.map(function (d, i) { return Math.round(i * (W / n) + bw / 2) + ',' + Math.round(H - 4 - d.impressions / maxI * (H - 30)); }).join(' ');
        var wins = r.queries.filter(function (q) { return q.position >= 4 && q.position <= 20 && q.impressions >= 30; }).sort(function (a, b) { return b.impressions - a.impressions; }).slice(0, 8);
        var devTot = r.devices.reduce(function (s, d) { return s + d.clicks; }, 0) || 1;
        var html = head('Search Performance', 'Google Search Console · ' + esc(win) + ' vs the previous ' + r.days + ' days · property ' + esc(r.site), bar) +
          '<div class="grid4">' +
          '<div class="stat"><div class="ic">' + icon('chart') + '</div><div><b>' + nfmt(t.clicks) + '</b><span>Clicks ' + delta(t.clicks, p.clicks) + '</span></div></div>' +
          '<div class="stat"><div class="ic g">' + icon('search') + '</div><div><b>' + nfmt(t.impressions) + '</b><span>Impressions ' + delta(t.impressions, p.impressions) + '</span></div></div>' +
          '<div class="stat"><div class="ic y">' + icon('check') + '</div><div><b>' + (t.ctr * 100).toFixed(1) + '%</b><span>Click rate ' + delta(t.ctr, p.ctr) + '</span></div></div>' +
          '<div class="stat"><div class="ic ' + (t.position && t.position <= 10 ? 'g' : 'r') + '">' + icon('trend') + '</div><div><b>' + t.position.toFixed(1) + '</b><span>Avg position ' + delta(t.position, p.position, true) + '</span></div></div></div>' +
          '<div class="card"><h2>Clicks and impressions per day</h2><svg viewBox="0 0 ' + W + ' ' + H + '" class="chartsvg" role="img" aria-label="Daily clicks and impressions"><polyline fill="none" stroke="#f5b400" stroke-width="2.5" stroke-linejoin="round" points="' + line + '"/>' + bars + '</svg><p class="hint"><span class="lg b"></span> Clicks &nbsp; <span class="lg y"></span> Impressions. Google data is about 2 days behind.</p></div>' +
          '<div class="cols"><div class="card flush"><div class="hd"><h2>Keyword tracker</h2><input type="text" id="qf" placeholder="Filter keywords…" style="width:180px"></div><div class="tw"><table class="t"><thead><tr><th>Keyword</th><th>Clicks</th><th>Impr.</th><th>Position</th><th>Change</th></tr></thead><tbody id="qrows"></tbody></table></div><div id="qmore" style="padding:.8rem;text-align:center"></div></div>' +
          '<div><div class="card flush"><div class="hd"><h2>Quick wins</h2></div><p class="sub" style="padding:.8rem 1.2rem 0;margin:0">Already close to page 1. A little work (better title, more detail, internal links) can lift these.</p><ul class="feed">' +
          (wins.map(function (q) { return '<li><div class="dot auto">' + icon('trend') + '</div><div><b>' + esc(q.q) + '</b><small>position ' + q.position.toFixed(1) + ' · ' + nfmt(q.impressions) + ' impressions · ' + nfmt(q.clicks) + ' clicks</small></div></li>'; }).join('') || '<li class="empty">No near-miss keywords yet.</li>') + '</ul></div>' +
          '<div class="card"><h2>Devices</h2>' + r.devices.map(function (d) { var pc = Math.round(d.clicks / devTot * 100); return '<div class="cat"><div class="cl"><b>' + esc(d.device.charAt(0) + d.device.slice(1).toLowerCase()) + '</b><span>' + pc + '%</span></div><div class="meter"><i class="good" style="width:' + pc + '%"></i></div><small>' + nfmt(d.clicks) + ' clicks</small></div>'; }).join('') + '</div></div></div>' +
          '<div class="card flush"><div class="hd"><h2>Top pages</h2></div><div class="tw"><table class="t"><thead><tr><th>Page</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Position</th></tr></thead><tbody>' +
          r.pages.slice(0, 15).map(function (g) { return '<tr><td class="ti"><b>' + esc(g.page.replace(/^https?:\/\/[^/]+/, '') || '/') + '</b></td><td>' + nfmt(g.clicks) + '</td><td>' + nfmt(g.impressions) + '</td><td>' + (g.ctr * 100).toFixed(1) + '%</td><td>' + g.position.toFixed(1) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
          '<p class="hint">Position is the average spot in Google results (1 = top, lower is better). A green arrow means a better position than the previous period.</p>';
        page('search', crumb('Search Performance'), html);
        var show = 15;
        function drawQ() {
          var f = (document.getElementById('qf').value || '').toLowerCase(), rows = r.queries.filter(function (q) { return !f || q.q.toLowerCase().indexOf(f) >= 0; });
          document.getElementById('qrows').innerHTML = rows.slice(0, show).map(function (q) {
            return '<tr><td class="ti"><b>' + esc(q.q) + '</b></td><td>' + nfmt(q.clicks) + '</td><td>' + nfmt(q.impressions) + '</td><td>' + q.position.toFixed(1) + '</td><td>' + (q.prevPosition == null ? '<span class="hint">new</span>' : delta(q.position, q.prevPosition, true)) + '</td></tr>';
          }).join('') || '<tr><td colspan="5" class="empty">No keywords match.</td></tr>';
          document.getElementById('qmore').innerHTML = rows.length > show ? '<button class="btn ghost" id="qm">Show more</button>' : '';
          if (rows.length > show) document.getElementById('qm').onclick = function () { show += 20; drawQ(); };
        }
        document.getElementById('qf').oninput = function () { show = 15; drawQ(); }; drawQ(); wireSearch();
      }).catch(function (e) { errPage('search', e); });
    }
    function wireSearch() {
      var s = document.getElementById('sdays'); if (s) { s.value = String(days); s.onchange = function () { days = +s.value; try { sessionStorage.setItem('lmh_days', String(days)); } catch (e) { /* ignore */ } loadingPage('search', crumb('Search Performance')); load(false); }; }
      var b = document.getElementById('sref'); if (b) b.onclick = function () { loadingPage('search', crumb('Search Performance')); load(true); };
    }
    load(false);
  }

  /* ======================= redirects (admin) ======================= */
  var RFROM = /^\/[A-Za-z0-9\/._-]{1,150}$/, RTO = /^(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300}|\/|https:\/\/(www\.)?lmshandling\.com(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300})?)$/;
  function pageRedirects() {
    loadingPage('redirects', crumb('Redirects'));
    if (me.role !== 'admin') { page('redirects', crumb('Redirects'), '<div class="alert warn">Only admins can manage redirects.</div>'); return; }
    Promise.all([loadData(), L.getFile('_data/redirects.json', L.BRANCH)]).then(function (r) {
      var list = []; try { list = JSON.parse(r[1] ? r[1].text : '[]'); } catch (e) { /* start empty */ }
      var sha = r[1] ? r[1].sha : null;
      var html = head('Redirects', 'Send an old address to a new one with a permanent (301) redirect, so visitors and Google follow it and keep the ranking.') +
        '<div class="card"><h2>Add a redirect</h2><div class="row"><div><label class="f">Old address <small>(path on this site)</small></label><input type="text" id="rf" placeholder="/blog/old-post"></div>' +
        '<div><label class="f">New address <small>(path or https://lmshandling.com/...)</small></label><input type="text" id="rt" placeholder="/blog/new-post"></div></div>' +
        '<label class="f">Note <small>(optional)</small></label><input type="text" id="rn" placeholder="Why this redirect exists"><div id="rerr"></div><div style="margin-top:1rem"><button class="btn" id="radd">' + icon('plus') + ' Add redirect</button></div>' +
        '<p class="hint">Takes effect after the next deploy (about a minute). Only addresses on lmshandling.com are allowed as targets.</p></div>' +
        '<div class="card flush"><div class="hd"><h2>Active redirects</h2><span class="pill">' + list.length + '</span></div>' +
        (list.length ? '<div class="tw"><table class="t"><thead><tr><th>Old address</th><th>New address</th><th>Note</th><th></th></tr></thead><tbody>' + list.map(function (x, i) {
          return '<tr><td class="ti"><b>' + esc(x.from) + '</b></td><td>' + esc(x.to) + '</td><td>' + esc(x.note || '') + '</td><td class="act"><a class="iconbtn" target="_blank" rel="noopener" title="Test it" href="' + L.SITE + esc(x.from) + '">' + icon('ext') + '</a><button class="btn danger sm" data-rdel="' + i + '">' + icon('trash') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No redirects yet.</p>') + '</div>';
      var c = page('redirects', crumb('Redirects'), html);
      function save(next, msg) {
        return L.getFile('_data/redirects.json', L.BRANCH).then(function (g) {
          return L.putFile('_data/redirects.json', L.BRANCH, L.b64enc(JSON.stringify(next, null, 2) + '\n'), '[manual] ' + msg + ' (by ' + me.name + ')', g && g.sha);
        }).then(function () { L.toast('Saved. Live after the next deploy (about a minute).'); pageRedirects(); }).catch(function (e) { L.toast(e.message, true); });
      }
      document.getElementById('radd').onclick = function () {
        var from = document.getElementById('rf').value.trim(), to = document.getElementById('rt').value.trim(), err = document.getElementById('rerr'), bad = '';
        if (from && from.charAt(0) !== '/') from = '/' + from;
        if (to && !/^https?:/.test(to) && to.charAt(0) !== '/') to = '/' + to;
        if (!RFROM.test(from) || from.indexOf('..') >= 0 || from.indexOf('//') >= 0) bad = 'The old address must be a path like /blog/old-post (letters, numbers, - _ . /).';
        else if (!RTO.test(to) || to.indexOf('..') >= 0) bad = 'The new address must be a path on this site or a https://lmshandling.com URL.';
        else if (from.replace(/\/$/, '') === to.replace(/\/$/, '')) bad = 'The old and new address are the same.';
        else if (from === '/' ) bad = 'The homepage cannot be redirected.';
        else if (list.some(function (x) { return x.from.replace(/\/$/, '').toLowerCase() === from.replace(/\/$/, '').toLowerCase(); })) bad = 'There is already a redirect for that old address.';
        if (bad) { err.innerHTML = '<div class="alert err">' + esc(bad) + '</div>'; return; }
        var m = /^\/blog\/([a-z0-9-]+)\/?$/.exec(from), live = m && data.bySlug[m[1]];
        if (live && !window.confirm('A live post already exists at ' + from + ' ("' + live.title + '"). After this redirect it can no longer be opened. Continue?')) return;
        err.innerHTML = '';
        save(list.concat([{ from: from, to: to, note: document.getElementById('rn').value.trim().slice(0, 140), by: me.name, date: L.today() }]), 'Add redirect ' + from);
      };
      c.onclick = function (e) {
        var d = e.target.closest('[data-rdel]'); if (!d) return;
        var i = +d.getAttribute('data-rdel');
        if (window.confirm('Remove the redirect from ' + list[i].from + '?')) save(list.filter(function (x, j) { return j !== i; }), 'Remove redirect ' + list[i].from);
      };
    }).catch(function (e) { errPage('redirects', e); });
  }

  /* ======================= media ======================= */
  function pageMedia() {
    loadingPage('media', crumb('Media'));
    L.listDir('assets/blog-images', L.BRANCH).then(function (items) {
      var imgs = items.filter(function (i) { return /\.(png|jpe?g|webp)$/i.test(i.name); }).sort(function (a, b) { return b.size - a.size; });
      var heavy = imgs.filter(function (i) { return i.size > 300 * 1024; }).length;
      var html = head('Media', imgs.length + ' images used by blog covers and social previews', '<label class="btn" for="mup">' + icon('plus') + ' Upload images</label><input type="file" id="mup" accept="image/*" multiple style="display:none">') +
        (heavy ? '<div class="alert warn">' + heavy + ' image(s) are over 300 KB. Heavy images slow pages down. New uploads are compressed automatically; older ones can be re-uploaded.</div>' : '') +
        '<div class="mgrid">' + (imgs.map(function (i) {
          var url = L.SITE + '/assets/blog-images/' + encodeURIComponent(i.name), kb = Math.round(i.size / 1024);
          return '<div class="mcard"><a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="" loading="lazy"></a><div class="mi"><b title="' + esc(i.name) + '">' + esc(i.name) + '</b><span class="pill ' + (kb > 300 ? 'warn' : 'ok') + '">' + kb + ' KB</span><button type="button" class="btn ghost sm" data-copy="' + esc(url) + '">Copy URL</button></div></div>';
        }).join('') || '<p class="empty">No images yet.</p>') + '</div>';
      var c = page('media', crumb('Media'), html);
      c.onclick = function (e) { var b = e.target.closest('[data-copy]'); if (b && navigator.clipboard) navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () { L.toast('URL copied'); }); };
      document.getElementById('mup').onchange = function (e) {
        var files = Array.prototype.slice.call(e.target.files); if (!files.length) return;
        L.toast('Compressing and uploading ' + files.length + ' image(s)…');
        L.pool(files, 2, function (f) {
          return L.compressImage(f, 1600, 300 * 1024).then(function (c2) {
            var base = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image', name = base + '.' + c2.ext;
            if (imgs.some(function (i) { return i.name === name; })) name = base + '-' + Date.now().toString(36) + '.' + c2.ext;
            return L.putFile('assets/blog-images/' + name, L.BRANCH, c2.b64, '[manual] Upload image ' + name + ' (by ' + me.name + ')');
          });
        }).then(function () { L.toast('Uploaded. It is live after the next deploy (about a minute).'); pageMedia(); }).catch(function (er) { L.toast(er.message, true); });
      };
    }).catch(function (e) { errPage('media', e); });
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

  /* ======================= SEO health ======================= */
  var CATNAME = { technical: 'Technical SEO', onpage: 'On-page SEO', content: 'Content', structured: 'Structured data', aeo: 'AI and answer readiness', security: 'Security', performance: 'Speed (mobile)' };
  var CATHINT = { technical: 'Crawling, indexing, redirects, links', onpage: 'Titles, descriptions, headings', content: 'Length, images, structure', structured: 'Schema markup for rich results', aeo: 'FAQs and llms.txt for AI answers', security: 'Headers, HTTPS, exposed files', performance: 'Lighthouse on key pages' };
  var FLAGNAME = { T_NON200: 'Not 200', T_REDIRECT: 'Redirects', T_NOINDEX: 'noindex', T_CANON_MISSING: 'No canonical', T_CANON_DIFF: 'Canonical differs', T_ORPHAN: 'Orphan', T_SLOW: 'Slow', T_HEAVY: 'Heavy HTML', O_TITLE_MISSING: 'No title', O_TITLE_LONG: 'Title long', O_TITLE_SHORT: 'Title short', O_TITLE_DUP: 'Duplicate title', O_DESC_MISSING: 'No description', O_DESC_LEN: 'Description length', O_DESC_DUP: 'Duplicate description', O_H1_MISSING: 'No H1', O_H1_MULTI: 'Several H1', O_LANG: 'No lang', O_VIEWPORT: 'No viewport', O_OG: 'Open Graph', O_TWITTER: 'Twitter card', C_THIN: 'Thin', C_ALT: 'Image alt', C_IMGDIM: 'Image size', C_H2: 'No H2', S_NONE: 'No schema', S_INVALID: 'Invalid schema', S_BREADCRUMB: 'Breadcrumb', S_ARTICLE: 'Article schema', A_FAQ: 'No FAQ schema', SEC_MIXED: 'Mixed content', SEC_NOOPENER: 'noopener' };
  function scoreCls(n) { return n >= 90 ? 'good' : (n >= 70 ? 'mid' : 'low'); }
  function ring(n) { return '<div class="ring ' + scoreCls(n) + '" style="--p:' + n + '"><b>' + n + '</b></div>'; }
  function spark(hist) {
    if (!hist || hist.length < 2) return '<p class="hint">The trend line appears after the next audit.</p>';
    var w = 260, h = 54, v = hist.map(function (x) { return x.score; }), mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), pts = v.map(function (n, i) { return Math.round(i * (w / (v.length - 1))) + ',' + Math.round(h - 4 - (n - mn) / ((mx - mn) || 1) * (h - 10)); }).join(' ');
    var d = v[v.length - 1] - v[0];
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="spark" role="img" aria-label="Score trend"><polyline fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="' + pts + '"/></svg><p class="hint">' + (d === 0 ? 'No change' : (d > 0 ? '+' : '') + d + ' points') + ' over the last ' + v.length + ' audits</p>';
  }
  function seoCard() {
    var r = data && data.seo;
    if (!r) return '<div class="card"><h2>SEO Health</h2><p class="sub">No audit yet. Run the first one to see your site status.</p><a class="btn" href="#/seo">' + icon('trend') + ' Open SEO Health</a></div>';
    var s = r.summary, top = r.issues[0];
    return '<div class="card"><div class="seohead">' + ring(s.score) + '<div><h2>SEO Health</h2><p class="sub" style="margin:0">' + esc(L.rel(r.generatedAt)) + ' · ' + r.pagesCrawled + ' pages</p>' +
      '<p class="sub" style="margin:.25rem 0 0">' + (s.issuesHigh ? '<span class="pill bad">' + s.issuesHigh + ' high</span> ' : '') + (s.issuesMedium ? '<span class="pill warn">' + s.issuesMedium + ' medium</span> ' : '') + (s.issuesLow ? '<span class="pill grey">' + s.issuesLow + ' low</span>' : '') + (r.issues.length ? '' : '<span class="pill ok">No issues</span>') + '</p></div></div>' +
      (top ? '<p class="hint" style="margin:.8rem 0 0">Top issue: <b>' + esc(top.title) + '</b></p>' : '') + '<div style="margin-top:.8rem"><a class="btn ghost sm" href="#/seo">See full report</a></div></div>';
  }
  function seoSuggestions(r) {
    var out = [];
    r.issues.filter(function (i) { return i.severity !== 'low'; }).slice(0, 4).forEach(function (i) { out.push({ t: i.fix, s: i.title }); });
    if (!r.performance.measured) out.push({ t: 'Run the audit from GitHub (Run audit now) so Lighthouse speed scores are measured.', s: 'Speed is not measured yet' });
    out.push({ t: 'Connect Google Search Console and submit sitemap.xml. It shows real clicks, impressions, rankings and which pages Google has indexed.', s: 'Google data is missing' });
    out.push({ t: 'Add backlinks from relevant education sites and student communities. Rankings depend heavily on trusted links, which this audit cannot see.', s: 'Backlinks are not measured' });
    out.push({ t: 'Keep refreshing older posts (Auto-update) and answer real student questions with FAQ sections.', s: 'Content freshness' });
    return out.slice(0, 7);
  }
  function pageSeo() {
    loadingPage('seo', crumb('SEO Health'));
    loadData(true).then(function () {
      var r = data.seo, running = data.runs.some(function (x) { return /SEO audit/.test(x.name || '') && x.status !== 'completed'; });
      var runBtn = '<button class="btn gold" id="runaudit"' + (running ? ' disabled' : '') + '>' + icon('refresh') + (running ? ' Audit running…' : ' Run audit now') + '</button>';
      if (!r) {
        var c0 = page('seo', crumb('SEO Health'), head('SEO Health', 'A full check of your live site: SEO, speed, mobile and security.', runBtn) +
          '<div class="card"><h2>No audit yet</h2><p class="sub">Press <b>Run audit now</b>. It crawls every page of lmshandling.com like a search engine, checks security headers and speed, and takes about 3-5 minutes. It also runs automatically every night and after each site update.</p></div>');
        wireAudit(c0, null); return;
      }
      var s = r.summary, cats = Object.keys(s.categories);
      var html = head('SEO Health', 'Last audit ' + esc(L.rel(r.generatedAt)) + ' (' + esc(L.fmtDate(r.generatedAt)) + ') · ' + r.pagesCrawled + ' pages crawled of ' + esc(r.site), runBtn) +
        '<div class="alert info">' + esc(r.notes) + ' Rankings and clicks are not included; see <b>Not measured yet</b> below.</div>' +
        '<div class="cols seo"><div class="card"><div class="seohead big">' + ring(s.score) + '<div><h2>Overall score</h2><p class="sub" style="margin:0">' + (s.issuesHigh ? s.issuesHigh + ' high priority, ' : '') + s.issuesMedium + ' medium, ' + s.issuesLow + ' low</p>' + spark(r.history) + '</div></div></div>' +
        '<div class="card"><h2>By area</h2><div class="cats">' + cats.map(function (k) { var n = s.categories[k]; return '<div class="cat"><div class="cl"><b>' + esc(CATNAME[k] || k) + '</b><span>' + n + '</span></div><div class="meter"><i class="' + scoreCls(n) + '" style="width:' + n + '%"></i></div><small>' + esc(CATHINT[k] || '') + '</small></div>'; }).join('') + '</div></div></div>' +
        '<div class="card flush"><div class="hd"><h2>Issues to fix</h2><select id="isf" style="width:auto"><option value="">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><div id="isl"></div></div>' +
        '<div class="cols"><div class="card flush"><div class="hd"><h2>' + icon('shield') + ' Security</h2></div><ul class="feed">' + r.security.map(function (x) { return '<li><div class="dot ' + (x.ok ? '' : 'auto') + '">' + icon(x.ok ? 'check' : 'alert') + '</div><div><b>' + esc(x.name) + '</b><small>' + (x.ok ? 'OK' + (x.value ? ' · ' + esc(x.value.slice(0, 70)) : '') : 'Missing') + '</small></div></li>'; }).join('') +
        '<li><div class="dot ' + (r.exposed.length ? 'auto' : '') + '">' + icon(r.exposed.length ? 'alert' : 'check') + '</div><div><b>Sensitive files not exposed</b><small>' + (r.exposed.length ? esc(r.exposed.join(', ')) : 'None of 15 common risky paths are public') + '</small></div></li></ul></div>' +
        '<div class="card flush"><div class="hd"><h2>Speed on mobile</h2></div>' + (r.performance.measured ? '<div class="tw"><table class="t"><thead><tr><th>Page</th><th>Perf</th><th>LCP</th><th>CLS</th><th>TBT</th></tr></thead><tbody>' + r.performance.pages.map(function (p) { return '<tr><td>' + esc(p.path) + '</td><td><span class="pill ' + (p.performance >= 90 ? 'ok' : (p.performance >= 50 ? 'warn' : 'bad')) + '">' + p.performance + '</span></td><td>' + esc(p.lcp) + '</td><td>' + esc(p.cls) + '</td><td>' + esc(p.tbt) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">' + esc(r.performance.note || 'Not measured yet.') + '</p>') + '</div></div>' +
        '<div class="cols"><div class="card"><h2>Recommended next steps</h2><ol class="steps2">' + seoSuggestions(r).map(function (x) { return '<li><b>' + esc(x.s) + '</b><br><span>' + esc(x.t) + '</span></li>'; }).join('') + '</ol></div>' +
        '<div class="card"><h2>Not measured yet</h2><p class="sub">These need Google or paid tools, so they are not part of the score:</p><ul class="plain">' + r.notMeasured.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>' +
        '<div class="card flush"><div class="hd"><h2>All pages</h2></div><div class="filters"><input type="text" id="pq" placeholder="Search page…"><select id="ps"><option value="asc">Worst first</option><option value="desc">Best first</option><option value="words">Most words</option></select></div><div class="tw"><table class="t"><thead><tr><th>Page</th><th>SEO</th><th>Issues</th><th>Words</th><th>Response</th></tr></thead><tbody id="prow"></tbody></table></div><div id="pmore" style="padding:1rem;text-align:center"></div></div>';
      var c = page('seo', crumb('SEO Health'), html);
      var show = 25;
      function drawIssues() {
        var f = document.getElementById('isf').value, list = r.issues.filter(function (i) { return !f || i.severity === f; });
        document.getElementById('isl').innerHTML = list.length ? list.map(function (i) {
          return '<details class="iss"><summary><span class="pill ' + (i.severity === 'high' ? 'bad' : (i.severity === 'medium' ? 'warn' : 'grey')) + '">' + i.severity + '</span><b>' + esc(i.title) + '</b><span class="pill">' + (i.site ? 'whole site' : i.count + ' page' + (i.count === 1 ? '' : 's')) + '</span></summary><div class="ib"><p><b>Why it matters:</b> ' + esc(i.why) + '</p><p><b>How to fix:</b> ' + esc(i.fix) + '</p>' +
            (i.urls.length ? '<ul class="plain">' + i.urls.slice(0, 15).map(function (u) { var href = /^https?:/.test(u) ? u : (u.charAt(0) === '/' ? r.site + u : ''); return '<li>' + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(u.replace(r.site, '') || '/') + '</a>' : esc(u)) + '</li>'; }).join('') + (i.urls.length > 15 ? '<li class="hint">… and ' + (i.count - 15) + ' more</li>' : '') + '</ul>' : '') + (i.extra.length ? '<p class="hint">' + i.extra.slice(0, 4).map(esc).join('<br>') + '</p>' : '') + '</div></details>';
        }).join('') : '<p class="empty">Nothing to fix here. 🎉</p>';
      }
      function drawPages() {
        var q = document.getElementById('pq').value.toLowerCase(), sort = document.getElementById('ps').value;
        var rows = r.pages.filter(function (p) { return !q || (p.path + ' ' + (p.title || '')).toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return sort === 'desc' ? b.score - a.score : (sort === 'words' ? (b.words || 0) - (a.words || 0) : a.score - b.score); });
        document.getElementById('prow').innerHTML = rows.slice(0, show).map(function (p) {
          return '<tr><td class="ti"><b>' + esc(p.path) + '</b><small>' + esc(p.title || '') + '</small></td><td><span class="pill ' + (p.score >= 90 ? 'ok' : (p.score >= 70 ? 'warn' : 'bad')) + '">' + p.score + '</span></td><td>' + (p.flags.length ? p.flags.map(function (f) { return '<span class="pill grey" style="margin:1px">' + esc(FLAGNAME[f] || f) + '</span>'; }).join(' ') : '<span class="hint">None</span>') + '</td><td>' + (p.words || '') + '</td><td>' + (p.ms || 0) + ' ms</td></tr>';
        }).join('') || '<tr><td colspan="5" class="empty">No pages match.</td></tr>';
        document.getElementById('pmore').innerHTML = rows.length > show ? '<button class="btn ghost" id="pm">Show more</button>' : '';
        if (rows.length > show) document.getElementById('pm').onclick = function () { show += 25; drawPages(); };
      }
      document.getElementById('isf').onchange = drawIssues; document.getElementById('pq').oninput = function () { show = 25; drawPages(); }; document.getElementById('ps').onchange = function () { show = 25; drawPages(); };
      drawIssues(); drawPages(); wireAudit(c, r);
    }).catch(function (e) { errPage('seo', e); });
  }
  function wireAudit(c, r) {
    var b = document.getElementById('runaudit'); if (!b) return;
    b.onclick = function () {
      b.disabled = true; b.innerHTML = icon('refresh') + ' Starting…';
      L.dispatch('seo-audit.yml', {}).then(function () {
        L.toast('Audit started. This page refreshes when it finishes (3-5 minutes).');
        var before = r ? r.generatedAt : '', tries = 0; clearInterval(poll);
        b.innerHTML = icon('refresh') + ' Audit running…';
        poll = setInterval(function () {
          tries++;
          L.getFile('reports/seo.json', L.DRAFTS).then(function (g) {
            var j = null; try { j = g ? JSON.parse(g.text) : null; } catch (e) { /* wait */ }
            if (j && j.generatedAt !== before) { clearInterval(poll); data = null; L.toast('New SEO report is ready'); pageSeo(); }
            else if (tries > 50) { clearInterval(poll); L.toast('The audit is taking long. Check Activity for the run.', true); b.disabled = false; b.innerHTML = icon('refresh') + ' Run audit now'; }
          }).catch(function () { /* keep waiting */ });
        }, 10000);
      }).catch(function (e) { L.toast(e.message, true); b.disabled = false; b.innerHTML = icon('refresh') + ' Run audit now'; });
    };
  }

  /* ======================= settings ======================= */
  function pageSettings() {
    loadingPage('settings', crumb('Settings'));
    var isAdmin = me.role === 'admin';
    Promise.all([loadData(), isAdmin ? L.api('/users') : Promise.resolve({ users: [] }), L.api('/state', { noAuthRedirect: true })]).then(function (r) {
      var users = r[1].users, s = data.settings.autoUpdate;
      var html = head('Settings', 'Account, team and automation') +
        '<div class="cols"><div>' +
        '<div class="card"><h2>Change my password</h2>' + pwField('pc', 'Current password', 'current-password') + pwField('pn', 'New password', 'new-password', '(10+ characters)') + '<div style="margin-top:1rem"><button class="btn" id="pgo">Update password</button></div><p class="hint">Changing it signs you out on every other device.</p></div>' +
        '<div class="card" id="tf"></div>' +
        (isAdmin ? '<div class="card flush"><div class="hd"><h2>Team</h2></div><div class="tw"><table class="t"><tbody>' + users.map(function (u) {
          return '<tr><td class="ti"><b>' + esc(u.name) + (u.twofa ? ' <span class="pill ok">2FA</span>' : '') + '</b><small>' + esc(u.role) + ' · added ' + esc(L.fmtDate(u.created)) + '</small></td><td class="act">' + (u.twofa && u.name !== me.name ? '<button class="btn ghost sm" data-r2fa="' + esc(u.name) + '" title="They lost their phone">Reset 2FA</button>' : '') + '<button class="btn ghost sm" data-pw="' + esc(u.name) + '">Reset password</button>' + (u.name !== me.name ? '<button class="btn danger sm" data-del="' + esc(u.name) + '">' + icon('trash') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><div style="padding:1.1rem 1.2rem;border-top:1px solid var(--line)"><h2 style="font-size:.92rem">Add a team member</h2><div class="row"><div><label class="f">Username</label><input type="text" id="nu" autocapitalize="none"></div><div>' + pwField('np', 'Password', 'new-password', '(10+)') + '</div><div class="fit"><label class="f">Role</label><select id="nr"><option value="editor">Editor</option><option value="admin">Admin</option></select></div><div class="fit"><button class="btn" id="nadd">Add</button></div></div><p class="hint">Editors can write, edit and publish posts. Admins can also manage the team and settings.</p></div></div>' : '') +
        '</div><div>' +
        (isAdmin ? '<div class="card"><h2>Auto-update</h2><p class="sub">Claude refreshes old posts and leaves them for your review. It never publishes by itself.</p>' +
          '<label class="f" style="display:flex;gap:.6rem;align-items:center;margin-top:0"><input type="checkbox" id="ae"' + (s.enabled ? ' checked' : '') + ' style="width:auto"> Run automatically every Monday (08:00 Pakistan time)</label>' +
          '<div class="row"><div><label class="f">Stale after (days)</label><input type="number" id="sd" min="30" max="720" value="' + s.staleDays + '"></div><div><label class="f">Posts per run</label><input type="number" id="pr" min="1" max="5" value="' + s.perRun + '"></div></div>' +
          '<div style="margin-top:1rem"><button class="btn" id="asv">Save</button> <button class="btn ghost" id="arun">' + icon('refresh') + ' Run now</button></div></div>' +
          '<div class="card"><h2>GitHub connection</h2><p class="sub">' + (r[2].github === 'ok' ? 'Connected. Blog Studio publishes through this account.' : (r[2].github === 'broken' ? 'The saved connection can no longer be read (the GitHub OAuth secret was changed). Press Reconnect to fix it.' : 'Not connected.')) + '</p><button class="btn ghost" id="gc">Reconnect GitHub</button></div>' : '') +
        '</div></div>';
      var c = page('settings', crumb('Settings'), html);
      document.getElementById('pgo').onclick = function () {
        L.api('/me/password', { method: 'POST', body: { current: document.getElementById('pc').value, password: document.getElementById('pn').value } }).then(function () { L.toast('Password updated'); document.getElementById('pc').value = ''; document.getElementById('pn').value = ''; }).catch(function (e) { L.toast(e.message, true); });
      };
      draw2fa(!!(r[2].user && r[2].user.twofa));
      if (!isAdmin) return;
      document.getElementById('nadd').onclick = function () {
        L.api('/users', { method: 'POST', body: { username: document.getElementById('nu').value, password: document.getElementById('np').value, role: document.getElementById('nr').value } }).then(function () { L.toast('Member added'); pageSettings(); }).catch(function (e) { L.toast(e.message, true); });
      };
      c.onclick = function (e) {
        var pw = e.target.closest('[data-pw]'), del = e.target.closest('[data-del]'), r2 = e.target.closest('[data-r2fa]');
        if (r2 && window.confirm('Turn off two-step login for ' + r2.getAttribute('data-r2fa') + '? They will be signed out everywhere and can set it up again.')) L.api('/users/' + encodeURIComponent(r2.getAttribute('data-r2fa')) + '/2fa/reset', { method: 'POST' }).then(function () { L.toast('Two-step login reset'); pageSettings(); }).catch(function (er) { L.toast(er.message, true); });
        if (pw) { var np = window.prompt('New password for ' + pw.getAttribute('data-pw') + ' (10+ characters):'); if (np) L.api('/users/' + encodeURIComponent(pw.getAttribute('data-pw')) + '/password', { method: 'POST', body: { password: np } }).then(function () { L.toast('Password reset'); }).catch(function (er) { L.toast(er.message, true); }); }
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

  // Two-step login card (authenticator app + recovery codes) in Settings
  function draw2fa(on) {
    var box = document.getElementById('tf'); if (!box) return;
    if (on) {
      box.innerHTML = '<h2>' + icon('lock') + ' Two-step login <span class="pill ok">On</span></h2><p class="sub">Signing in needs your password and a code from your authenticator app.</p>' +
        '<details><summary class="hint" style="cursor:pointer">Turn it off</summary>' + pwField('d2p', 'Your password', 'current-password') + '<label class="f">Current code or a recovery code</label><input type="text" id="d2c" inputmode="numeric" autocomplete="one-time-code">' +
        '<div style="margin-top:.8rem"><button class="btn danger" id="d2go">Turn off two-step login</button></div></details>';
      document.getElementById('d2go').onclick = function () {
        L.api('/me/2fa/disable', { method: 'POST', body: { password: document.getElementById('d2p').value, code: document.getElementById('d2c').value } })
          .then(function () { L.toast('Two-step login is off'); me.twofa = false; draw2fa(false); }).catch(function (e) { L.toast(e.message, true); });
      };
      return;
    }
    box.innerHTML = '<h2>' + icon('lock') + ' Two-step login <span class="pill grey">Off</span></h2><p class="sub">Adds a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy) so a stolen password alone is not enough. Strongly recommended for admins.</p><button class="btn" id="e2go">Turn on two-step login</button>';
    document.getElementById('e2go').onclick = function () {
      L.api('/me/2fa/start', { method: 'POST' }).then(function (r) {
        var svg = ''; try { var qr = window.qrcode(0, 'M'); qr.addData(r.uri); qr.make(); svg = qr.createSvgTag(4, 0); } catch (e) { svg = ''; }
        box.innerHTML = '<h2>' + icon('lock') + ' Set up two-step login</h2><ol class="steps2"><li><b>Scan this QR code</b> with your authenticator app.<div class="qrbox">' + svg + '</div><span>Cannot scan? Type this key instead: <code class="key">' + esc(r.secret.replace(/(.{4})/g, '$1 ').trim()) + '</code></span></li>' +
          '<li><b>Enter the 6-digit code</b> the app shows now.<div style="margin-top:.5rem"><input type="text" id="e2c" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" style="max-width:200px"></div></li></ol>' +
          '<button class="btn" id="e2ok">Verify and turn on</button>';
        document.getElementById('e2ok').onclick = function () {
          L.api('/me/2fa/enable', { method: 'POST', body: { code: document.getElementById('e2c').value } }).then(function (res) {
            me.twofa = true;
            box.innerHTML = '<h2>' + icon('lock') + ' Save your recovery codes</h2><div class="alert warn">Each code works <b>once</b> if you lose your phone. They are shown only now. Store them somewhere safe (not in this browser).</div><pre class="rcodes" id="rcodes">' + res.recovery.map(esc).join('\n') + '</pre>' +
              '<button class="btn ghost" id="rcopy">Copy</button> <button class="btn ghost" id="rdl">Download</button> <button class="btn" id="rdone">I saved them</button>';
            document.getElementById('rcopy').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(res.recovery.join('\n')).then(function () { L.toast('Copied'); }); };
            document.getElementById('rdl').onclick = function () { var a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent('Blog Studio recovery codes for ' + me.name + '\n' + res.recovery.join('\n') + '\n'); a.download = 'blog-studio-recovery-codes.txt'; a.click(); };
            document.getElementById('rdone').onclick = function () { draw2fa(true); };
          }).catch(function (e) { L.toast(e.message, true); });
        };
      }).catch(function (e) { L.toast(e.message, true); });
    };
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
        '<label class="f">Cover / share image <small>(any image: it is resized and compressed to WebP automatically. Leave empty for the default.)</small></label><input type="file" id="f-img" accept="image/png,image/jpeg,image/webp">' +
        '<img class="imgprev" id="imgprev" alt="" src="' + L.SITE + '/assets/blog-images/' + esc(fm.ogImage || 'default-cover.png') + '">' +
        '<div class="row"><div><label class="f">Date published</label><input type="date" id="f-dp"></div><div><label class="f">Date modified</label><input type="date" id="f-dm"></div></div></div></details>' +
        '</div><aside class="sidepanel card"><div class="score" id="score"></div><p class="sub" style="margin:.2rem 0 0">SEO score (live)</p><ul class="checks" id="checks"></ul><div id="linksugg"></div></aside></div>' +
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
    if (f.size > 12 * 1024 * 1024) { L.toast('That image is over 12 MB. Pick a smaller one.', true); e.target.value = ''; return; }
    L.toast('Compressing image…');
    // resized to 1200 px wide and re-encoded as WebP (about 100-250 KB): faster pages, better SEO
    L.compressImage(f, 1200, 260 * 1024).then(function (c) {
      var name = (cur.fm.canonicalSlug || 'cover') + '-cover.' + c.ext;
      cur.image = { name: name, b64: c.b64 }; cur.fm.ogImage = name; document.getElementById('imgprev').src = c.dataUrl;
      L.toast('Image ready: ' + Math.round(f.size / 1024) + ' KB → ' + Math.round(c.size / 1024) + ' KB');
    }).catch(function (er) { L.toast(er.message, true); e.target.value = ''; });
  }
  function drawLinkSugg() {
    var box = document.getElementById('linksugg'); if (!box || !data) return;
    var list = L.linkSuggestions(data.posts, cur.fm, cur.body, cur.fm.canonicalSlug);
    box.innerHTML = '<h2 style="font-size:.9rem;margin:1rem 0 .4rem">' + icon('link') + ' Link suggestions</h2>' + (list.length ? '<ul class="lsug">' + list.map(function (x) {
      return '<li><span><b>' + esc(x.title) + '</b><small>' + esc(L.catLabel(x.category)) + '</small></span><button type="button" class="btn ghost sm" data-ilink="' + esc(x.slug) + '" title="Insert at the cursor (selected text becomes the link text)">Insert</button></li>';
    }).join('') + '</ul><p class="hint">Related posts you have not linked yet. Internal links help readers and Google.</p>' : '<p class="hint">No related posts found yet. Add a keyword and some body text.</p>');
    box.onclick = function (e) {
      var b = e.target.closest('[data-ilink]'); if (!b) return;
      var slug = b.getAttribute('data-ilink'), p = data.bySlug[slug], ta = document.getElementById('f-body'), s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
      ta.setRangeText('<a class="inline-link" href="/blog/' + slug + '">' + (sel || (p ? p.title : slug)) + '</a>', s, en, 'end'); cur.body = ta.value; ta.focus(); counts(); queueScore(); L.toast('Link inserted');
    };
  }
  function queueScore() { clearTimeout(scoreTimer); scoreTimer = setTimeout(scoreNow, 200); }
  function scoreNow() {
    var C = L.seoChecks(cur.fm, cur.body), ok = C.filter(function (c) { return c.ok; }).length, pct = Math.round(ok / C.length * 100);
    var s = document.getElementById('score'), ul = document.getElementById('checks'); if (!s) return;
    s.className = 'score ' + (pct >= 85 ? 'good' : (pct >= 60 ? 'mid' : 'low')); s.innerHTML = '<b>' + pct + '</b><span>/ 100</span>';
    ul.innerHTML = C.map(function (c) { return '<li class="' + (c.ok ? 'ok' : (c.block ? 'no' : 'wa')) + '"><span class="i">' + (c.ok ? '✓' : (c.block ? '✕' : '!')) + '</span><span>' + esc(c.label) + '</span></li>'; }).join('');
    drawLinkSugg();
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
    if (base === '/seo') return pageSeo();
    if (base === '/search') return pageSearch();
    if (base === '/media') return pageMedia();
    if (base === '/redirects') return pageRedirects();
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
