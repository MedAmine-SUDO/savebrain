import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Link2, Loader2, Lock, UserPlus } from "lucide-react";
import { Frame } from "./AppIcon";
import { saveConfig } from "../lib/config";
import { finishConnect, loadAccount, managementApi, runSetup, startConnect, type Mgmt, type Org, type Project } from "../lib/setup";

const input = "mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]";
const primary ="inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full disabled:opacity-60";

export function SetupScreen() {
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

  async function connectAccount(getToken: () => Promise<string | null>) {
    setBusy(true); setMsg("Checking your Supabase account…");
    try {
      const t = await getToken();
      if (!t) { setMsg(""); setBusy(false); return; }
      const api = managementApi(t);
      const acc = await loadAccount(api);
      setOrgs(acc.orgs); setProjects(acc.projects); setOrg(acc.orgs[0].slug); setMgmt(() => api); setMsg("");
    } catch (e) { setMsg("❌ " + (e as Error).message); }
    setBusy(false);
  }
  // Back from Supabase's consent page?
  useEffect(() => { if (/[?&](code|error)=/.test(location.search)) connectAccount(finishConnect); }, []);
  async function setup() {
    if (!mgmt) return;
    if (!email.trim() || password.length < 6) { setMsg("Enter an email and a password of at least 6 characters."); return; }
    const isNew = project === "new";
    setBusy(true); setLog([]); setMsg("");
    try {
      const cfg = await runSetup({ mgmt, orgSlug: org, existingRef: isNew ? createdRef : project, isNew, email: email.trim(), password,
        log: m => setLog(l => [...l, m]), onCreated: setCreatedRef });
      if (!saveConfig(cfg)) throw new Error("Could not save settings in this browser (private mode?).");
      setMgmt(null); setDone(true);
      setLog(l => [...l, "All done! Opening SaveBrain…"]);
      setTimeout(() => location.reload(), 2000);
    } catch (e) { setMsg("❌ " + (e as Error).message + " — press “Set up SaveBrain” again to continue where it stopped."); }
    setBusy(false);
  }

  return (
    <Frame status="Not set up yet">
      <p className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">One-time setup · about 2 minutes</p>
      <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight mt-1">Set up your SaveBrain</h1>
      <p className="text-sm text-[var(--muted)] mt-1">Your saves live in <b className="text-[var(--ink)]">your own</b> free Supabase database. Nobody else — including the SaveBrain author — can see them.</p>

      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 mt-4">
        <Step n={1} title="Connect your Supabase account" done={!!mgmt}>
          {mgmt ? <p className="text-sm text-[var(--muted)]">Connected. SaveBrain can now create your project.</p> : (<>
            <p className="text-sm text-[var(--muted)]">Supabase is where your saves are stored, free. On the next page, <b className="text-[var(--ink)]">sign in or create a free account</b>, pick your organization and press <b className="text-[var(--ink)]">Authorize</b>.</p>
            <button onClick={startConnect} disabled={busy} className={primary + " mt-3 w-full sm:w-auto"}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect with Supabase <ArrowRight size={16} /></button>
          </>)}
        </Step>
        <Step n={2} title="Choose your SaveBrain login" last>
          {!mgmt ? <p className="text-sm text-[var(--muted)]">Available once you're connected.</p> : (<>
            <p className="text-sm text-[var(--muted)]">You'll use this email and password to open SaveBrain on any device.</p>
            <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Email</label>
            <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={input} />
            <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Password</label>
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className={input} />
            <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Where to store your saves</label>
            <select value={project} onChange={e => setProject(e.target.value)} className={input}>
              <option value="new">✨ New SaveBrain project</option>
              {projects.map(p => <option key={p.ref} value={p.ref}>Existing project: {p.name}</option>)}
            </select>
            <p className="text-xs text-[var(--muted)] mt-1">{project !== "new" ? "SaveBrain adds its own tables to this project and leaves everything else alone." : "Free Supabase plans allow 2 projects. Already at 2? Pick an existing one."}</p>
            {project === "new" && orgs.length > 1 && (<>
              <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Organization</label>
              <select value={org} onChange={e => setOrg(e.target.value)} className={input}>{orgs.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}</select>
            </>)}
            <button onClick={setup} disabled={busy || done} className={primary + " mt-4 w-full sm:w-auto"}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Set up SaveBrain <ArrowRight size={16} /></button>
          </>)}
        </Step>
        {log.length > 0 && <ul className="mt-4 space-y-1.5">{log.map((l, i) => (<li key={i} className="flex gap-2 text-sm">{i === log.length - 1 && busy ? <Loader2 size={15} className="animate-spin shrink-0 mt-0.5" /> : <CheckCircle2 size={15} className="text-[var(--green)] shrink-0 mt-0.5" />}<span>{l}</span></li>))}</ul>}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </div>

      <div className="mt-4 flex gap-2 items-start text-xs text-[var(--muted)] leading-relaxed"><Lock size={14} className="shrink-0 mt-0.5" /><span>Setup access stays in this tab and is never saved. It reaches Supabase through SaveBrain's small open-source setup proxy, which stores nothing. Already use SaveBrain on another device? Open its “Connect another device” link instead.</span></div>
    </Frame>
  );
}

function Step({ n, title, last, done, children }: { n: number; title: string; last?: boolean; done?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 ${last ? "" : "pb-4 mb-4 border-b border-[var(--line)]"}`}>
      <span className={`w-7 h-7 shrink-0 rounded-full ${done ? "bg-[var(--green)]" : "bg-[var(--ink)]"} text-[var(--surface)] text-xs font-bold flex items-center justify-center`}>{done ? <CheckCircle2 size={15} /> : n}</span>
      <div className="min-w-0 flex-1"><h2 className="font-extrabold">{title}</h2><div className="mt-1">{children}</div></div>
    </div>
  );
}
