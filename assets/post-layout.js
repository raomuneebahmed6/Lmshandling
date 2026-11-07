/* Builds the right-hand sidebar for blog posts: table of contents, a WhatsApp help card and more guides. */
(function () {
  var toc = document.querySelector(".post-toc"), prose = document.querySelector(".prose");
  if (!toc || !prose || toc.parentNode !== prose.parentNode) return;
  var sec = toc.parentNode;
  sec.classList.add("post-layout");
  var aside = document.createElement("aside");
  aside.className = "post-aside";
  aside.setAttribute("aria-label", "Sidebar");
  sec.insertBefore(aside, toc);
  aside.appendChild(toc);

  var h1 = document.querySelector("h1");
  var topic = h1 ? h1.textContent.trim().replace(/\s+/g, " ") : "this guide";
  var msg = "Hello Nibaha Haq, I read your guide: " + topic + ". I need some help.";
  var cta = document.createElement("div");
  cta.className = "aside-card aside-cta";
  cta.innerHTML = '<h3>Need help with this?</h3><p>Send your course and question on WhatsApp and get a reply from Nibaha Haq.</p>';
  var btn = document.createElement("a");
  btn.className = "btn gold";
  btn.target = "_blank";
  btn.rel = "noopener";
  btn.setAttribute("data-whatsapp", msg);
  btn.href = "https://wa.me/923295209868?text=" + encodeURIComponent(msg);
  btn.textContent = "Message on WhatsApp";
  cta.appendChild(btn);
  aside.appendChild(cta);

  var rel = document.querySelectorAll("#related ~ ul a");
  if (rel.length) {
    var card = document.createElement("div");
    card.className = "aside-card";
    var ul = document.createElement("ul");
    ul.className = "aside-links";
    Array.prototype.slice.call(rel, 0, 4).forEach(function (a) {
      var li = document.createElement("li"), l = document.createElement("a");
      l.href = a.getAttribute("href");
      l.textContent = a.textContent;
      li.appendChild(l);
      ul.appendChild(li);
    });
    var h = document.createElement("h3");
    h.textContent = "More guides";
    card.appendChild(h);
    card.appendChild(ul);
    aside.appendChild(card);
  }
})();
