/* Search box for blog category pages: filters the cards of that category; offers a full-blog search when nothing matches. */
(function () {
  var box = document.getElementById("catSearch");
  var grid = document.querySelector(".blog-grid");
  if (!box || !grid) return;
  var input = box.querySelector("input");
  var status = box.querySelector(".bf-status");
  var clear = box.querySelector(".bf-clear");
  var empty = document.getElementById("catEmpty");
  var allLink = document.getElementById("catAllLink");
  var cards = [].slice.call(grid.querySelectorAll(".blog-card"));
  cards.forEach(function (c) { c.setAttribute("data-text", (c.textContent || "").toLowerCase().replace(/\s+/g, " ")); });
  function run() {
    var q = input.value.trim(), words = q.toLowerCase().split(/\s+/).filter(Boolean), n = 0;
    cards.forEach(function (c) {
      var ok = words.every(function (w) { return c.getAttribute("data-text").indexOf(w) > -1; });
      c.classList.toggle("bf-hide", !ok); if (ok) n++;
    });
    status.textContent = q ? n + (n === 1 ? " guide found" : " guides found") : "";
    if (empty) empty.hidden = n !== 0;
    if (allLink) allLink.href = "/blog/?q=" + encodeURIComponent(q);
  }
  input.addEventListener("input", run);
  clear.addEventListener("click", function () { input.value = ""; run(); input.focus(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); }
  });
  run();
})();
