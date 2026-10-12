// Minimal GitHub OAuth proxy for Decap CMS, deployed as a Cloudflare Worker.
//
// Decap CMS's "github" backend needs a server-side handshake (the GitHub
// client secret can never be shipped to the browser), so this worker sits
// between the admin panel and GitHub's OAuth endpoints. It implements the
// two routes Decap expects:
//   GET /auth      -> redirects the popup to GitHub's authorize screen
//   GET /callback  -> exchanges the returned code for a token, then posts
//                     it back to the admin panel's window via postMessage
//
// Required Worker secrets (set via `wrangler secret put` or the dashboard):
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET
// Optional:
//   ALLOWED_ORIGIN  (defaults to https://lmshandling.com)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://lmshandling.com";

    if (url.pathname === "/auth") {
      const redirectUri = `${url.origin}/callback`;
      const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
      authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", "repo,user");
      return Response.redirect(authorizeUrl.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
          { status: 400 }
        );
      }

      const payload = JSON.stringify({
        token: tokenData.access_token,
        provider: "github",
      });

      const html = `<!DOCTYPE html>
<html>
<body>
<script>
(function() {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:' + ${JSON.stringify(payload)},
      e.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "${allowedOrigin}");
})();
</script>
</body>
</html>`;

      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
