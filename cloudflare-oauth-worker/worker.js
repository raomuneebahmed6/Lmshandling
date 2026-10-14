// lmshandling.com Blog Studio backend (Cloudflare Worker + KV).
//
// Routes (see wrangler.toml):  /auth*  /callback*  /api/*
//
// What it does
//  1. Username/password accounts for the admin panel (PBKDF2 hashes in KV,
//     signed HttpOnly session cookie). No GitHub login needed day to day.
//  2. One-time "Connect GitHub": the repo owner authorises the OAuth app once;
//     the token is encrypted and kept in KV. Every API call to GitHub is made
//     here, by the Worker, with that token, and only for an allow-listed set
//     of repo endpoints. The token never reaches the browser.
//
// Worker secrets:  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
// KV binding:      CMS
// Vars:            REPO (default raomuneebahmed6/Lmshandling), ALLOWED_ORIGIN

const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 100000; // Workers cap PBKDF2 at 100k (login throttling covers the rest)
const MIN_PASSWORD = 10;
const DRAFTS_BRANCH = "blog-drafts";
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- small helpers ---------- */
const b64u = {
  enc(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

/* ---------- TOTP (authenticator app) helpers ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32enc(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32dec(s) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(s).toUpperCase().replace(/=+$/, "")) {
    const i = B32.indexOf(ch); if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const buf = new ArrayBuffer(8), dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 4294967296)); dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf)), o = h[19] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1000000).padStart(6, "0");
}
function safeStrEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// returns the matched 30-second step (> last used one, so a code cannot be replayed) or -1
async function totpStep(secret, code, last) {
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    if (step <= last) continue;
    if (safeStrEq(await hotp(secret, step), code)) return step;
  }
  return -1;
}
async function sha256hex(s) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function newRecoveryCodes() {
  const alpha = "abcdefghjkmnpqrstuvwxyz23456789", out = [];
  for (let i = 0; i < 8; i++) {
    const r = crypto.getRandomValues(new Uint8Array(10));
    const s = [...r].map((x) => alpha[x % alpha.length]).join("");
    out.push(s.slice(0, 5) + "-" + s.slice(5));
  }
  return out;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

async function hmac(secretBytes, data) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256));
}

// AES-GCM box for the GitHub token, keyed from the OAuth client secret so a
// KV-only leak is useless.
async function aesKey(env) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("lmh-kv-box:" + env.GITHUB_CLIENT_SECRET));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(text)));
  return b64u.enc(iv) + "." + b64u.enc(ct);
}
async function unseal(env, boxed) {
  const [iv, ct] = boxed.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.dec(iv) }, await aesKey(env), b64u.dec(ct));
  return dec.decode(pt);
}

// Separate random key (kept in KV) for two-step secrets, so rotating the GitHub
// OAuth client secret never breaks anyone's authenticator.
async function boxKey(env) {
  let k = await env.CMS.get("cfg:boxkey");
  if (!k) { k = b64u.enc(crypto.getRandomValues(new Uint8Array(32))); await env.CMS.put("cfg:boxkey", k); }
  return crypto.subtle.importKey("raw", b64u.dec(k), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal2(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await boxKey(env), enc.encode(text)));
  return b64u.enc(iv) + "." + b64u.enc(ct);
}
async function unseal2(env, boxed) {
  const [iv, ct] = boxed.split(".");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.dec(iv) }, await boxKey(env), b64u.dec(ct)));
}
async function saveUser(env, u) { await env.CMS.put("user:" + u.name, JSON.stringify(u)); }

// true if `code` is a valid authenticator code or an unused recovery code for user `u`
async function check2fa(env, u, code) {
  if (/^\d{6}$/.test(code)) {
    let secret; try { secret = b32dec(await unseal2(env, u.totp.s)); } catch (e) { return false; }
    const step = await totpStep(secret, code, u.totp.last || 0);
    if (step < 0) return false;
    u.totp.last = step; await saveUser(env, u); return true;
  }
  // recovery codes look like abcde-fghij; accept them with any case, spaces or no dash
  const flat = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (flat.length !== 10) return false;
  const h = await sha256hex(flat.slice(0, 5) + "-" + flat.slice(5));
  const i = (u.totp.rc || []).indexOf(h);
  if (i < 0) return false;
  u.totp.rc.splice(i, 1); await saveUser(env, u); return true;
}

async function sessionSecret(env) {
  let s = await env.CMS.get("cfg:secret");
  if (!s) {
    s = b64u.enc(crypto.getRandomValues(new Uint8Array(32)));
    await env.CMS.put("cfg:secret", s);
  }
  return b64u.dec(s);
}

async function makeSession(env, user) {
  const payload = b64u.enc(enc.encode(JSON.stringify({ u: user.name, r: user.role, v: user.ver || 0, e: Date.now() + SESSION_HOURS * 3600 * 1000 })));
  const sig = b64u.enc(await hmac(await sessionSecret(env), payload));
  return payload + "." + sig;
}

async function readSession(env, request) {
  const m = /(?:^|;\s*)lmh_s=([^;]+)/.exec(request.headers.get("Cookie") || "");
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const expect = await hmac(await sessionSecret(env), payload);
  if (!timingSafeEqual(expect, b64u.dec(sig))) return null;
  let data;
  try { data = JSON.parse(dec.decode(b64u.dec(payload))); } catch (e) { return null; }
  if (!data.e || data.e < Date.now()) return null;
  // the account must still exist (deleted users are logged out at once)
  const u = await env.CMS.get("user:" + data.u, "json");
  if (!u) return null;
  // a password change or reset bumps `ver`, which signs out every older session
  if ((u.ver || 0) !== (data.v || 0)) return null;
  return { name: u.name, role: u.role, twofa: !!(u.totp && u.totp.on) };
}

function cookie(value, maxAge) {
  return `lmh_s=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function usersExist(env) {
  const l = await env.CMS.list({ prefix: "user:", limit: 1 });
  return l.keys.length > 0;
}

const validName = (n) => /^[a-z0-9._-]{3,32}$/.test(n);
const validPass = (p) => typeof p === "string" && p.length >= MIN_PASSWORD && p.length <= 200;
const PASS_MSG = `Password must be at least ${MIN_PASSWORD} characters`;

async function createUser(env, name, password, role, prev) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  const ver = prev ? (prev.ver || 0) + 1 : 0;
  const created = prev && prev.created ? prev.created : new Date().toISOString();
  const rec = { name, role, ver, salt: b64u.enc(salt), hash: b64u.enc(hash), created };
  if (prev && prev.totp) rec.totp = prev.totp; // a password change keeps two-step login
  await env.CMS.put("user:" + name, JSON.stringify(rec));
  return { name, role, ver };
}

// null = not connected, false = connected but cannot be decrypted (the OAuth
// client secret was rotated): the admin must press "Reconnect GitHub".
async function ghToken(env) {
  const boxed = await env.CMS.get("cfg:gh");
  if (!boxed) return null;
  try { return await unseal(env, boxed); } catch (e) { return false; }
}

/* ---------- GitHub allow-list proxy ---------- */
// Read access is broad; WRITE access is limited to exactly what the admin UI
// needs, by role. Without this an editor could rewrite scripts/ or workflow
// prompts and run code in CI with the site's FTP and Claude secrets.
const WORKFLOWS = ["write-blog.yml", "refresh-blog.yml", "seo-audit.yml"];
const UNSAFE_HTML = /<\s*(script|iframe|object|embed|form|link|meta|base|style)\b|\son[a-z]+\s*=|javascript:|data:text\/html/i;

const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function readAllowed(method, path, repo) {
  const R = escRe(repo);
  if (method === "GET") {
    return [`^repos/${R}$`, `^repos/${R}/contents/.*$`, `^repos/${R}/commits$`, `^repos/${R}/git/trees/.+$`, `^repos/${R}/actions/runs(/\\d+)?$`].some((re) => new RegExp(re).test(path));
  }
  if (method === "POST") {
    const m = new RegExp(`^repos/${R}/actions/workflows/([A-Za-z0-9._-]+)/dispatches$`).exec(path);
    return !!m && WORKFLOWS.includes(m[1]);
  }
  return false;
}

// Redirect rules end up in the live .htaccess, so they are validated strictly:
// the source must be a plain path, and the target may only be a path on this site
// or a https://lmshandling.com URL (never another domain: that would be an open redirect).
const REDIR_FROM = /^\/[A-Za-z0-9\/._-]{1,150}$/;
// A bare path must not start with "//" (that is a protocol-relative URL to ANOTHER site).
const REDIR_TO = /^(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300}|\/|https:\/\/(www\.)?lmshandling\.com(\/(?!\/)[A-Za-z0-9\/._~%?=&#-]{0,300})?)$/;
function redirectsError(text) {
  let list;
  try { list = JSON.parse(text); } catch (e) { return "Redirects file is not valid JSON"; }
  if (!Array.isArray(list) || list.length > 500) return "Invalid redirects list";
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r.from !== "string" || typeof r.to !== "string") return "Each redirect needs from and to";
    if (!REDIR_FROM.test(r.from) || r.from.includes("..") || r.from.includes("//")) return "Invalid source path: " + String(r.from).slice(0, 60);
    if (!REDIR_TO.test(r.to) || r.to.includes("..")) return "Invalid target (only paths on this site are allowed): " + String(r.to).slice(0, 60);
    const f = r.from.replace(/\/$/, "") || "/";
    if (f === "/" ) return "The homepage cannot be redirected";
    if (seen.has(f.toLowerCase())) return "Duplicate source path: " + f;
    seen.add(f.toLowerCase());
    if (r.to.replace(/\/$/, "").toLowerCase() === f.toLowerCase()) return "A redirect cannot point to itself: " + f;
    if (r.note && String(r.note).length > 140) return "Note is too long";
  }
  return null;
}

// Decide whether `role` may PUT/DELETE `file` on `branch`. Returns an error string or null.
function writeError(env, role, method, file, branch, contentB64) {
  const deploy = env.BRANCH || "claude/website-blogs-seo-3jpp70";
  if (branch !== deploy && branch !== DRAFTS_BRANCH) return "Writes to that branch are not allowed";
  if (branch === DRAFTS_BRANCH) {
    if (/^drafts\/[A-Za-z0-9._-]+\.md$/.test(file)) return null;
    if (method === "DELETE" && /^drafts\/refresh\/[A-Za-z0-9._-]+\.(md|html)$/.test(file)) return null;
    return "That draft path is not allowed";
  }
  if (method === "PUT" && /^content\/blog\/[a-z0-9-]+\.md$/.test(file)) {
    let text = "";
    try { text = dec.decode(b64u.dec(String(contentB64 || "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))); } catch (e) { return "Invalid file content"; }
    if (text.length > 400000) return "Post is too large";
    const bodyOnly = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").replace(/data-[a-z-]+="[^"]*"/g, "");
    if (UNSAFE_HTML.test(bodyOnly)) return "The post contains unsafe HTML (script, iframe, onclick, javascript: ...)";
    return null;
  }
  if (method === "PUT" && /^assets\/blog-images\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/.test(file)) {
    return String(contentB64 || "").length > 2800000 ? "Image is larger than 2 MB" : null;
  }
  if (role === "admin" && method === "PUT" && /^blog\/[a-z0-9-]+\.html$/.test(file)) return null; // approved legacy page update
  if (method === "PUT" && /^blog\/[a-z0-9-]+\.html$/.test(file)) return "Only admins can publish updates to the older hand-built pages";
  if (role === "admin" && method === "PUT" && file === "_data/redirects.json") {
    let text = "";
    try { text = dec.decode(b64u.dec(String(contentB64 || ""))); } catch (e) { return "Invalid redirects file"; }
    return redirectsError(text);
  }
  if (role === "admin" && method === "PUT" && file === ".github/cms-settings.json") {
    try { const j = JSON.parse(dec.decode(b64u.dec(String(contentB64 || "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")))); if (!j.autoUpdate) return "Invalid settings"; } catch (e) { return "Invalid settings"; }
    return null;
  }
  return "Blog Studio cannot change that file";
}

async function proxyGitHub(env, request, url, session) {
  const repo = env.REPO || "raomuneebahmed6/Lmshandling";
  const path = decodeURIComponent(url.pathname.slice("/api/gh/".length));
  if (path.includes("..")) return json({ message: "Blocked by Blog Studio" }, 403);
  const init = {
    method: request.method,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lmshandling-blog-studio" },
  };
  const contentsRe = new RegExp(`^repos/${escRe(repo)}/contents/(.+)$`);
  if (request.method === "PUT" || request.method === "DELETE") {
    const m = contentsRe.exec(path);
    if (!m) return json({ message: "Blocked by Blog Studio" }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ message: "Bad request" }, 400); }
    const err = writeError(env, session.role, request.method, m[1], body.branch, body.content);
    if (err) return json({ message: err }, 403);
    // stamp the VERIFIED account name on every change, so Activity can trust it
    body.message = String(body.message || "Update").split("\n")[0].slice(0, 200) + " [studio:" + session.name + "]";
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  } else {
    if (!readAllowed(request.method, path, repo)) return json({ message: "Blocked by Blog Studio" }, 403);
    if (request.method !== "GET") {
      let body;
      try { body = await request.json(); } catch (e) { body = {}; }
      const deploy = env.BRANCH || "claude/website-blogs-seo-3jpp70";
      if (body.ref !== deploy) return json({ message: "Workflows can only run on the site branch" }, 403);
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
  }
  const token = await ghToken(env);
  if (token === null) return json({ message: "GitHub is not connected yet" }, 409);
  if (token === false) return json({ message: "GitHub connection needs to be reconnected (Settings > GitHub connection)", reconnect: true }, 409);
  init.headers.Authorization = "Bearer " + token;
  const r = await fetch("https://api.github.com/" + path + url.search, init);
  return new Response(r.status === 204 ? null : await r.text(), {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
  });
}

/* ---------- GitHub grant (short-lived, from the OAuth popup) ---------- */
async function verifyGrant(env, grant) {
  const boxed = grant ? await env.CMS.get("grant:" + grant) : null;
  if (!boxed) return { error: "GitHub connection expired. Connect again.", status: 400 };
  let token;
  try { token = await unseal(env, boxed); } catch (e) { return { error: "GitHub connection expired. Connect again.", status: 400 }; }
  const repo = env.REPO || "raomuneebahmed6/Lmshandling";
  const r = await fetch("https://api.github.com/repos/" + repo, { headers: { Authorization: "Bearer " + token, "User-Agent": "lmshandling-blog-studio", Accept: "application/vnd.github+json" } });
  const info = await r.json().catch(() => ({}));
  if (!r.ok || !info.permissions || !info.permissions.push) return { error: "That GitHub account cannot write to the site repository.", status: 403 };
  return { token };
}

/* ---------- login throttling ---------- */
async function throttled(env, key) {
  const n = parseInt((await env.CMS.get("rl:" + key)) || "0", 10);
  return n >= 8;
}
async function recordFail(env, key) {
  const n = parseInt((await env.CMS.get("rl:" + key)) || "0", 10) + 1;
  await env.CMS.put("rl:" + key, String(n), { expirationTtl: 900 });
}

/* ---------- Google Search Console (read-only, via a service account) ---------- */
// Optional. Needs the Worker secret GSC_SERVICE_ACCOUNT (the service-account JSON key) and
// the service account's e-mail added as a (restricted) user in Search Console.
async function gscToken(env) {
  let sa; try { sa = JSON.parse(env.GSC_SERVICE_ACCOUNT); } catch (e) { return { error: "bad_config" }; }
  if (!sa.client_email || !sa.private_key) return { error: "bad_config" };
  const cached = await env.CMS.get("gsc:token", "json");
  if (cached && cached.exp > Date.now() + 120000) return { token: cached.t, email: sa.client_email };
  const now = Math.floor(Date.now() / 1000);
  const head = b64u.enc(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64u.enc(enc.encode(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now })));
  let key;
  try {
    const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch (e) { return { error: "bad_config" }; }
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + claim)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + b64u.enc(sig),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { error: "token", detail: j.error_description || j.error || "token request failed", email: sa.client_email };
  await env.CMS.put("gsc:token", JSON.stringify({ t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }), { expirationTtl: 3000 });
  return { token: j.access_token, email: sa.client_email };
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

async function gscRows(env, tok, site, body) {
  const r = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(site) + "/searchAnalytics/query", {
    method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "Search Console error"); e.status = r.status; throw e; }
  return j.rows || [];
}

async function handleGsc(env, url) {
  if (!env.GSC_SERVICE_ACCOUNT) return json({ configured: false });
  const days = [7, 28, 90].includes(+url.searchParams.get("days")) ? +url.searchParams.get("days") : 28;
  const cacheKey = "gsc:ov:" + days;
  const hit = !url.searchParams.get("fresh") && (await env.CMS.get(cacheKey, "json"));
  if (hit) return json(hit);
  const t = await gscToken(env);
  if (t.error === "bad_config") return json({ configured: true, error: "bad_config", message: "The GSC_SERVICE_ACCOUNT secret is not a valid service-account JSON key." });
  if (t.error) return json({ configured: true, error: "token", message: t.detail || "Could not sign in to Google", email: t.email });
  const sites = [env.GSC_SITE, "sc-domain:lmshandling.com", "https://lmshandling.com/"].filter(Boolean);
  const end = Date.now() - 2 * 86400000, start = end - (days - 1) * 86400000, pend = start - 86400000, pstart = pend - (days - 1) * 86400000;
  const cur = { startDate: isoDay(start), endDate: isoDay(end) }, prev = { startDate: isoDay(pstart), endDate: isoDay(pend) };
  let lastErr = null;
  for (const site of sites) {
    try {
      const [tot, ptot, daily, queries, pqueries, pages, devices] = await Promise.all([
        gscRows(env, t.token, site, { ...cur }), gscRows(env, t.token, site, { ...prev }),
        gscRows(env, t.token, site, { ...cur, dimensions: ["date"], rowLimit: 200 }),
        gscRows(env, t.token, site, { ...cur, dimensions: ["query"], rowLimit: 100 }),
        gscRows(env, t.token, site, { ...prev, dimensions: ["query"], rowLimit: 250 }),
        gscRows(env, t.token, site, { ...cur, dimensions: ["page"], rowLimit: 50 }),
        gscRows(env, t.token, site, { ...cur, dimensions: ["device"], rowLimit: 5 }),
      ]);
      const pick = (r) => r ? { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position } : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
      const pq = {}; pqueries.forEach((r) => { pq[r.keys[0]] = r; });
      const out = {
        configured: true, site, days, range: { ...cur, prevStart: prev.startDate, prevEnd: prev.endDate }, generatedAt: new Date().toISOString(),
        totals: pick(tot[0]), prevTotals: pick(ptot[0]),
        daily: daily.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions })).sort((a, b) => (a.date < b.date ? -1 : 1)),
        queries: queries.map((r) => { const p = pq[r.keys[0]]; return { q: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, prevPosition: p ? p.position : null, prevClicks: p ? p.clicks : 0 }; }),
        pages: pages.map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
        devices: devices.map((r) => ({ device: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      };
      await env.CMS.put(cacheKey, JSON.stringify(out), { expirationTtl: 10800 });
      return json(out);
    } catch (e) { lastErr = e; if (e.status !== 403 && e.status !== 404) break; }
  }
  if (lastErr && (lastErr.status === 403 || lastErr.status === 404)) return json({ configured: true, error: "permission", email: t.email, message: "Google says this account has no access to the Search Console property. Add the service-account e-mail as a user in Search Console." });
  return json({ configured: true, error: "google", message: (lastErr && lastErr.message) || "Search Console request failed" });
}

/* ---------- API ---------- */
async function handleApi(request, env, url) {
  const route = url.pathname.slice("/api".length);
  const method = request.method;

  // CSRF: SameSite=Strict cookie plus a header a cross-site form cannot send.
  if (method !== "GET" && request.headers.get("X-Studio") !== "1") return json({ message: "Bad request" }, 400);

  if (route === "/state" && method === "GET") {
    const session = await readSession(env, request);
    const t = await ghToken(env);
    return json({ setup: !(await usersExist(env)), user: session, github: t === null ? "none" : (t === false ? "broken" : "ok") });
  }

  if (route === "/login" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = String(body.username || "").toLowerCase().trim();
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if ((await throttled(env, "ip:" + ip)) || (await throttled(env, "u:" + name))) return json({ message: "Too many attempts. Try again in 15 minutes." }, 429);
    const u = await env.CMS.get("user:" + name, "json");
    // hash even for unknown users so timing does not reveal which names exist
    const salt = u ? b64u.dec(u.salt) : new Uint8Array(16);
    const hash = await hashPassword(String(body.password || ""), salt);
    if (!u || !timingSafeEqual(hash, b64u.dec(u.hash))) {
      await recordFail(env, "ip:" + ip);
      await recordFail(env, "u:" + name);
      return json({ message: "Wrong username or password" }, 401);
    }
    if (u.totp && u.totp.on) {
      const code = String(body.code || "").replace(/[\s-]/g, "");
      if (!code) return json({ need2fa: true }, 200);
      if (!(await check2fa(env, u, code))) {
        await recordFail(env, "ip:" + ip);
        await recordFail(env, "u:" + name);
        return json({ message: "Wrong code", need2fa: true }, 401);
      }
    }
    return json({ user: { name: u.name, role: u.role } }, 200, { "Set-Cookie": cookie(await makeSession(env, u), SESSION_HOURS * 3600) });
  }

  if (route === "/logout" && method === "POST") return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });

  // First-run setup: allowed once, while no account exists, and only with a
  // GitHub grant proving the person is a collaborator with push access.
  if (route === "/setup" && method === "POST") {
    if (await usersExist(env)) return json({ message: "Already set up" }, 403);
    const body = await request.json().catch(() => ({}));
    const name = String(body.username || "").toLowerCase().trim();
    if (!validName(name)) return json({ message: "Username: 3-32 letters, numbers, . _ -" }, 400);
    if (!validPass(body.password)) return json({ message: PASS_MSG }, 400);
    const g = await verifyGrant(env, body.grant);
    if (g.error) return json({ message: g.error }, g.status);
    await env.CMS.put("cfg:gh", await seal(env, g.token));
    await env.CMS.delete("grant:" + body.grant);
    const u = await createUser(env, name, body.password, "admin");
    return json({ user: { name: u.name, role: u.role } }, 200, { "Set-Cookie": cookie(await makeSession(env, u), SESSION_HOURS * 3600) });
  }

  // Forgot password: whoever can authorise the GitHub OAuth app with push
  // access to the site repository may set a new password for any account.
  // (There is no email service, so the repository itself is the proof of ownership.)
  if (route === "/recover" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await throttled(env, "rec:" + ip)) return json({ message: "Too many attempts. Try again later." }, 429);
    const name = String(body.username || "").toLowerCase().trim();
    if (!validPass(body.password)) return json({ message: PASS_MSG }, 400);
    const g = await verifyGrant(env, body.grant);
    if (g.error) { await recordFail(env, "rec:" + ip); return json({ message: g.error }, g.status); }
    const u = await env.CMS.get("user:" + name, "json");
    if (!u) return json({ message: "No account with that username" }, 404);
    // Owning the repository is the root of trust, so recovery also clears two-step login
    // (otherwise a lost phone would lock the owner out for good).
    const prev = Object.assign({}, u); delete prev.totp;
    await createUser(env, u.name, body.password, u.role, prev);
    await env.CMS.delete("grant:" + body.grant);
    return json({ ok: true });
  }

  // Everything below needs a logged-in session.
  const session = await readSession(env, request);
  if (!session) return json({ message: "Please sign in" }, 401);

  if (route === "/me") return json({ user: session });

  // any signed-in user may change their own password (current one required)
  if (route === "/me/password" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const u = await env.CMS.get("user:" + session.name, "json");
    if (!u) return json({ message: "Account not found" }, 404);
    const hash = await hashPassword(String(body.current || ""), b64u.dec(u.salt));
    if (!timingSafeEqual(hash, b64u.dec(u.hash))) return json({ message: "Current password is wrong" }, 400);
    if (!validPass(body.password)) return json({ message: PASS_MSG }, 400);
    const nu = await createUser(env, u.name, body.password, u.role, u);
    // every other signed-in browser is logged out; this one stays signed in
    return json({ ok: true }, 200, { "Set-Cookie": cookie(await makeSession(env, nu), SESSION_HOURS * 3600) });
  }

  // ---- two-step login (authenticator app), for the signed-in user's own account
  if (route === "/me/2fa/start" && method === "POST") {
    const u = await env.CMS.get("user:" + session.name, "json");
    if (!u) return json({ message: "Account not found" }, 404);
    if (u.totp && u.totp.on) return json({ message: "Two-step login is already on" }, 400);
    const secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
    u.totp = { on: false, pending: await seal2(env, secret) };
    await saveUser(env, u);
    const label = encodeURIComponent("Blog Studio:" + u.name);
    return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Blog%20Studio&digits=6&period=30` });
  }
  if (route === "/me/2fa/enable" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const u = await env.CMS.get("user:" + session.name, "json");
    if (!u || !u.totp || !u.totp.pending) return json({ message: "Start the setup first" }, 400);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await throttled(env, "u:" + u.name)) return json({ message: "Too many attempts. Try again in 15 minutes." }, 429);
    let secret; try { secret = b32dec(await unseal2(env, u.totp.pending)); } catch (e) { return json({ message: "Start the setup again" }, 400); }
    const step = await totpStep(secret, String(body.code || "").replace(/\s/g, ""), 0);
    if (step < 0) { await recordFail(env, "ip:" + ip); await recordFail(env, "u:" + u.name); return json({ message: "That code is not right. Check the time on your phone and try the next code." }, 400); }
    const codes = newRecoveryCodes();
    u.totp = { on: true, s: u.totp.pending, last: step, rc: await Promise.all(codes.map((c) => sha256hex(c))) };
    u.ver = (u.ver || 0) + 1; // other devices are signed out; this one gets a fresh session below
    await saveUser(env, u);
    return json({ ok: true, recovery: codes }, 200, { "Set-Cookie": cookie(await makeSession(env, u), SESSION_HOURS * 3600) });
  }
  if (route === "/me/2fa/disable" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const u = await env.CMS.get("user:" + session.name, "json");
    if (!u || !u.totp || !u.totp.on) return json({ message: "Two-step login is not on" }, 400);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await throttled(env, "u:" + u.name)) return json({ message: "Too many attempts. Try again in 15 minutes." }, 429);
    const pw = await hashPassword(String(body.password || ""), b64u.dec(u.salt));
    const code = String(body.code || "").replace(/[\s-]/g, "");
    if (!timingSafeEqual(pw, b64u.dec(u.hash)) || !(await check2fa(env, u, code))) { await recordFail(env, "ip:" + ip); await recordFail(env, "u:" + u.name); return json({ message: "Password or code is wrong" }, 400); }
    delete u.totp; await saveUser(env, u);
    return json({ ok: true });
  }

  if (route === "/gsc/overview" && method === "GET") return handleGsc(env, url);

  if (route.startsWith("/gh/")) return proxyGitHub(env, request, url, session);

  // ---- admin-only: users and GitHub connection
  if (session.role !== "admin") return json({ message: "Admins only" }, 403);

  if (route === "/users" && method === "GET") {
    const l = await env.CMS.list({ prefix: "user:" });
    const users = [];
    for (const k of l.keys) {
      const u = await env.CMS.get(k.name, "json");
      if (u) users.push({ name: u.name, role: u.role, created: u.created, twofa: !!(u.totp && u.totp.on) });
    }
    return json({ users });
  }
  if (route === "/users" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = String(body.username || "").toLowerCase().trim();
    if (!validName(name)) return json({ message: "Username: 3-32 letters, numbers, . _ -" }, 400);
    if (!validPass(body.password)) return json({ message: PASS_MSG }, 400);
    if (await env.CMS.get("user:" + name)) return json({ message: "That username already exists" }, 409);
    await createUser(env, name, body.password, body.role === "admin" ? "admin" : "editor");
    return json({ ok: true });
  }
  let m = /^\/users\/([a-z0-9._-]+)$/.exec(route);
  if (m && method === "DELETE") {
    if (m[1] === session.name) return json({ message: "You cannot delete your own account" }, 400);
    await env.CMS.delete("user:" + m[1]);
    return json({ ok: true });
  }
  m = /^\/users\/([a-z0-9._-]+)\/password$/.exec(route);
  if (m && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const u = await env.CMS.get("user:" + m[1], "json");
    if (!u) return json({ message: "No such user" }, 404);
    if (!validPass(body.password)) return json({ message: PASS_MSG }, 400);
    await createUser(env, u.name, body.password, u.role, u); // bumps the version: that user is signed out everywhere
    return json({ ok: true });
  }
  m = /^\/users\/([a-z0-9._-]+)\/2fa\/reset$/.exec(route);
  if (m && method === "POST") {
    const u = await env.CMS.get("user:" + m[1], "json");
    if (!u) return json({ message: "No such user" }, 404);
    delete u.totp; u.ver = (u.ver || 0) + 1; // lost phone: clear it and sign that user out everywhere
    await saveUser(env, u);
    return json({ ok: true });
  }
  if (route === "/github/connect" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const g = await verifyGrant(env, body.grant);
    if (g.error) return json({ message: g.error }, g.status);
    await env.CMS.put("cfg:gh", await seal(env, g.token));
    await env.CMS.delete("grant:" + body.grant);
    return json({ ok: true });
  }

  return json({ message: "Not found" }, 404);
}

/* ---------- GitHub OAuth popup (one-time connect) ---------- */
async function handleOAuth(request, env, url) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://lmshandling.com";

  if (url.pathname === "/auth") {
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/callback`);
    authorizeUrl.searchParams.set("scope", "repo");
    return Response.redirect(authorizeUrl.toString(), 302);
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code parameter", { status: 400 });
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return new Response(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`, { status: 400 });

    // The token stays server side: the browser only receives a short-lived grant id.
    const grant = b64u.enc(crypto.getRandomValues(new Uint8Array(18)));
    await env.CMS.put("grant:" + grant, await seal(env, tokenData.access_token), { expirationTtl: 600 });
    const payload = JSON.stringify({ grant });

    const html = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><p>Connected. You can close this window.</p>
<script>
(function(){
  function receive(e){
    window.opener.postMessage('studio-grant:' + ${JSON.stringify(payload)}, e.origin);
    window.removeEventListener('message', receive, false);
    setTimeout(function(){ window.close(); }, 400);
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('studio-ready', ${JSON.stringify(allowedOrigin)});
})();
</script></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });
  }
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return await handleOAuth(request, env, url);
    } catch (e) {
      return json({ message: "Server error" }, 500);
    }
  },
};
