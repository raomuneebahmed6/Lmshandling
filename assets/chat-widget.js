/* LMSHandling site chat widget — client-side FAQ matcher with WhatsApp handoff.
   No backend: answers come from /assets/chat-faqs.json (the site's own published FAQ content). */
(function () {
  "use strict";

  var WA_NUMBER = "923295209868";
  var FAQ_URL = "/assets/chat-faqs.json";
  var HISTORY_KEY = "lms_chat_history_v1";
  var OPEN_KEY = "lms_chat_open_v1";

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

  function tokenize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(function (t) { return t.length > 1 && !STOP[t]; });
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
    "#lms-chat-toggle{position:fixed;bottom:5.4rem;right:1.3rem;z-index:91;width:56px;height:56px;border-radius:50%;" +
    "background:linear-gradient(135deg,#00448B,#032B57);color:#fff;display:grid;place-items:center;cursor:pointer;" +
    "box-shadow:0 12px 30px -8px rgba(0,68,139,.55);transition:transform .2s;border:0;font-size:26px;line-height:1}" +
    "#lms-chat-toggle:hover{transform:scale(1.07)}" +
    "#lms-chat-toggle .lms-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#F5B301;" +
    "border:2px solid #fff}" +
    "@media (max-width:600px){#lms-chat-toggle{bottom:4.7rem;right:1rem;width:50px;height:50px;font-size:22px}}" +
    "#lms-chat-panel{position:fixed;bottom:5.4rem;right:1.3rem;z-index:95;width:360px;max-width:calc(100vw - 2rem);" +
    "height:min(560px,75vh);background:#FFFFFF;border-radius:20px;box-shadow:0 18px 50px -18px rgba(0,68,139,.4);" +
    "display:none;flex-direction:column;overflow:hidden;font-family:'Poppins',system-ui,sans-serif;border:1px solid rgba(0,68,139,.14)}" +
    "#lms-chat-panel.lms-open{display:flex}" +
    "@media (max-width:600px){#lms-chat-panel{right:.6rem;left:.6rem;width:auto;bottom:4.7rem;height:min(70vh,520px)}}" +
    "#lms-chat-head{background:linear-gradient(90deg,#032B57,#00448B);color:#fff;padding:.9rem 1rem;display:flex;align-items:center;gap:.7rem;flex:0 0 auto}" +
    "#lms-chat-head .lms-avatar{width:36px;height:36px;border-radius:50%;background:#fff;display:grid;place-items:center;" +
    "font-weight:800;color:#032B57;font-size:.72rem;flex:0 0 auto}" +
    "#lms-chat-head .lms-title{font-weight:700;font-size:.92rem;line-height:1.25}" +
    "#lms-chat-head .lms-sub{font-size:.68rem;color:#CFE0F5;display:flex;align-items:center;gap:.3rem}" +
    "#lms-chat-head .lms-sub::before{content:'';width:6px;height:6px;border-radius:50%;background:#4ADE80}" +
    "#lms-chat-close{margin-left:auto;background:rgba(255,255,255,.15);border:0;color:#fff;width:26px;height:26px;border-radius:50%;" +
    "cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center}" +
    "#lms-chat-body{flex:1;overflow-y:auto;padding:.9rem;display:flex;flex-direction:column;gap:.55rem;background:#F4F8FD}" +
    ".lms-msg{max-width:86%;padding:.6rem .8rem;border-radius:14px;font-size:.83rem;line-height:1.45;white-space:pre-wrap}" +
    ".lms-msg.bot{align-self:flex-start;background:#fff;color:#2A4562;border:1px solid rgba(0,68,139,.13);border-bottom-left-radius:4px}" +
    ".lms-msg.user{align-self:flex-end;background:#00448B;color:#fff;border-bottom-right-radius:4px}" +
    ".lms-msg .lms-src{display:block;margin-top:.4rem;font-size:.68rem;color:#5A7396}" +
    ".lms-msg .lms-src a{color:#00448B;font-weight:600;text-decoration:underline}" +
    ".lms-wa-btn{display:inline-flex;align-items:center;gap:.4rem;margin-top:.55rem;background:#22C55E;color:#fff;" +
    "font-size:.76rem;font-weight:700;padding:.45rem .8rem;border-radius:999px;text-decoration:none}" +
    ".lms-wa-btn:hover{background:#16A34A}" +
    "#lms-chat-chips{display:flex;flex-wrap:wrap;gap:.4rem;padding:0 .9rem .7rem}" +
    ".lms-chip{background:#fff;border:1px solid rgba(0,68,139,.18);color:#00448B;font-size:.72rem;font-weight:600;" +
    "padding:.4rem .7rem;border-radius:999px;cursor:pointer}" +
    ".lms-chip:hover{background:#FFF3D1;border-color:#F5B301}" +
    "#lms-chat-form{flex:0 0 auto;display:flex;gap:.5rem;padding:.7rem;border-top:1px solid rgba(0,68,139,.13);background:#fff}" +
    "#lms-chat-input{flex:1;border:1.5px solid rgba(0,68,139,.18);border-radius:999px;padding:.55rem .9rem;font:inherit;" +
    "font-size:.83rem;outline:0;color:#032B57;background:#F4F8FD}" +
    "#lms-chat-input:focus{border-color:#F5B301}" +
    "#lms-chat-send{background:#F5B301;border:0;color:#032B57;width:38px;height:38px;border-radius:50%;flex:0 0 auto;" +
    "cursor:pointer;font-size:16px;display:grid;place-items:center}" +
    "#lms-chat-send:hover{background:#F7971E}" +
    ".lms-typing{align-self:flex-start;display:flex;gap:3px;padding:.6rem .8rem;background:#fff;border-radius:14px;" +
    "border:1px solid rgba(0,68,139,.13)}" +
    ".lms-typing span{width:6px;height:6px;border-radius:50%;background:#00448B;opacity:.4;animation:lms-blink 1s infinite}" +
    ".lms-typing span:nth-child(2){animation-delay:.15s}.lms-typing span:nth-child(3){animation-delay:.3s}" +
    "@keyframes lms-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}";

  function injectStyle() {
    var s = document.createElement("style");
    s.id = "lms-chat-widget-styles";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function saveHistory(history, isOpen) {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      sessionStorage.setItem(OPEN_KEY, isOpen ? "1" : "0");
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function wasOpen() {
    try { return sessionStorage.getItem(OPEN_KEY) === "1"; } catch (e) { return false; }
  }

  var TOP_CHIPS = [
    "VU Summer Semester fee?",
    "How to check my VU result?",
    "Midterm files for my subject",
    "Talk to a human on WhatsApp"
  ];

  function buildDom() {
    var toggle = document.createElement("button");
    toggle.id = "lms-chat-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Chat with us");
    toggle.innerHTML = "💬<span class=\"lms-badge\"></span>";
    document.body.appendChild(toggle);

    var panel = document.createElement("div");
    panel.id = "lms-chat-panel";
    panel.innerHTML =
      "<div id=\"lms-chat-head\">" +
        "<div class=\"lms-avatar\">NH</div>" +
        "<div><div class=\"lms-title\">Ask Nibaha Haq</div><div class=\"lms-sub\">Usually replies fast</div></div>" +
        "<button id=\"lms-chat-close\" type=\"button\" aria-label=\"Close chat\">&#10005;</button>" +
      "</div>" +
      "<div id=\"lms-chat-body\"></div>" +
      "<div id=\"lms-chat-chips\"></div>" +
      "<form id=\"lms-chat-form\">" +
        "<input id=\"lms-chat-input\" type=\"text\" autocomplete=\"off\" placeholder=\"Ask about fees, results, files...\">" +
        "<button id=\"lms-chat-send\" type=\"submit\" aria-label=\"Send\">&#10148;</button>" +
      "</form>";
    document.body.appendChild(panel);

    return { toggle: toggle, panel: panel, body: panel.querySelector("#lms-chat-body"),
      chips: panel.querySelector("#lms-chat-chips"), form: panel.querySelector("#lms-chat-form"),
      input: panel.querySelector("#lms-chat-input"), close: panel.querySelector("#lms-chat-close") };
  }

  function addMessage(body, history, role, html, persist) {
    var el = document.createElement("div");
    el.className = "lms-msg " + role;
    el.innerHTML = html;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    if (persist !== false) history.push({ role: role, html: html });
  }

  function renderChip(chips, label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lms-chip";
    b.textContent = label;
    b.addEventListener("click", onClick);
    chips.appendChild(b);
  }

  function answerHtml(faq, userText) {
    var out = escapeHtml(faq.a);
    if (faq.url && faq.page) {
      out += "<span class=\"lms-src\">From: <a href=\"" + faq.url + "\">" + escapeHtml(faq.page) + "</a></span>";
    }
    var waText = "Hello Nibaha Haq, I asked your website chatbot: \"" + userText + "\" - can you help further?";
    out += "<a class=\"lms-wa-btn\" target=\"_blank\" rel=\"noopener\" href=\"" + waLink(waText) + "\">Continue on WhatsApp &rarr;</a>";
    return out;
  }

  function fallbackHtml(userText) {
    var out = "I don't have a specific note on that yet, but Nibaha can help directly.";
    var waText = "Hello Nibaha Haq, I asked your website chatbot: \"" + userText + "\" - can you help me with this?";
    out += "<a class=\"lms-wa-btn\" target=\"_blank\" rel=\"noopener\" href=\"" + waLink(waText) + "\">Ask on WhatsApp &rarr;</a>";
    return out;
  }

  function init() {
    injectStyle();
    var dom = buildDom();
    var faqs = null;
    var history = loadHistory() || [];
    var isOpen = false;

    function setOpen(open) {
      isOpen = open;
      dom.panel.classList.toggle("lms-open", open);
      if (open) dom.input.focus();
      saveHistory(history, isOpen);
    }

    dom.toggle.addEventListener("click", function () { setOpen(!isOpen); });
    dom.close.addEventListener("click", function () { setOpen(false); });

    function renderChips() {
      dom.chips.innerHTML = "";
      TOP_CHIPS.forEach(function (label) {
        renderChip(dom.chips, label, function () {
          dom.input.value = label.replace(" on WhatsApp", "");
          handleSend();
        });
      });
    }

    function greet() {
      var greetHtml = "Hi! 👋 Ask me about VU registration, Midterm/Finalterm files, results, FYP, or anything else. If I can't answer, I'll connect you straight to Nibaha on WhatsApp.";
      addMessage(dom.body, history, "bot", greetHtml);
      renderChips();
      saveHistory(history, isOpen);
    }

    function restore() {
      if (history.length) {
        history.forEach(function (m) {
          var el = document.createElement("div");
          el.className = "lms-msg " + m.role;
          el.innerHTML = m.html;
          dom.body.appendChild(el);
        });
        dom.body.scrollTop = dom.body.scrollHeight;
        renderChips();
      } else {
        greet();
      }
    }

    function handleSend() {
      var text = dom.input.value.trim();
      if (!text) return;
      dom.input.value = "";
      addMessage(dom.body, history, "user", escapeHtml(text));
      saveHistory(history, isOpen);

      var typing = document.createElement("div");
      typing.className = "lms-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      dom.body.appendChild(typing);
      dom.body.scrollTop = dom.body.scrollHeight;

      setTimeout(function () {
        typing.remove();
        if (!faqs) {
          addMessage(dom.body, history, "bot", fallbackHtml(text));
        } else {
          var matches = bestMatches(text, faqs, 1);
          if (matches.length) {
            addMessage(dom.body, history, "bot", answerHtml(matches[0].faq, text));
          } else {
            addMessage(dom.body, history, "bot", fallbackHtml(text));
          }
        }
        saveHistory(history, isOpen);
      }, 380);
    }

    dom.form.addEventListener("submit", function (e) {
      e.preventDefault();
      handleSend();
    });

    restore();
    if (wasOpen()) setOpen(true);

    fetch(FAQ_URL).then(function (r) { return r.json(); }).then(function (data) {
      data.forEach(function (f) {
        f._qTokens = tokenize(f.q);
        f._aTokens = tokenize(f.a);
      });
      faqs = data;
    }).catch(function () { faqs = []; });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
