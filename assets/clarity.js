/* Microsoft Clarity: heatmaps, session recordings and visitor paths (where a visitor came from and where they went).
   Paste the Clarity Project ID between the quotes below. While it is empty, nothing loads. */
(function () {
  var CLARITY_ID = "za3txclxzp";
  if (!CLARITY_ID) return;
  // never record the private dashboard
  if (location.pathname.indexOf("/dashboard") === 0) return;
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_ID);
})();
