(function () {
  var side = document.getElementById("side");
  var burger = document.getElementById("burger");
  var scrim = document.getElementById("scrim");
  function setMenu(open) {
    if (!side) return;
    side.classList.toggle("open", open);
    if (scrim) scrim.classList.toggle("show", open);
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (burger) burger.addEventListener("click", function () { setMenu(!side.classList.contains("open")); });
  if (scrim) scrim.addEventListener("click", function () { setMenu(false); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") setMenu(false); });

  // show / hide password
  document.querySelectorAll("[data-toggle-pass]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = document.getElementById(btn.getAttribute("data-toggle-pass"));
      if (!input) return;
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
    });
  });

  // confirm before destructive forms
  document.querySelectorAll("form[data-confirm]").forEach(function (f) {
    f.addEventListener("submit", function (ev) {
      if (!window.confirm(f.getAttribute("data-confirm"))) ev.preventDefault();
    });
  });

  // clickable table rows
  document.querySelectorAll("tr[data-href]").forEach(function (tr) {
    tr.addEventListener("click", function (ev) {
      if (ev.target.closest("a,button,form")) return;
      window.location = tr.getAttribute("data-href");
    });
  });

  // auto-submit filter selects
  document.querySelectorAll("select[data-autosubmit]").forEach(function (s) {
    s.addEventListener("change", function () { s.form.submit(); });
  });

  document.querySelectorAll("[data-print]").forEach(function (b) { b.addEventListener("click", function () { window.print(); }); });
  document.querySelectorAll("[data-back]").forEach(function (b) { b.addEventListener("click", function () { history.back(); }); });

  if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("/dashboard/sw.js", { scope: "/dashboard/" }).catch(function () {}); }); }
})();
