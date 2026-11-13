import { useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, KeyRound, Loader2, Lock, UserPlus } from "lucide-react";
import { Frame } from "./AppIcon";
import { saveConfig } from "../lib/config";
import { loadAccount, managementApi, runSetup, type Mgmt, type Org, type Project } from "../lib/setup";

const input = "mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]";
// The scoped-token permissions setup needs (names as on supabase.com/dashboard/account/tokens).
const TOKEN_PERMISSIONS = [
  ["Organizations", "Read"],
  ["Projects (account-wide)", "Read"],
  ["Organization Projects", "Read-write"],
  ["Project Settings", "Read-write"],
  ["Database", "Read-write"],
  ["Auth Config", "Read-write"],
  ["API Keys", "Read-write"],
  ["API Key Secrets", "Read"],
];
const primary ="inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full disabled:opacity-60";

export function SetupScreen() {
  const [token, setToken] = useState("");
  const [mgmt, setMgmt] = useState<Mgmt | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [org, setOrg] = useState("");
  const [project, setProject] = useState("new");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [createdRef, setCreatedRef] = useState<string | null>(null); // reused on retry so we never create two projects

  async function connect() {
    if (!token.trim().startsWith("sbp_")) { setMsg("That doesn't look like an access token — it should start with sbp_."); return; }
    setBusy(true); setMsg("Checking your Supabase account…");
    try {
      const api = managementApi(token.trim());
      const acc = await loadAccount(api);
      setOrgs(acc.orgs); setProjects(acc.projects); setOrg(acc.orgs[0].slug); setMgmt(() => api); setMsg("");
    } catch (e) { setMsg("❌ " + (e as Error).message); }
    setBusy(false);
  }
  async function setup() {
    if (!mgmt) return;
    if (!email.trim() || password.length < 6) { setMsg("Enter an email and a password of at least 6 characters."); return; }
    const isNew = project === "new";
    setBusy(true); setLog([]); setMsg("");
    try {
      const cfg = await runSetup({ mgmt, orgSlug: org, existingRef: isNew ? createdRef : project, isNew, email: email.trim(), password,
        log: m => setLog(l => [...l, m]), onCreated: setCreatedRef });
      if (!saveConfig(cfg)) throw new Error("Could not save settings in this browser (private mode?).");
      setMgmt(null); setToken(""); setDone(true);
      setLog(l => [...l, "All done! Opening SaveBrain…"]);
      setTimeout(() => location.reload(), 2000);
    } catch (e) { setMsg("❌ " + (e as Error).message + " — press “Set up SaveBrain” again to continue where it stopped."); }
    setBusy(false);
  }

  return (
    <Frame status="Not set up yet">
      <p className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">One-time setup · about 3 minutes</p>
      <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight mt-1">Set up your SaveBrain</h1>
      <p className="text-sm text-[var(--muted)] mt-1">Your saves live in <b className="text-[var(--ink)]">your own</b> free Supabase database. Nobody else — including the SaveBrain author — can see them.</p>

      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 mt-4">
        <Step n={1} title="Create a free Supabase account">
          <a href="https://supabase.com/dashboard/sign-up" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] min-h-[40px]">Open supabase.com <ExternalLink size={13} /></a>
          <span className="text-xs text-[var(--muted)] ml-2">Skip if you already have one.</span>
        </Step>
        <Step n={2} title="Paste an access token" last={!mgmt}>
          <p className="text-sm text-[var(--muted)]"><a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--accent)] inline-flex items-center gap-1">Generate a token <ExternalLink size={12} /></a> → name it “SaveBrain setup”, set it up like this, then copy it:</p>
          <ul className="mt-2 text-sm text-[var(--muted)] space-y-1 list-disc pl-5">
            <li><b className="text-[var(--ink)]">Expiry:</b> the shortest option. You only need it for these 3 minutes.</li>
            <li><b className="text-[var(--ink)]">Access:</b> your organization, with all its projects (needed to create the new project).</li>
            <li><b className="text-[var(--ink)]">Permissions:</b> leave everything else off and turn on only these:</li>
          </ul>
          <ul className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3">
            {TOKEN_PERMISSIONS.map(([name, level]) => <li key={name} className="flex justify-between gap-2"><span>{name}</span><span className="font-bold">{level}</span></li>)}
          </ul>
          <div className="flex flex-wrap gap-2 mt-3">
            <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="sbp_..." className={input + " flex-1 min-w-[200px] mt-0"} />
            <button onClick={connect} disabled={busy || !!mgmt} className={primary}><KeyRound size={16} /> {mgmt ? "Connected" : "Continue"}</button>
          </div>
        </Step>
        {mgmt && (
          <Step n={3} title="Choose a project and your SaveBrain login" last>
            <label className="block text-xs font-bold text-[var(--muted)]">Project</label>
            <select value={project} onChange={e => setProject(e.target.value)} className={input}>
              <option value="new">✨ Create a new “SaveBrain” project (recommended)</option>
              {projects.map(p => <option key={p.ref} value={p.ref}>Use existing: {p.name}</option>)}
            </select>
            {project !== "new" && <p className="text-xs text-[var(--muted)] mt-1">SaveBrain adds its own tables to this project and leaves everything else alone.</p>}
            {project === "new" && orgs.length > 1 && (<>
              <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Organization</label>
              <select value={org} onChange={e => setOrg(e.target.value)} className={input}>{orgs.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}</select>
            </>)}
            <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Email for SaveBrain</label>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
            <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Password</label>
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className={input} />
            <button onClick={setup} disabled={busy || done} className={primary + " mt-4 w-full sm:w-auto"}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Set up SaveBrain <ArrowRight size={16} /></button>
          </Step>
        )}
        {log.length > 0 && <ul className="mt-4 space-y-1.5">{log.map((l, i) => (<li key={i} className="flex gap-2 text-sm">{i === log.length - 1 && busy ? <Loader2 size={15} className="animate-spin shrink-0 mt-0.5" /> : <CheckCircle2 size={15} className="text-[var(--green)] shrink-0 mt-0.5" />}<span>{l}</span></li>))}</ul>}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </div>

      <div className="mt-4 flex gap-2 items-start text-xs text-[var(--muted)] leading-relaxed"><Lock size={14} className="shrink-0 mt-0.5" /><span>Your token is only sent to api.supabase.com, only kept in this tab, and never saved. When setup is done you can delete it on the tokens page. Already set up SaveBrain on another device? Open the “Connect another device” link from that device instead.</span></div>
    </Frame>
  );
}

function Step({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 ${last ? "" : "pb-4 mb-4 border-b border-[var(--line)]"}`}>
      <span className="w-7 h-7 shrink-0 rounded-full bg-[var(--ink)] text-[var(--surface)] text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="min-w-0 flex-1"><h2 className="font-extrabold">{title}</h2><div className="mt-1">{children}</div></div>
    </div>
  );
}
