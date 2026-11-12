export function AppIcon({ size = 40 }: { size?: number }) {
  return <div className="rounded-[12px] bg-white text-slate-900 flex items-center justify-center font-black shrink-0 shadow-sm" style={{ width: size, height: size, fontSize: size * 0.52, lineHeight: 1 }}>S</div>;
}

// Minimal frame for the screens shown before the user is signed in.
export function Frame({ status, children }: { status?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100vh] bg-[var(--surface)] text-[var(--ink)]">
      <header className="bg-[var(--header)] text-white border-b border-slate-700">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <AppIcon size={40} />
          <span className="min-w-0"><span className="block font-extrabold text-lg sm:text-xl leading-none tracking-tight">SaveBrain</span><span className="block text-[11px] sm:text-xs text-slate-400 truncate">Your Saved Posts Second Brain</span></span>
          {status && <span className="ml-auto text-[11px] bg-slate-800 border border-slate-700 rounded-full px-2.5 py-1">{status}</span>}
        </div>
      </header>
      <main className="max-w-[640px] mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
