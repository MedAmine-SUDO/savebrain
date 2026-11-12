import { useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Frame } from "./AppIcon";
import { clearConfig } from "../lib/config";

export function SignInScreen({ sb }: { sb: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setMsg("Enter your email and password."); return; }
    setBusy(true); setMsg("");
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(/not confirmed/i.test(error.message) ? "Your email isn't confirmed yet. Press “Use a different Supabase project” below and run setup again with the same project and email — it will confirm your account."
      : /invalid/i.test(error.message) ? "Wrong email or password. Use the ones you chose during setup." : error.message);
  }
  async function reset() {
    if (!confirm("Disconnect this Supabase project from SaveBrain in this browser? Your saves stay in Supabase.")) return;
    await sb.auth.signOut(); clearConfig(); location.reload();
  }
  const input = "mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]";
  return (
    <Frame status="Signed out">
      <form onSubmit={signIn} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6">
        <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight">Sign in</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Use the email and password you chose during setup.</p>
        <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Email</label>
        <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={input} />
        <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Password</label>
        <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={input} />
        <button type="submit" disabled={busy} className="mt-4 inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full w-full sm:w-auto disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Sign in</button>
        {msg && <p className="mt-3 text-sm text-[var(--danger)]">{msg}</p>}
      </form>
      <button onClick={reset} className="mt-3 text-sm font-bold text-[var(--accent)] min-h-[44px]">Use a different Supabase project</button>
    </Frame>
  );
}
