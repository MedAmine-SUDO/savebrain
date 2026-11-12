import { Copy, Database, ExternalLink, RefreshCw } from "lucide-react";
import { schemaSql } from "../lib/setup";
import { copyText } from "./MetaPrompts";

// Shown when the user's database was set up by an older SaveBrain and lacks the newer columns/tables.
export function DbUpdateBanner({ projectRef, toast }: { projectRef: string; toast: (m: string) => void }) {
  return (
    <div className="mb-4 bg-[var(--amber-bg)] border border-amber-200 rounded-2xl p-4 text-sm">
      <div className="font-extrabold flex items-center gap-2"><Database size={16} /> Your database needs a one-time update</div>
      <p className="mt-1 leading-relaxed">SaveBrain got new features (full analysis, reminders). Copy the update, open your SQL Editor, paste it and press <b>Run</b>. It's safe to run more than once and keeps your saves.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={async () => toast(await copyText(schemaSql) ? "Update copied — paste it in the SQL Editor and press Run." : "Copy blocked — open supabase/schema.sql on GitHub instead.")} className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] font-bold px-4 min-h-[44px] rounded-full"><Copy size={14} /> 1. Copy update</button>
        <a href={`https://supabase.com/dashboard/project/${projectRef}/sql/new`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--card)] font-bold px-4 min-h-[44px] rounded-full">2. Open SQL Editor <ExternalLink size={13} /></a>
        <button onClick={() => location.reload()} className="inline-flex items-center gap-1.5 border border-[var(--line)] bg-[var(--card)] font-bold px-4 min-h-[44px] rounded-full"><RefreshCw size={14} /> 3. Done — reload</button>
      </div>
    </div>
  );
}
