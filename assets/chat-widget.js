/* Site chat widget — client-side FAQ matcher with WhatsApp handoff.
   No backend: answers come from /assets/chat-faqs.json (the site's own published FAQ content). */
(function () {
  "use strict";

  var WA_NUMBER = "923295209868";
  var FAQ_URL = "/assets/chat-faqs.json";

  var STOPWORDS = (
    "a an the is are was were be been being to of for in on at by with and or " +
    "do does did i you he she it we they my your his her its our their this that " +
    "what when where how why which who whom can could should would will shall " +
    "me us them not no yes please help need want know tell about " +
    "ka ki ke ko hai hain ha ho hoon kya krna kro kren mein main mujhe humain aap " +
    "se ya aur bhi to bta btao pta plz"
  ).split(/\s+/);
  var STOP = {};
  for (var i = 0; i < STOPWORDS.length; i++) STOP[STOPWORDS[i]] = true;

  // Light heuristic stemmer so word forms like "announced" / "announcement",
  // or "file" / "notes", overlap as the same token instead of missing each
  // other on exact string comparison.
  function stem(t) {
    if (t.length > 6 && /ment$/.test(t)) t = t.slice(0, -4);
    else if (t.length > 6 && /tion$/.test(t)) t = t.slice(0, -4);
    else if (t.length > 5 && /ing$/.test(t)) t = t.slice(0, -3);
    else if (t.length > 4 && /ed$/.test(t)) t = t.slice(0, -2);
    if (t.length > 3 && /s$/.test(t) && !/ss$/.test(t)) t = t.slice(0, -1);
    if (t.length > 3 && /e$/.test(t)) t = t.slice(0, -1);
    return t;
  }

  function tokenize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 && !STOP[t]; })
      .map(stem);
  }

  function scoreFaq(queryTokens, faq) {
    var qTokens = faq._qTokens, aTokens = faq._aTokens;
    var qMatchCount = 0, aMatchCount = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      var t = queryTokens[i];
      if (qTokens.indexOf(t) !== -1) qMatchCount++;
      else if (aTokens.indexOf(t) !== -1) aMatchCount++;
    }
    return { qMatchCount: qMatchCount, score: qMatchCount * 3 + aMatchCount };
  }

  // Require real overlap with the FAQ's *question* text (not just an incidental
  // word inside a long answer) before treating something as a confident match.
  var MIN_SCORE = 3;
  var MIN_Q_MATCHES = 1;

  function bestMatches(query, faqs, n) {
    var qTokens = tokenize(query);
    if (!qTokens.length) return [];
    var scored = faqs.map(function (f) {
      var s = scoreFaq(qTokens, f);
      return { faq: f, score: s.score, qMatchCount: s.qMatchCount };
    }).filter(function (s) {
      return s.qMatchCount >= MIN_Q_MATCHES && s.score >= MIN_SCORE;
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, n || 1);
  }

  function waLink(text) {
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(text);
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var STYLE = "" +
    "#nh-chat-toggle{position:fixed;bottom:5.4rem;right:1.3rem;z-index:91;width:58px;height:58px;border-radius:50%;" +
    "background:linear-gradient(135deg,#00448B,#032B57);color:#fff;display:grid;place-items:center;cursor:pointer;" +
    "box-shadow:0 12px 30px -8px rgba(0,68,139,.55);transition:transform .2s;border:0;font-size:26px;line-height:1}" +
    "#nh-chat-toggle::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(0,68,139,.35);" +
    "animation:nh-pulse-ring 2.4s ease-out infinite}" +
    "#nh-chat-toggle:hover{transform:scale(1.07)}" +
    "#nh-chat-toggle.nh-hide{transform:scale(0);opacity:0;pointer-events:none}" +
    "#nh-chat-dismiss{position:fixed;bottom:calc(5.4rem + 44px);right:.9rem;z-index:92;width:24px;height:24px;border-radius:50%;border:2px solid #fff;" +
    "background:#475569;color:#fff;font-size:12px;line-height:1;display:grid;place-items:center;cursor:pointer;padding:0;box-shadow:0 4px 10px rgba(0,0,0,.25)}" +
    "#nh-chat-dismiss:hover{background:#B91C1C}" +
    "#nh-chat-dismiss.nh-hide{display:none}" +
    "@media (max-width:600px){#nh-chat-dismiss{bottom:calc(4.7rem + 38px);right:.55rem}}" +
    "#nh-chat-toggle .nh-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#F5B301;" +
    "border:2px solid #fff}" +
    "@keyframes nh-pulse-ring{0%{transform:scale(.9);opacity:.7}70%{transform:scale(1.25);opacity:0}100%{opacity:0}}" +
    "@media (max-width:600px){#nh-chat-toggle{bottom:4.7rem;right:1rem;width:52px;height:52px;font-size:22px}}" +
    "#nh-chat-panel{position:fixed;bottom:5.4rem;right:1.3rem;z-index:130;width:372px;max-width:calc(100vw - 2rem);" +
    "height:min(560px,calc(100vh - 13rem));background:#FFFFFF;border-radius:22px;box-shadow:0 22px 60px -16px rgba(0,68,139,.45);" +
    "display:none;flex-direction:column;overflow:hidden;font-family:'Poppins',system-ui,sans-serif;border:1px solid rgba(0,68,139,.14);" +
    "opacity:0;transform:translateY(14px) scale(.97);transition:opacity .22s ease,transform .22s ease}" +
    "#nh-chat-panel.nh-open{display:flex}" +
    "#nh-chat-panel.nh-show{opacity:1;transform:translateY(0) scale(1)}" +
    "@media (max-width:600px){#nh-chat-panel{right:.6rem;left:.6rem;width:auto;bottom:4.7rem;height:min(72vh,calc(100vh - 12rem))}}" +
    "#nh-chat-accent{height:4px;flex:0 0 auto;background:linear-gradient(90deg,#F5B301,#F7971E,#ED4E96,#00448B)}" +
    "#nh-chat-head{background:linear-gradient(90deg,#032B57,#00448B);color:#fff;padding:1rem 1.1rem;display:flex;align-items:center;gap:.7rem;flex:0 0 auto}" +
    "#nh-chat-head .nh-avatar{width:40px;height:40px;border-radius:50%;flex:0 0 auto;padding:2px;" +
    "background:linear-gradient(135deg,#F5B301,#F7971E,#ED4E96)}" +
    "#nh-chat-head .nh-avatar span{width:100%;height:100%;border-radius:50%;background:#fff;display:grid;place-items:center;" +
    "font-weight:800;color:#032B57;font-size:.74rem}" +
    "#nh-chat-head .nh-title{font-weight:700;font-size:.94rem;line-height:1.25}" +
    "#nh-chat-head .nh-sub{font-size:.68rem;color:#CFE0F5;display:flex;align-items:center;gap:.3rem}" +
    "#nh-chat-head .nh-sub::before{content:'';width:6px;height:6px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 3px rgba(74,222,128,.25)}" +
    "#nh-chat-close{margin-left:auto;background:rgba(255,255,255,.15);border:0;color:#fff;width:28px;height:28px;border-radius:50%;" +
    "cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center;transition:background .15s}" +
    "#nh-chat-close:hover{background:rgba(255,255,255,.3)}" +
    "#nh-chat-body{flex:1;overflow-y:auto;padding:1rem .9rem;display:flex;flex-direction:column;gap:.6rem;background:#F4F8FD}" +
    ".nh-msg{max-width:86%;padding:.62rem .85rem;border-radius:15px;font-size:.83rem;line-height:1.45;white-space:pre-wrap;" +
    "animation:nh-msg-in .18s ease}" +
    "@keyframes nh-msg-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}" +
    ".nh-msg.bot{align-self:flex-start;background:#fff;color:#2A4562;border:1px solid rgba(0,68,139,.13);border-bottom-left-radius:4px;" +
    "box-shadow:0 3px 10px -6px rgba(0,68,139,.2)}" +
    ".nh-msg.user{align-self:flex-end;background:linear-gradient(135deg,#00448B,#032B57);color:#fff;border-bottom-right-radius:4px}" +
    ".nh-msg .nh-src{display:block;margin-top:.4rem;font-size:.68rem;color:#5A7396}" +
    ".nh-msg .nh-src a{color:#00448B;font-weight:600;text-decoration:underline}" +
    ".nh-wa-btn{display:inline-flex;align-items:center;gap:.4rem;margin-top:.55rem;background:#22C55E;color:#fff;" +
    "font-size:.76rem;font-weight:700;padding:.45rem .8rem;border-radius:999px;text-decoration:none}" +
    ".nh-wa-btn:hover{background:#16A34A}" +
    "#nh-chat-chips{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;padding:0 .9rem .8rem}" +
    ".nh-chip{background:#fff;border:1px solid rgba(0,68,139,.15);color:#032B57;font-size:.72rem;font-weight:600;" +
    "padding:.6rem .55rem;border-radius:14px;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:.3rem;" +
    "line-height:1.25;transition:transform .12s,box-shadow .12s,border-color .12s;box-shadow:0 2px 8px -6px rgba(0,68,139,.25)}" +
    ".nh-chip .nh-chip-ic{font-size:1rem;line-height:1}" +
    ".nh-chip:hover{border-color:#F5B301;background:#FFFBF0;transform:translateY(-1px);box-shadow:0 6px 14px -8px rgba(245,179,1,.5)}" +
    ".nh-chip.nh-chip-wa{background:linear-gradient(135deg,#22C55E,#16A34A);border-color:transparent;color:#fff}" +
    ".nh-chip.nh-chip-wa:hover{background:linear-gradient(135deg,#16A34A,#15803D);box-shadow:0 6px 14px -8px rgba(22,163,74,.55)}" +
    "#nh-chat-form{flex:0 0 auto;display:flex;gap:.5rem;padding:.7rem;border-top:1px solid rgba(0,68,139,.13);background:#fff}" +
    "#nh-chat-input{flex:1;border:1.5px solid rgba(0,68,139,.18);border-radius:999px;padding:.55rem .9rem;font:inherit;" +
    "font-size:.83rem;outline:0;color:#032B57;background:#F4F8FD}" +
    "#nh-chat-input:focus{border-color:#F5B301}" +
    "#nh-chat-send{background:#F5B301;border:0;color:#032B57;width:38px;height:38px;border-radius:50%;flex:0 0 auto;" +
    "cursor:pointer;font-size:16px;display:grid;place-items:center;transition:background .15s}" +
    "#nh-chat-send:hover{background:#F7971E}" +
    ".nh-typing{align-self:flex-start;display:flex;gap:3px;padding:.6rem .8rem;background:#fff;border-radius:14px;" +
    "border:1px solid rgba(0,68,139,.13)}" +
    ".nh-typing span{width:6px;height:6px;border-radius:50%;background:#00448B;opacity:.4;animation:nh-blink 1s infinite}" +
    ".nh-typing span:nth-child(2){animation-delay:.15s}.nh-typing span:nth-child(3){animation-delay:.3s}" +
    "@keyframes nh-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}";

  function injectStyle() {
    var s = document.createElement("style");
    s.id = "nh-chat-widget-styles";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // Every visitor always starts a brand-new chat — no history is restored across
  // page loads or return visits.
  var TOP_CHIPS = [
    { icon: "📘", label: "What notes do you offer?", query: "What do you provide?" },
    { icon: "⚡", label: "How fast is delivery?", query: "How fast will I receive my file after ordering?" },
    { icon: "💳", label: "How do I pay?", query: "How do I pay for a file?" },
    { icon: "💬", label: "Talk to a human", wa: true }
  ];

  function buildDom() {
    var toggle = document.createElement("button");
    toggle.id = "nh-chat-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Chat with us");
    toggle.innerHTML = "💬<span class=\"nh-badge\"></span>";
    document.body.appendChild(toggle);
    var dismiss = document.createElement("button");
    dismiss.id = "nh-chat-dismiss";
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Hide the chat button");
    dismiss.title = "Hide chat";
    dismiss.innerHTML = "&#10005;";
    document.body.appendChild(dismiss);

    var panel = document.createElement("div");
    panel.id = "nh-chat-panel";
    panel.innerHTML =
      "<div id=\"nh-chat-accent\"></div>" +
      "<div id=\"nh-chat-head\">" +
        "<div class=\"nh-avatar\"><span>NH</span></div>" +
        "<div><div class=\"nh-title\">Ask Nibaha Haq</div><div class=\"nh-sub\">Usually replies fast</div></div>" +
        "<button id=\"nh-chat-close\" type=\"button\" aria-label=\"Close chat\">&#10005;</button>" +
      "</div>" +
      "<div id=\"nh-chat-body\"></div>" +
      "<div id=\"nh-chat-chips\"></div>" +
      "<form id=\"nh-chat-form\">" +
        "<input id=\"nh-chat-input\" type=\"text\" autocomplete=\"off\" placeholder=\"Ask about fees, results, notes...\">" +
        "<button id=\"nh-chat-send\" type=\"submit\" aria-label=\"Send\">&#10148;</button>" +
      "</form>";
    document.body.appendChild(panel);

    return { toggle: toggle, dismiss: dismiss, panel: panel, body: panel.querySelector("#nh-chat-body"),
      chips: panel.querySelector("#nh-chat-chips"), form: panel.querySelector("#nh-chat-form"),
      input: panel.querySelector("#nh-chat-input"), close: panel.querySelector("#nh-chat-close") };
  }

  function addMessage(body, role, html) {
    var el = document.createElement("div");
    el.className = "nh-msg " + role;
    el.innerHTML = html;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function renderChip(chips, chip, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "nh-chip" + (chip.wa ? " nh-chip-wa" : "");
    b.innerHTML = "<span class=\"nh-chip-ic\">" + chip.icon + "</span><span>" + escapeHtml(chip.label) + "</span>";
    b.addEventListener("click", onClick);
    chips.appendChild(b);
  }

  function answerHtml(faq, userText) {
    var out = escapeHtml(faq.a);
    if (faq.url && faq.page) {
      out += "<span class=\"nh-src\">From: <a href=\"" + faq.url + "\">" + escapeHtml(faq.page) + "</a></span>";
    }
    var waText = "Hello Nibaha Haq, I asked your website chatbot: \"" + userText + "\" - can you help further?";
    out += "<a class=\"nh-wa-btn\" target=\"_blank\" rel=\"noopener\" href=\"" + waLink(waText) + "\">Continue on WhatsApp &rarr;</a>";
    return out;
  }

  function fallbackHtml(userText) {
    var out = "I don't have a specific note on that yet, but Nibaha can help directly.";
    var waText = "Hello Nibaha Haq, I asked your website chatbot: \"" + userText + "\" - can you help me with this?";
    out += "<a class=\"nh-wa-btn\" target=\"_blank\" rel=\"noopener\" href=\"" + waLink(waText) + "\">Ask on WhatsApp &rarr;</a>";
    return out;
  }

  var HIDE_KEY = "lmsChatHiddenUntil";
  function chatHidden() {
    try { return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now(); } catch (e) { return false; }
  }

  function init() {
    if (chatHidden()) return;
    injectStyle();
    var dom = buildDom();
    var faqs = null;
    var faqsReady = null;
    var loadFaqsRef = null;
    var isOpen = false;

    function setOpen(open) {
      isOpen = open;
      if (open) {
        dom.panel.classList.add("nh-open");
        requestAnimationFrame(function () { dom.panel.classList.add("nh-show"); });
        dom.toggle.classList.add("nh-hide");
        dom.dismiss.classList.add("nh-hide");
        dom.input.focus();
      } else {
        dom.panel.classList.remove("nh-show");
        dom.toggle.classList.remove("nh-hide");
        dom.dismiss.classList.remove("nh-hide");
        setTimeout(function () { dom.panel.classList.remove("nh-open"); }, 220);
      }
    }

    dom.toggle.addEventListener("click", function () { if (loadFaqsRef) loadFaqsRef(); setOpen(!isOpen); });
    dom.close.addEventListener("click", function () { setOpen(false); });
    dom.dismiss.addEventListener("click", function () {
      try { localStorage.setItem(HIDE_KEY, String(Date.now() + 3 * 86400000)); } catch (e) {}
      dom.toggle.remove(); dom.dismiss.remove(); dom.panel.remove();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) setOpen(false); });

    function sendQuery(text) {
      dom.input.value = "";
      addMessage(dom.body, "user", escapeHtml(text));

      var typing = document.createElement("div");
      typing.className = "nh-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      dom.body.appendChild(typing);
      dom.body.scrollTop = dom.body.scrollHeight;

      var ready = loadFaqsRef ? loadFaqsRef() : Promise.resolve();
      setTimeout(function () {
        ready.then(function () {
          typing.remove();
          if (!faqs) {
            addMessage(dom.body, "bot", fallbackHtml(text));
          } else {
            var matches = bestMatches(text, faqs, 1);
            if (matches.length) {
              addMessage(dom.body, "bot", answerHtml(matches[0].faq, text));
            } else {
              addMessage(dom.body, "bot", fallbackHtml(text));
            }
          }
        });
      }, 380);
    }

    function renderChips() {
      dom.chips.innerHTML = "";
      TOP_CHIPS.forEach(function (chip) {
        renderChip(dom.chips, chip, function () {
          if (chip.wa) {
            addMessage(dom.body, "user", escapeHtml(chip.label));
            var waText = "Hello Nibaha Haq, I'd like some help please.";
            addMessage(dom.body, "bot",
              "Sure, connecting you to Nibaha directly." +
              "<a class=\"nh-wa-btn\" target=\"_blank\" rel=\"noopener\" href=\"" + waLink(waText) + "\">Open WhatsApp &rarr;</a>");
          } else {
            sendQuery(chip.query);
          }
        });
      });
    }

    function greet() {
      var greetHtml = "Hi! 👋 Ask me about Midterm notes, Finalterm notes, notes or how to order, or tap a question below. If I can't answer, I'll connect you straight to Nibaha on WhatsApp.";
      addMessage(dom.body, "bot", greetHtml);
      renderChips();
    }

    dom.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = dom.input.value.trim();
      if (!text) return;
      sendQuery(text);
    });

    // Every page load starts a fresh chat — no old conversation is restored.
    greet();

    // The FAQ file is ~140 KB and tokenising it is main-thread work, so it is NOT loaded with
    // the page: it loads when the chat is first opened (or a few seconds after load, whichever
    // comes first), and answers wait for it.
    function loadFaqs() {
      if (faqsReady) return faqsReady;
      faqsReady = fetch(FAQ_URL).then(function (r) { return r.json(); }).then(function (data) {
        data.forEach(function (f) {
          f._qTokens = tokenize(f.q);
          f._aTokens = tokenize(f.a);
        });
        faqs = data;
      }).catch(function () { faqs = []; });
      return faqsReady;
    }
    loadFaqsRef = loadFaqs;
    window.addEventListener("load", function () { setTimeout(loadFaqs, 8000); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
