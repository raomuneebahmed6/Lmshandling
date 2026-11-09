/* Blog search + category filter for /blog/. Works on the existing cards; without JS the full list and category links still work. */
(function () {
  var grid = document.getElementById("blogGrid");
  var bar = document.getElementById("blogFilter");
  if (!grid || !bar) return;
  var cards = [].slice.call(grid.querySelectorAll(".blog-card"));
  var input = bar.querySelector("input");
  var pills = bar.querySelector(".bf-pills");
  var status = bar.querySelector(".bf-status");
  var empty = document.getElementById("blogEmpty");
  var heading = document.getElementById("posts-heading");
  var label = document.querySelector("#posts-heading") && document.querySelector("#posts-heading").parentNode.querySelector(".section-label");
  var cat = "all", q = "";
  var names = {}, counts = {};
  var slugOf = function (c) {
    var a = c.querySelector(".blog-card-tag-link");
    var m = a && /\/category\/([a-z-]+)/.exec(a.getAttribute("href"));
    return m ? m[1] : "other";
  };
  cards.forEach(function (c) {
    var s = slugOf(c); c.setAttribute("data-cat", s);
    c.setAttribute("data-text", (c.textContent || "").toLowerCase().replace(/\s+/g, " "));
    counts[s] = (counts[s] || 0) + 1;
  });
  [].forEach.call(bar.querySelectorAll("[data-cat]"), function (b) {
    var s = b.getAttribute("data-cat"), c = s === "all" ? cards.length : counts[s] || 0;
    var span = b.querySelector("i"); if (span) span.textContent = c;
    names[s] = b.getAttribute("data-name") || "";
  });
  function apply(push) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var shown = 0;
    var filtering = cat !== "all" || words.length > 0;
    var moreEl = document.querySelector(".blog-more");
    if (filtering) grid.classList.remove("collapsed"); else if (moreEl) grid.classList.add("collapsed");
    cards.forEach(function (c) {
      var ok = (cat === "all" || c.getAttribute("data-cat") === cat) && words.every(function (w) { return c.getAttribute("data-text").indexOf(w) > -1; });
      c.classList.toggle("bf-hide", !ok);
      if (ok) shown++;
    });
    grid.classList.toggle("bf-on", filtering);
    if (moreEl) moreEl.style.display = filtering ? "none" : "";
    [].forEach.call(bar.querySelectorAll("[data-cat]"), function (b) {
      var on = b.getAttribute("data-cat") === cat; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    status.textContent = filtering ? shown + (shown === 1 ? " guide found" : " guides found") : "";
    if (empty) empty.hidden = shown !== 0;
    if (heading) heading.textContent = filtering ? (cat !== "all" && names[cat] ? names[cat] + " guides." : "Search results.") : "Start here.";
    if (label) label.textContent = filtering ? "Filtered" : "Latest Guide";
    if (push) {
      var p = []; if (cat !== "all") p.push("cat=" + cat); if (q) p.push("q=" + encodeURIComponent(q));
      try { history.replaceState(null, "", location.pathname + (p.length ? "?" + p.join("&") : "")); } catch (e) {}
    }
  }
  bar.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b) return;
    cat = b.getAttribute("data-cat"); apply(true);
  });
  input.addEventListener("input", function () { q = input.value.trim(); apply(true); });
  var clear = bar.querySelector(".bf-clear");
  if (clear) clear.addEventListener("click", function () { input.value = ""; q = ""; cat = "all"; apply(true); input.focus(); });
  var emptyReset = document.getElementById("blogReset");
  if (emptyReset) emptyReset.addEventListener("click", function () { input.value = ""; q = ""; cat = "all"; apply(true); });
  // start state from the URL
  try {
    var sp = new URLSearchParams(location.search);
    if (sp.get("cat") && (counts[sp.get("cat")] || 0) > 0) cat = sp.get("cat");
    if (sp.get("q")) { q = sp.get("q").slice(0, 80); input.value = q; }
  } catch (e) {}
  apply(false);
})();
