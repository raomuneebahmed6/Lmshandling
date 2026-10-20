/* lmshandling.com UI helpers (deferred, ~1.5 KB of logic). Presentation only.
 *  - Hero slider: crossfade, arrows, dots, swipe, autoplay that pauses on hover/focus/touch
 *    and when the tab is hidden, and does not autoplay for users who prefer reduced motion.
 */
(function () {
  "use strict";

  function initSlider(root) {
    var slides = Array.prototype.slice.call(root.querySelectorAll(".lmh-slide"));
    if (slides.length < 2) return;
    var dots = Array.prototype.slice.call(root.querySelectorAll(".lmh-dots button"));
    var frame = root.querySelector(".lmh-frame");
    var ms = parseInt(root.getAttribute("data-interval"), 10) || 5500;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cur = 0, timer = null, paused = false;
    root.style.setProperty("--lmh-ms", ms + "ms");

    function show(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === cur); s.setAttribute("aria-hidden", k === cur ? "false" : "true"); });
      dots.forEach(function (d, k) { d.setAttribute("aria-selected", k === cur ? "true" : "false"); });
      restart();
    }
    function stop() { clearTimeout(timer); root.classList.remove("is-playing"); }
    // The other banners are only put on screen (and therefore fetched) once the page has loaded,
    // or at the first interaction, so they never compete with the first paint.
    function makeReady() { if (!root.classList.contains("is-ready")) { root.classList.add("is-ready"); restart(); } }
    function restart() {
      stop();
      if (reduce || paused || document.hidden || !root.classList.contains("is-ready")) return;
      // re-trigger the progress bar animation
      void root.offsetWidth;
      root.classList.add("is-playing");
      timer = setTimeout(function () { show(cur + 1); }, ms);
    }

    var prev = root.querySelector(".lmh-nav.prev"), next = root.querySelector(".lmh-nav.next");
    if (prev) prev.addEventListener("click", function () { makeReady(); show(cur - 1); });
    if (next) next.addEventListener("click", function () { makeReady(); show(cur + 1); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { makeReady(); show(k); }); });
    frame.addEventListener("pointerdown", makeReady, { once: true });
    if (document.readyState === "complete") setTimeout(makeReady, 800);
    else window.addEventListener("load", function () { setTimeout(makeReady, 800); });

    root.addEventListener("mouseenter", function () { paused = true; stop(); });
    root.addEventListener("mouseleave", function () { paused = false; restart(); });
    root.addEventListener("focusin", function () { paused = true; stop(); });
    root.addEventListener("focusout", function () { paused = false; restart(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else restart(); });

    // swipe
    var x0 = null;
    frame.addEventListener("pointerdown", function (e) { x0 = e.clientX; paused = true; stop(); });
    frame.addEventListener("pointerup", function (e) {
      if (x0 !== null) { var dx = e.clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); }
      x0 = null; paused = false; restart();
    });
    frame.addEventListener("pointercancel", function () { x0 = null; paused = false; restart(); });
    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") show(cur - 1); else if (e.key === "ArrowRight") show(cur + 1);
    });

    show(0);
  }

  /* ---------- image protection (a deterrent, not a lock) ----------
   * Blocks the right-click menu and dragging on content images, and records the attempt
   * (page, image, method; country/city/device are added server side) so the owner sees it
   * in Blog Studio. Screenshots and developer tools can never be stopped by any website.
   * Search engines are unaffected: nothing here touches the HTML they read.
   */
  var lastLog = {};
  function imgName(el) { return String(el.currentSrc || el.src || "").split("/").pop().split("?")[0].slice(0, 80); }
  function logAttempt(method, el) {
    var name = imgName(el), key = method + name, now = Date.now();
    if (lastLog[key] && now - lastLog[key] < 15000) return; // do not flood on repeated clicks
    lastLog[key] = now;
    var d = { t: "img", m: method, p: location.pathname.slice(0, 120), i: name };
    try { if (typeof window.gtag === "function") window.gtag("event", "image_save_attempt", { method: method, image: name, page_path: d.p }); } catch (e) { /* analytics may be blocked */ }
  }
  function protectImages() {
    function pic(t) { return t && t.closest ? t.closest("img,picture") : null; }
    function contentImg(el) { var im = el && (el.tagName === "IMG" ? el : el.querySelector && el.querySelector("img")); return im && (im.naturalWidth > 120 || im.width > 120) ? im : null; }
    document.addEventListener("contextmenu", function (e) { var im = contentImg(pic(e.target)); if (im) { e.preventDefault(); logAttempt("contextmenu", im); } }, true);
    document.addEventListener("dragstart", function (e) { if (e.target && e.target.tagName === "IMG" && contentImg(e.target)) { e.preventDefault(); logAttempt("drag", e.target); } }, true);
  }

  /* ---------- Microsoft Clarity (only when an id is configured; loaded after first interaction) ---------- */
  function loadClarity() {
    var m = document.querySelector('meta[name="lmh-clarity"]'), id = m && m.getAttribute("content");
    if (!id) return;
    var started = false, evs = ["scroll", "pointerdown", "keydown", "touchstart"];
    function start() {
      if (started) return; started = true;
      evs.forEach(function (e) { removeEventListener(e, start); });
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, "clarity", "script", id);
    }
    evs.forEach(function (e) { addEventListener(e, start, { passive: true }); });
    addEventListener("load", function () { setTimeout(start, 4000); });
  }

  function ready() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-slider]"), initSlider);
    protectImages();
    loadClarity();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
})();
