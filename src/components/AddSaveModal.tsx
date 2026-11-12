import { useState } from "react";
import { Copy, Link2, Loader2, Sparkles, X } from "lucide-react";
import { MetaPrompts, copyText } from "./MetaPrompts";
import { PROMPTS, normalizeUrl, parseMetaReply } from "../lib/items";

type Props = {
  initialLink: string;
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
  onAddLink: (url: string) => Promise<void>;
  toast: (m: string) => void;
};

export function AddSaveModal({ initialLink, onClose, onImport, onAddLink, toast }: Props) {
  const [mode, setMode] = useState<"meta" | "link">(initialLink ? "link" : "meta");
  const [reply, setReply] = useState("");
  const [link, setLink] = useState(initialLink);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doImport() {
    const parsed = parseMetaReply(reply);
    if (parsed.noAccess) { setMsg("Meta AI said it can't access your saved posts. Try the Meta AI chat inside the Instagram app, or add links one by one."); return; }
    if (!parsed.rows.length) { setMsg("No post links found. Paste Meta AI's whole reply."); return; }
    setBusy(true); setMsg("");
    try { await onImport(reply); onClose(); } catch (e) { setMsg("❌ " + (e as Error).message); }
    setBusy(false);
  }
  async function doLink() {
    const url = normalizeUrl(link);
    if (!url) { setMsg("Paste a valid http(s) link first."); return; }
    setBusy(true); setMsg("");
    try { await onAddLink(url); onClose(); } catch (e) { setMsg("❌ " + (e as Error).message); }
    setBusy(false);
  }
  async function copySingle() {
    const url = normalizeUrl(link);
    if (!url) { setMsg("Paste a valid http(s) link first."); return; }
    if (await copyText(PROMPTS.single(url))) toast("Prompt copied — paste it into Meta AI, then paste the reply in “Import from Meta AI”.");
    else setMsg("Copy blocked by the browser — use “Import from Meta AI” → copy a prompt instead.");
  }

  const tabBtn = (m: "meta" | "link", label: string, icon: React.ReactNode) => (
    <button onClick={() => { setMode(m); setMsg(""); }} className={`flex-1 inline-flex justify-center items-center gap-1.5 text-sm font-bold px-3 min-h-[44px] rounded-full ${mode === m ? "bg-[var(--ink)] text-[var(--surface)]" : "text-[var(--muted)]"}`}>{icon}{label}</button>
  );
  const primary = "inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full disabled:opacity-60";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--card)] w-full max-w-[640px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">Add saves</h2><button onClick={onClose} aria-label="Close" className="p-2 rounded-full border border-[var(--line)] min-h-[40px] min-w-[40px]"><X size={16} /></button></div>
        <div className="mt-4 flex gap-1 bg-[var(--surface)] border border-[var(--line)] rounded-full p-1">{tabBtn("meta", "Import from Meta AI", <Sparkles size={15} />)}{tabBtn("link", "Paste a link", <Link2 size={15} />)}</div>
        {mode === "meta" ? (
          <div className="mt-4">
            <ol className="space-y-3 text-sm leading-relaxed">
              <li className="flex gap-2.5"><Num n={1} /><div className="min-w-0 flex-1"><span>Copy a prompt:</span><div className="mt-2"><MetaPrompts onCopied={toast} /></div></div></li>
              <li className="flex gap-2.5"><Num n={2} /><span>Paste it into Meta AI — in Instagram, WhatsApp or meta.ai. For a daily sync, ask Meta AI to run the “Last 24 hours” prompt every morning as a scheduled task.</span></li>
              <li className="flex gap-2.5"><Num n={3} /><span>Copy Meta AI's <b>whole</b> reply and paste it here:</span></li>
            </ol>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={7} placeholder="Paste Meta AI's reply…" className="mono mt-3 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-xs bg-[var(--surface)] outline-none" />
            <button onClick={doImport} disabled={busy} className={primary + " mt-3 w-full sm:w-auto"}>{busy && <Loader2 size={16} className="animate-spin" />} Import saves</button>
            <p className="text-xs text-[var(--muted)] mt-3">Links already in SaveBrain are skipped. AI can make mistakes — open the original to confirm it's really one of your saves.</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">In Instagram / Facebook: Share → Copy link, then paste it here.</p>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/…" className="mt-2 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]" />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={doLink} disabled={busy} className={primary}>{busy && <Loader2 size={16} className="animate-spin" />} File it</button>
              <button onClick={copySingle} className="inline-flex items-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[48px] rounded-full"><Copy size={14} /> Copy Meta AI prompt for this link</button>
            </div>
            <p className="text-xs text-[var(--muted)] mt-3">“File it” saves the link for review. For the full analysis — summary, steps, trust check — use the Meta AI prompt and import its reply.</p>
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </div>
    </div>
  );
}
const Num = ({ n }: { n: number }) => <span className="w-6 h-6 shrink-0 rounded-full bg-[var(--ink)] text-[var(--surface)] text-xs font-bold flex items-center justify-center">{n}</span>;
