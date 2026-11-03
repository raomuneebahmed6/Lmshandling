/* Shows one section at a time with a tab bar, so long pages need far less scrolling.
   Every section stays in the page (only hidden), so search engines still read all of it.
   Config: <script type="application/json" id="tabs-config">{"label":"...","items":[["css selector","Tab label"], ...]}</script> */
(function () {
  var cfgEl = document.getElementById("tabs-config");
  if (!cfgEl) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var secs = cfg.items.map(function (i) { return document.querySelector(i[0]); });
  if (secs.some(function (s) { return !s; })) return;
  var bar = document.createElement("div");
  bar.className = "proof-tabs";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", cfg.label || "Sections");
  if (cfg.label) {
    var lab = document.createElement("p");
    lab.className = "proof-tabs-label";
    lab.textContent = cfg.label;
    bar.appendChild(lab);
  }
  var btns = cfg.items.map(function (it, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = it[1];
    b.addEventListener("click", function () { show(i, true); });
    bar.appendChild(b);
    return b;
  });
  secs[0].parentNode.insertBefore(bar, secs[0]);
  function show(n, scroll) {
    secs.forEach(function (s, i) { s.hidden = i !== n; });
    btns.forEach(function (b, i) { b.setAttribute("aria-selected", i === n ? "true" : "false"); });
    if (scroll) { var r = bar.getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.6) window.scrollTo({ top: window.scrollY + r.top - 110, behavior: "smooth" }); }
  }
  var start = 0;
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    secs.forEach(function (s, i) { if (target && s.contains(target)) start = i; });
  }
  show(start, false);
})();
