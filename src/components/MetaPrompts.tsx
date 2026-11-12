import { useState } from "react";
import { Copy } from "lucide-react";
import { PROMPTS } from "../lib/items";

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// The two copyable Meta AI prompts. If the clipboard is blocked, the prompt is shown so it can be copied by hand.
export function MetaPrompts({ onCopied }: { onCopied: (m: string) => void }) {
  const [preview, setPreview] = useState("");
  async function copy(text: string, label: string) {
    if (await copyText(text)) { setPreview(""); onCopied(`${label} prompt copied — paste it into Meta AI.`); }
    else setPreview(text);
  }
  const btn = "inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full hover:bg-[var(--surface)]";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => copy(PROMPTS.all, "“All my saves”")} className={btn}><Copy size={14} /> All my saves</button>
        <button onClick={() => copy(PROMPTS.daily, "“Last 24 hours”")} className={btn}><Copy size={14} /> Last 24 hours (daily)</button>
      </div>
      {preview && <pre className="mono mt-3 text-[11px] leading-relaxed bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 max-h-[240px] overflow-auto whitespace-pre-wrap select-all">{preview}</pre>}
    </div>
  );
}
