// SaveBrain setup proxy (Cloudflare Worker).
// Supabase's Management API doesn't allow calls from browsers (no CORS), so the one-time setup goes through here.
// It stores and logs nothing: it finishes the "Connect with Supabase" login (which needs the app secret)
// and forwards only the few Management API calls setup makes.
const SUPABASE = "https://api.supabase.com";

// The only Management API calls setup makes. Everything else is refused.
const ALLOWED = [
  ["GET", /^\/v1\/organizations$/],
  ["GET", /^\/v1\/projects$/],
  ["POST", /^\/v1\/projects$/],
  ["GET", /^\/v1\/projects\/[a-z0-9]{20}$/],
  ["POST", /^\/v1\/projects\/[a-z0-9]{20}\/database\/query$/],
  ["GET", /^\/v1\/projects\/[a-z0-9]{20}\/config\/auth$/],
  ["PATCH", /^\/v1\/projects\/[a-z0-9]{20}\/config\/auth$/],
  ["GET", /^\/v1\/projects\/[a-z0-9]{20}\/api-keys$/],
  ["POST", /^\/v1\/projects\/[a-z0-9]{20}\/api-keys$/],
];

export default {
  async fetch(req, env) {
    const origins = env.ALLOWED_ORIGINS.split(",").map(s => s.trim());
    const origin = req.headers.get("Origin") || "";
    if (!origins.includes(origin)) return new Response("Origin not allowed", { status: 403 });
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "3600",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const path = new URL(req.url).pathname;

    // "Connect with Supabase": swap the one-time code for an access token. The refresh token is
    // dropped on purpose, so the browser only ever holds a short-lived token.
    if (req.method === "POST" && path === "/oauth/token") {
      const { code, code_verifier, redirect_uri } = await req.json().catch(() => ({}));
      if (!code || !code_verifier || !origins.some(o => redirect_uri?.startsWith(o + "/"))) return json({ message: "Invalid login request" }, 400);
      const r = await fetch(SUPABASE + "/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(env.CLIENT_ID + ":" + env.CLIENT_SECRET) },
        body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier, redirect_uri }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return json({ message: body.message || body.error_description || "Supabase login failed" }, r.status);
      return json({ access_token: body.access_token, expires_in: body.expires_in }, 200);
    }

    if (!ALLOWED.some(([m, re]) => m === req.method && re.test(path))) return json({ message: "Not allowed" }, 404);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ message: "Missing token" }, 401);
    const r = await fetch(SUPABASE + path, {
      method: req.method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: req.method === "GET" ? undefined : await req.text(),
    });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("Content-Type") || "application/json" } });
  },
};
