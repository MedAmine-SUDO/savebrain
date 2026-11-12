// Which Supabase project this browser uses. Stored only in this browser; nothing is deployed with the site.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Config = { url: string; key: string };
const CONFIG_KEY = "savebrain_config";

export function validConfig(c: Partial<Config> | null | undefined): c is Config {
  return !!c && /^https:\/\/[^\s/]+$/i.test(c.url || "") && /^sb_publishable_[\w-]+$/.test(c.key || "");
}
export function getConfig(): Config | null {
  try { const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null"); return validConfig(c) ? { url: c.url, key: c.key } : null; } catch { return null; }
}
export function saveConfig(c: Config): boolean {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); return true; } catch { return false; }
}
export function clearConfig() { try { localStorage.removeItem(CONFIG_KEY); } catch { /* nothing stored */ } }
export const projectRef = (c: Config) => new URL(c.url).hostname.split(".")[0];

// "Connect another device": the link carries only the project URL + publishable key, in the #fragment
// (never sent to any server). The person still has to sign in with their password on the new device.
export function connectLink(c: Config) {
  return location.origin + location.pathname + "#connect=" + encodeURIComponent(btoa(JSON.stringify({ url: c.url, key: c.key })));
}
export function consumeConnectLink() {
  const m = location.hash.match(/^#connect=(.+)$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try { const c = JSON.parse(atob(decodeURIComponent(m[1]))); if (validConfig(c)) saveConfig(c); } catch { /* ignore malformed links */ }
}

let client: SupabaseClient | null = null;
export function supabaseFor(c: Config) {
  if (!client) client = createClient(c.url, c.key);
  return client;
}
