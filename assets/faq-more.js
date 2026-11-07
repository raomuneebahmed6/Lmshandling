/* Home FAQ on phones: show the first 4 questions, the rest open with one button.
   Every question stays in the page, so nothing is removed for search engines. */
(function () {
  var faq = document.getElementById("faq");
  if (!faq) return;
  var items = faq.querySelectorAll("details");
  if (items.length <= 5) return;
  var mq = window.matchMedia("(max-width:860px)");
  var open = false;
  var wrap = document.createElement("div");
  wrap.style.cssText = "text-align:center;margin-top:.9rem";
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn soft";
  btn.textContent = "Show all " + items.length + " questions";
  wrap.appendChild(btn);
  var list = faq.querySelector(".faq-list");
  list.parentNode.insertBefore(wrap, list.nextSibling);
  function apply() {
    var on = mq.matches && !open;
    Array.prototype.forEach.call(items, function (d, i) { d.hidden = on && i >= 4; });
    wrap.hidden = !on;
  }
  btn.addEventListener("click", function () { open = true; apply(); });
  if (mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply);
  apply();
})();
