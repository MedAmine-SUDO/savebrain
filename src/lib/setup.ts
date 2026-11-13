// One-time setup: creates/configures the user's own Supabase project via the Management API.
// The access token only lives in memory for this tab and is never stored.
import { createClient } from "@supabase/supabase-js";
import schemaSql from "../../supabase/schema.sql?raw";
import type { Config } from "./config";

export { schemaSql };
// Supabase's Management API blocks browser calls (no CORS), so setup goes through our small proxy (proxy/worker.js).
const MGMT = __SETUP_PROXY__ + "/v1";
const OAUTH_CLIENT_ID = "ca281632-e082-48ab-b8ec-81630a7abc82";
const OAUTH_KEY = "savebrain_oauth"; // PKCE verifier + state, kept in this tab only while Supabase's consent page is open

const b64url = (a: Uint8Array) => btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const redirectUri = () => location.origin + location.pathname;

// "Connect with Supabase": send the user to Supabase's consent page (OAuth with PKCE).
export async function startConnect() {
  const verifier = randomString(), state = randomString();
  sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ verifier, state }));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const q = new URLSearchParams({ client_id: OAUTH_CLIENT_ID, redirect_uri: redirectUri(), response_type: "code", state, code_challenge: challenge, code_challenge_method: "S256" });
  location.assign("https://api.supabase.com/v1/oauth/authorize?" + q);
}

// Back from Supabase: swap the one-time code for a short-lived access token. Returns null when this isn't a return from Supabase.
export async function finishConnect(): Promise<string | null> {
  const q = new URLSearchParams(location.search);
  const code = q.get("code"), error = q.get("error");
  if (!code && !error) return null;
  history.replaceState(null, "", location.pathname);
  let saved: { verifier?: string; state?: string } = {};
  try { saved = JSON.parse(sessionStorage.getItem(OAUTH_KEY) || "{}"); sessionStorage.removeItem(OAUTH_KEY); } catch { /* treated as invalid below */ }
  if (error) throw new Error(q.get("error_description") || "Supabase access was not granted.");
  if (!saved.verifier || q.get("state") !== saved.state) throw new Error("This login link is no longer valid. Press “Connect with Supabase” again.");
  const r = await fetch(__SETUP_PROXY__ + "/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: saved.verifier, redirect_uri: redirectUri() }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(body.message || "Could not connect to Supabase.");
  return body.access_token as string;
}

export type Org = { slug: string; name: string };
export type Project = { ref: string; name: string; status: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Fatal = Error & { fatal?: boolean };
async function retry<T>(fn: () => Promise<T>, tries: number, delay: number): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if ((e as Fatal).fatal) break; await sleep(delay); }
  }
  throw last;
}

export function managementApi(token: string) {
  return async function mgmt<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
    const r = await fetch(MGMT + path, { ...opts, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } });
    const t = await r.text(); let body: any = null; try { body = t ? JSON.parse(t) : null; } catch { body = t; }
    // Scoped tokens get a 403 listing what they lack; say exactly which permission to add.
    const missing: string[] = Array.isArray(body?.missing_permissions) ? body.missing_permissions.map(String) : [];
    if (r.status === 403 && missing.length) throw new Error("Your token is missing these permissions: " + missing.join(", ") + ". Create a new token with them and paste it again.");
    if (!r.ok) throw new Error(body?.message ||(typeof body === "string" && body) || "Supabase API error " + r.status);
    return body as T;
  };
}
export type Mgmt = ReturnType<typeof managementApi>;

export async function loadAccount(mgmt: Mgmt) {
  const [orgs, projects] = await Promise.all([mgmt<any[]>("/organizations"), mgmt<any[]>("/projects")]);
  if (!orgs.length) throw new Error("No organization found — open the Supabase dashboard once to create one.");
  return {
    orgs: orgs.map(o => ({ slug: o.slug || o.id, name: o.name })) as Org[],
    projects: projects.filter(p => p.status === "ACTIVE_HEALTHY").map(p => ({ ref: p.ref, name: p.name, status: p.status })) as Project[],
  };
}

function regionGroup() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (/^America\//.test(tz)) return "americas";
  if (/^(Asia|Australia|Pacific)\//.test(tz)) return "apac";
  return "emea";
}
function randomPassword() { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, "0")).join(""); }

// existingRef: a project to reuse (chosen by the user, or created by an earlier attempt that failed later on).
export async function runSetup(opts: { mgmt: Mgmt; orgSlug: string; existingRef: string | null; isNew: boolean; email: string; password: string; log: (m: string) => void; onCreated: (ref: string) => void }): Promise<Config> {
  const { mgmt, log, email, password, isNew } = opts;
  const appUrl = location.origin + location.pathname;
  let ref = opts.existingRef;
  if (!ref) {
    log("Creating your Supabase project…");
    const p = await mgmt<{ ref: string }>("/projects", { method: "POST", body: JSON.stringify({ name: "SaveBrain", organization_slug: opts.orgSlug, db_pass: randomPassword(), region_selection: { type: "smartGroup", code: regionGroup() } }) });
    ref = p.ref; opts.onCreated(ref);
  }
  log("Waiting for the project to start (usually 1–3 minutes)…");
  await retry(async () => { const p = await mgmt<{ status: string }>("/projects/" + ref); if (p.status !== "ACTIVE_HEALTHY") throw new Error("Project is still starting (" + p.status + "). Try again in a minute."); }, 72, 5000);
  log("Creating the tables and privacy rules…");
  await retry(() => mgmt(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query: schemaSql }) }), 12, 5000);
  log("Configuring sign-in…");
  const auth = await retry(() => mgmt<{ uri_allow_list?: string; site_url?: string }>(`/projects/${ref}/config/auth`), 12, 5000);
  const allow = (auth.uri_allow_list || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!allow.includes(appUrl)) allow.push(appUrl);
  const patch: Record<string, unknown> = { uri_allow_list: allow.join(",") };
  if (isNew || !auth.site_url || /localhost/.test(auth.site_url)) patch.site_url = appUrl;
  await retry(() => mgmt(`/projects/${ref}/config/auth`, { method: "PATCH", body: JSON.stringify(patch) }), 6, 5000);
  log("Getting your project key…");
  const keys = await retry(() => mgmt<{ type: string; api_key?: string }[]>(`/projects/${ref}/api-keys`), 12, 5000);
  let pub = keys.find(k => k.type === "publishable" && k.api_key?.startsWith("sb_publishable_"));
  if (!pub) pub = await mgmt(`/projects/${ref}/api-keys`, { method: "POST", body: JSON.stringify({ type: "publishable", name: "savebrain" }) });
  const cfg: Config = { url: `https://${ref}.supabase.co`, key: pub!.api_key! };

  log("Creating your SaveBrain account…");
  const client = createClient(cfg.url, cfg.key);
  // "Already registered" / "Signups not allowed" just mean the account may exist already: fall through to sign-in.
  await retry(async () => {
    const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl } });
    if (error && !/registered|exists|signups? (are )?not allowed|disabled/i.test(error.message)) {
      if (!error.status || error.status >= 500) throw error; // auth service still starting: retry
      throw Object.assign(error, { fatal: true });
    }
  }, 6, 5000);
  // Confirm the account directly instead of relying on Supabase's confirmation email,
  // which is slow, rate-limited, and only delivered to org members on the free plan.
  await retry(() => mgmt(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({
    query: "update auth.users set email_confirmed_at = now() where lower(email) = lower($1) and email_confirmed_at is null",
    parameters: [email] }) }), 6, 5000);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(/invalid/i.test(signInError.message)
    ? "An account with this email already exists with a different password. Use that password, or reset it in Supabase → Authentication → Users."
    : signInError.message);
  if (isNew) {
    log("Locking sign-ups so only you can use this project…");
    await retry(() => mgmt(`/projects/${ref}/config/auth`, { method: "PATCH", body: JSON.stringify({ disable_signup: true }) }), 6, 5000);
  }
  return cfg;
}
