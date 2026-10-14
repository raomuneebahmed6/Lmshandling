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
const PBKDF2_ITERATIONS = 100000; // Workers cap PBKDF2 at 100k
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

async function sessionSecret(env) {
  let s = await env.CMS.get("cfg:secret");
  if (!s) {
    s = b64u.enc(crypto.getRandomValues(new Uint8Array(32)));
    await env.CMS.put("cfg:secret", s);
  }
  return b64u.dec(s);
}

async function makeSession(env, user) {
  const payload = b64u.enc(enc.encode(JSON.stringify({ u: user.name, r: user.role, e: Date.now() + SESSION_HOURS * 3600 * 1000 })));
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
  return { name: u.name, role: u.role };
}

function cookie(value, maxAge) {
  return `lmh_s=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function usersExist(env) {
  const l = await env.CMS.list({ prefix: "user:", limit: 1 });
  return l.keys.length > 0;
}

const validName = (n) => /^[a-z0-9._-]{3,32}$/.test(n);
const validPass = (p) => typeof p === "string" && p.length >= 8 && p.length <= 200;

async function createUser(env, name, password, role) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt);
  await env.CMS.put("user:" + name, JSON.stringify({ name, role, salt: b64u.enc(salt), hash: b64u.enc(hash), created: new Date().toISOString() }));
}

async function ghToken(env) {
  const boxed = await env.CMS.get("cfg:gh");
  return boxed ? unseal(env, boxed) : null;
}

/* ---------- GitHub allow-list proxy ---------- */
function allowed(method, path, repo) {
  const R = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = [
    ["GET", new RegExp(`^repos/${R}$`)],
    ["GET", new RegExp(`^repos/${R}/contents/.*$`)],
    ["PUT", new RegExp(`^repos/${R}/contents/.+$`)],
    ["DELETE", new RegExp(`^repos/${R}/contents/.+$`)],
    ["GET", new RegExp(`^repos/${R}/commits$`)],
    ["GET", new RegExp(`^repos/${R}/git/trees/.+$`)],
    ["GET", new RegExp(`^repos/${R}/actions/runs(/\\d+)?$`)],
    ["POST", new RegExp(`^repos/${R}/actions/workflows/[A-Za-z0-9._-]+/dispatches$`)],
  ];
  return rules.some(([m, re]) => m === method && re.test(path));
}

async function proxyGitHub(env, request, url) {
  const repo = env.REPO || "raomuneebahmed6/Lmshandling";
  const path = decodeURIComponent(url.pathname.slice("/api/gh/".length));
  if (path.includes("..") || !allowed(request.method, path, repo)) return json({ message: "Blocked by Blog Studio" }, 403);
  const token = await ghToken(env);
  if (!token) return json({ message: "GitHub is not connected yet" }, 409);
  const init = {
    method: request.method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lmshandling-blog-studio",
    },
  };
  if (request.method !== "GET") {
    init.body = await request.text();
    init.headers["Content-Type"] = "application/json";
  }
  const r = await fetch("https://api.github.com/" + path + url.search, init);
  return new Response(r.status === 204 ? null : await r.text(), {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
  });
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

/* ---------- API ---------- */
async function handleApi(request, env, url) {
  const route = url.pathname.slice("/api".length);
  const method = request.method;

  // CSRF: SameSite=Strict cookie plus a header a cross-site form cannot send.
  if (method !== "GET" && request.headers.get("X-Studio") !== "1") return json({ message: "Bad request" }, 400);

  if (route === "/state" && method === "GET") {
    const session = await readSession(env, request);
    return json({ setup: !(await usersExist(env)), user: session, github: !!(await env.CMS.get("cfg:gh")) });
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
    if (!validPass(body.password)) return json({ message: "Password must be at least 8 characters" }, 400);
    const boxed = await env.CMS.get("grant:" + body.grant);
    if (!boxed) return json({ message: "GitHub connection expired. Connect again." }, 400);
    const token = await unseal(env, boxed);
    const repo = env.REPO || "raomuneebahmed6/Lmshandling";
    const r = await fetch("https://api.github.com/repos/" + repo, { headers: { Authorization: "Bearer " + token, "User-Agent": "lmshandling-blog-studio", Accept: "application/vnd.github+json" } });
    const info = await r.json().catch(() => ({}));
    if (!r.ok || !info.permissions || !info.permissions.push) return json({ message: "That GitHub account cannot write to the site repository." }, 403);
    await env.CMS.put("cfg:gh", await seal(env, token));
    await env.CMS.delete("grant:" + body.grant);
    await createUser(env, name, body.password, "admin");
    const u = { name, role: "admin" };
    return json({ user: u }, 200, { "Set-Cookie": cookie(await makeSession(env, u), SESSION_HOURS * 3600) });
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
    if (!validPass(body.password)) return json({ message: "New password must be at least 8 characters" }, 400);
    await createUser(env, u.name, body.password, u.role);
    return json({ ok: true });
  }

  if (route.startsWith("/gh/")) return proxyGitHub(env, request, url);

  // ---- admin-only: users and GitHub connection
  if (session.role !== "admin") return json({ message: "Admins only" }, 403);

  if (route === "/users" && method === "GET") {
    const l = await env.CMS.list({ prefix: "user:" });
    const users = [];
    for (const k of l.keys) {
      const u = await env.CMS.get(k.name, "json");
      if (u) users.push({ name: u.name, role: u.role, created: u.created });
    }
    return json({ users });
  }
  if (route === "/users" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = String(body.username || "").toLowerCase().trim();
    if (!validName(name)) return json({ message: "Username: 3-32 letters, numbers, . _ -" }, 400);
    if (!validPass(body.password)) return json({ message: "Password must be at least 8 characters" }, 400);
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
    if (!validPass(body.password)) return json({ message: "Password must be at least 8 characters" }, 400);
    await createUser(env, u.name, body.password, u.role);
    return json({ ok: true });
  }
  if (route === "/github/connect" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const boxed = await env.CMS.get("grant:" + body.grant);
    if (!boxed) return json({ message: "GitHub connection expired. Connect again." }, 400);
    await env.CMS.put("cfg:gh", boxed);
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
