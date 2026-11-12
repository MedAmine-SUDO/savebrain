import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { connectLink, type Config } from "../lib/config";
import { copyText } from "./MetaPrompts";

export function ConnectDevice({ cfg, toast }: { cfg: Config; toast: (m: string) => void }) {
  const link = connectLink(cfg);
  const [qr, setQr] = useState("");
  useEffect(() => { QRCode.toDataURL(link, { width: 220, margin: 1 }).then(setQr).catch(() => setQr("")); }, [link]);
  return (
    <div className="mt-3">
      <p className="text-sm text-[var(--muted)] leading-relaxed">Scan the code or open the link on your other device, then sign in with your email and password. The link holds your project's address and publishable key — never your password. <b className="text-[var(--ink)]">Only open it on your own devices; don't post it.</b></p>
      <div className="mt-3 flex flex-wrap gap-4 items-center">
        {qr && <img src={qr} alt="QR code to connect another device" width={160} height={160} className="bg-white p-2 rounded-xl border border-[var(--line)]" />}
        <button onClick={async () => toast(await copyText(link) ? "Link copied — open it on your other device." : "Copy blocked — scan the QR code instead.")} className="inline-flex items-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Copy size={14} /> Copy link</button>
      </div>
    </div>
  );
}
