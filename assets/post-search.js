/* Search bar inside blog posts: live suggestions from all guides; Enter opens the full blog search. */
(function () {
  var hero = document.querySelector(".deg-hero");
  var anchor = hero ? hero.parentNode : null;
  if (!anchor || !anchor.parentNode) return;
  var wrap = document.createElement("section");
  wrap.className = "section post-search-wrap";
  wrap.setAttribute("aria-label", "Search all guides");
  wrap.innerHTML =
    '<form class="post-search" role="search" action="/blog/" method="get" autocomplete="off">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
    '<label class="sr-only" for="postSearchInput">Search all guides</label>' +
    '<input id="postSearchInput" name="q" type="search" placeholder="Search all guides, e.g. result, datesheet, CS101" maxlength="80" aria-controls="postSearchList">' +
    '<button type="submit" class="ps-go">Search</button>' +
    '<ul class="ps-list" id="postSearchList" role="listbox" hidden></ul></form>';
  anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  var form = wrap.firstChild, input = form.querySelector("input"), list = form.querySelector(".ps-list");
  var loaded = false, posts = [];
  function load(cb) {
    if (window.LMH_POSTS) { posts = window.LMH_POSTS; loaded = true; return cb(); }
    if (loaded === "loading") return;
    loaded = "loading";
    var s = document.createElement("script"); s.src = "/assets/blog-index.js?v=1";
    s.onload = function () { posts = window.LMH_POSTS || []; loaded = true; cb(); };
    document.head.appendChild(s);
  }
  var here = location.pathname.replace(/\/$/, "");
  function render() {
    var q = input.value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    if (!words.length) { list.hidden = true; list.innerHTML = ""; return; }
    var res = [];
    posts.forEach(function (p) {
      if (p[1].replace(/\/$/, "") === here) return;
      var ti = p[0].toLowerCase(), tx = (p[0] + " " + p[3] + " " + p[2] + " " + p[1]).toLowerCase(), score = 0;
      for (var i = 0; i < words.length; i++) {
        if (tx.indexOf(words[i]) < 0) return;
        score += ti.indexOf(words[i]) > -1 ? 3 : 1;
      }
      res.push([score, p]);
    });
    res.sort(function (a, b) { return b[0] - a[0]; });
    var html = res.slice(0, 6).map(function (r) {
      var p = r[1], t = p[0].replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return '<li role="option"><a href="' + p[1] + '"><b>' + t + '</b><span>' + p[2].replace(/&/g, "&amp;") + "</span></a></li>";
    }).join("");
    if (!html) html = '<li class="ps-none">No guide matches yet. Press Enter to search the whole blog.</li>';
    else if (res.length > 6) html += '<li class="ps-more"><a href="/blog/?q=' + encodeURIComponent(input.value.trim()) + '">See all ' + res.length + " results</a></li>";
    list.innerHTML = html; list.hidden = false;
  }
  input.addEventListener("input", function () { load(render); });
  input.addEventListener("focus", function () { load(function () {}); });
  document.addEventListener("click", function (e) { if (!form.contains(e.target)) list.hidden = true; });
  input.addEventListener("keydown", function (e) { if (e.key === "Escape") list.hidden = true; });
  form.addEventListener("submit", function (e) { if (!input.value.trim()) e.preventDefault(); });
})();
