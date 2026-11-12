import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Search, RefreshCw, Download, Plus, Calendar, Clock, AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle2, Bookmark, Instagram, Facebook, X, ExternalLink, Bell, AlarmClock, Trash2, Play, Eye, FileSpreadsheet, Database, Zap, ListChecks, ArrowRight, Sparkles, CircleCheck, Loader2, Info, Home, Settings as SettingsIcon, Smartphone, ChevronRight, Check, Globe, Package, MonitorSmartphone, LogOut, Unplug, CalendarPlus } from "lucide-react";
import type { Item, Reminder, Status, Tab, Trust, Urgency } from "./lib/types";
import { clearConfig, projectRef, type Config } from "./lib/config";
import { fromRow, parseMetaReply, reminderFromRow, safeLink, toRow } from "./lib/items";
import { AppIcon } from "./components/AppIcon";
import { AddSaveModal } from "./components/AddSaveModal";
import { MetaPrompts } from "./components/MetaPrompts";
import { ConnectDevice } from "./components/ConnectDevice";
import { DbUpdateBanner } from "./components/DbUpdateBanner";

const PIPELINE = ["Save a post on Instagram / Facebook", "Ask Meta AI with the SaveBrain prompt", "Paste the reply into SaveBrain", "Extract: summary, steps, deadline, links", "Score: urgency + trust / fake-risk", "Act: review, remind, mark done"];
const BANNER_KEY = "savebrain_install_banner_dismissed";

function urgencyStyle(u: Urgency) {
  if (u === "HIGH") return "bg-[var(--danger-bg)] text-[var(--danger)] border-red-200";
  if (u === "MEDIUM") return "bg-[var(--amber-bg)] text-[var(--amber)] border-amber-200";
  return "bg-[var(--green-bg)] text-[var(--green)] border-emerald-200";
}
function trustStyle(t: Trust) {
  if (t === "Verified") return "bg-[var(--green-bg)] text-[var(--green)]";
  if (t === "Likely Legit") return "bg-[var(--blue-bg)] text-[var(--accent)]";
  if (t === "High Fake Risk") return "bg-[var(--danger-bg)] text-[var(--danger)]";
  return "bg-[var(--amber-bg)] text-[var(--amber)]";
}
function fmt(d: string) {
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function csvEscape(v: string) { return `"${String(v || "").replace(/"/g, '""')}"`; }
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
function PlatformIcon({ p, size }: { p: Item["platform"]; size: number }) {
  return p === "Instagram" ? <Instagram size={size} /> : p === "Facebook" ? <Facebook size={size} /> : <Globe size={size} />;
}
// All-day calendar event, so reminders reach the phone's own calendar notifications.
function downloadIcs(r: Reminder) {
  const day = r.date.replace(/-/g, "");
  const next = new Date(r.date + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
  const esc = (s: string) => s.replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SaveBrain//EN", "BEGIN:VEVENT", `UID:${r.id}@savebrain`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`, `SUMMARY:${esc("SaveBrain: " + r.itemTitle)}`, `DESCRIPTION:${esc(r.itemLink)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT9H", `DESCRIPTION:${esc(r.itemTitle)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = "savebrain-reminder.ics"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export default function App({ sb, cfg, user }: { sb: SupabaseClient; cfg: Config; user: User }) {
  const [items, setItems] = useState<Item[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [needsDbUpdate, setNeedsDbUpdate] = useState(false);
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("All");
  const [category, setCategory] = useState("All");
  const [urgency, setUrgency] = useState("All");
  const [trust, setTrust] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("urgency");
  const [selected, setSelected] = useState<Item | null>(null);
  const [checkState, setCheckState] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState("");
  const [queueDates, setQueueDates] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("home");
  const [showInstall, setShowInstall] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => { try { return localStorage.getItem(BANNER_KEY) === "1"; } catch { return false; } });
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDone, setReviewDone] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [sharedLink, setSharedLink] = useState("");
  const toastTimer = useRef<number | null>(null);
  const showToast = (m: string) => { setToast(m); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(""), 3600); };
  const ref = projectRef(cfg);

  async function reloadRecords() {
    const [it, rem] = await Promise.all([
      sb.from("savebrain_items").select("*").order("created_at", { ascending: false }),
      sb.from("savebrain_reminders").select("*").order("date"),
    ]);
    if (it.error) throw it.error;
    const rows = (it.data || []) as Record<string, unknown>[];
    // Databases set up by an older SaveBrain lack the reminders table and the analysis columns.
    setNeedsDbUpdate(!!rem.error || (rows.length > 0 && !("steps" in rows[0])));
    setItems(rows.map(fromRow));
    setReminders(rem.error ? [] : (rem.data || []).map(reminderFromRow));
    return rows.length;
  }

  useEffect(() => {
    (async () => {
      try { await reloadRecords(); } catch (e) { setApiNote("Could not load your saves from Supabase: " + (e as Error).message); }
      setLoading(false);
    })();
    // Links shared into SaveBrain (?url=…) open the Add dialog prefilled.
    const params = new URLSearchParams(location.search);
    const shared = params.get("shared_url") || params.get("url") || params.get("text");
    if (shared) { setSharedLink(shared); setAddOpen(true); history.replaceState(null, "", location.pathname); }
  }, []);

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try { const n = await reloadRecords(); setApiNote(""); showToast(`Synced — ${n} saves loaded from your database.`); }
    catch (e) { showToast("Sync failed: " + (e as Error).message); }
    setSyncing(false);
  }

  async function fileRows(rows: ReturnType<typeof toRow>[]) {
    const { data, error } = await sb.from("savebrain_items").upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(/column|schema cache/i.test(error.message) ? "Your database needs the one-time update shown at the top of the page." : error.message);
    await reloadRecords();
    return data?.length || 0;
  }
  async function importReply(text: string) {
    const { rows } = parseMetaReply(text);
    const added = await fileRows(rows.map(r => toRow(r.row, r.url, user.id)));
    showToast(`Imported ${added} new saves${rows.length > added ? ` · ${rows.length - added} already in SaveBrain` : ""}.`);
  }
  async function addLink(url: string) {
    const added = await fileRows([toRow({ trust: "Check Claims", summary: "Added by link — import a Meta AI analysis for the full breakdown." }, url, user.id)]);
    showToast(added ? "Filed — it's in your To Do list." : "Already in SaveBrain.");
  }

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items]);
  const filtered = useMemo(() => {
    let list = items.filter(i => {
      if (platform !== "All" && i.platform !== platform) return false;
      if (category !== "All" && i.category !== category) return false;
      if (urgency !== "All" && i.urgency !== urgency) return false;
      if (trust !== "All" && i.trust !== trust) return false;
      if (status !== "All" && i.status !== status) return false;
      if (search) { const q = search.toLowerCase(); if (!(`${i.title} ${i.author} ${i.summary} ${i.category} ${i.action}`.toLowerCase().includes(q))) return false; }
      return true;
    });
    const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    list = [...list].sort((a, b) => sort === "urgency" ? (rank[a.urgency] - rank[b.urgency] || b.date.localeCompare(a.date)) : b.date.localeCompare(a.date));
    return list;
  }, [items, platform, category, urgency, trust, status, search, sort]);

  const stats = useMemo(() => ({
    total: items.length,
    needs: items.filter(i => i.status === "To Do").length,
    deadlines: items.filter(i => i.deadline).length,
    fake: items.filter(i => i.trust === "High Fake Risk").length,
    done: items.filter(i => i.status === "Done").length,
  }), [items]);

  const queue = useMemo(() => items.filter(i => i.urgency === "HIGH" || i.deadline).filter(i => i.status !== "Done").slice(0, 6), [items]);
  const reviewItems = useMemo(() => items.filter(i => i.urgency === "HIGH" && i.status !== "Done").sort((a, b) => b.date.localeCompare(a.date)), [items]);
  const todayLabel = useMemo(() => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), []);
  const greeting = useMemo(() => { const h = new Date().getHours(); return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening."; }, []);

  async function updateStatus(item: Item, next: Status) {
    const prev = items; setItems(items.map(i => i.id === item.id ? { ...i, status: next } : i));
    const { error } = await sb.from("savebrain_items").update({ status: next }).eq("id", item.id);
    if (error) { setItems(prev); showToast("Could not save that status change — try again."); return; }
    showToast(next === "Done" ? `Marked done: ${item.title}` : next === "Snoozed" ? `Snoozed: ${item.title}` : `Back to To Do: ${item.title}`);
  }
  async function unsave(item: Item) {
    if (!confirm(`Remove “${item.title}” from SaveBrain?`)) return;
    const prev = items; setItems(items.filter(i => i.id !== item.id));
    const { error } = await sb.from("savebrain_items").delete().eq("id", item.id);
    if (error) { setItems(prev); showToast("Could not unsave — try again."); return; }
    if (selected?.id === item.id) setSelected(null);
    showToast(`Unsaved: ${item.title}`);
  }
  async function createReminder(item: Item, date: string) {
    if (!date) { showToast("Pick a reminder date first."); return; }
    const { error } = await sb.from("savebrain_reminders").insert({ user_id: user.id, item_title: item.title, item_link: item.link, date });
    if (error) { showToast(needsDbUpdate ? "Reminders need the one-time database update shown at the top." : "Could not save the reminder — try again."); return; }
    await reloadRecords(); showToast(`Reminder set for ${fmt(date)} — ${item.title}`);
  }
  async function deleteReminder(r: Reminder) {
    const prev = reminders; setReminders(reminders.filter(x => x.id !== r.id));
    const { error } = await sb.from("savebrain_reminders").delete().eq("id", r.id);
    if (error) { setReminders(prev); showToast("Could not remove the reminder — try again."); return; }
    showToast("Reminder removed.");
  }

  function exportCSV() {
    const rows = [["title", "platform", "author", "date", "category", "urgency", "trust", "deadline", "action", "link", "status"]];
    filtered.forEach(i => rows.push([i.title, i.platform, i.author, i.date, i.category, i.urgency, i.trust, i.deadline, i.action, i.link, i.status]));
    const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "savebrain-saved-posts.csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} items to CSV.`);
  }
  async function signOut() { await sb.auth.signOut(); }
  async function disconnect() {
    if (!confirm("Disconnect this Supabase project from SaveBrain in this browser? Your saves stay in Supabase.")) return;
    await sb.auth.signOut(); clearConfig(); location.reload();
  }
  function dismissBanner(v: boolean) {
    setBannerDismissed(v);
    try { v ? localStorage.setItem(BANNER_KEY, "1") : localStorage.removeItem(BANNER_KEY); } catch { /* per-browser convenience only */ }
  }

  const resetFilters = () => { setSearch(""); setPlatform("All"); setCategory("All"); setUrgency("All"); setTrust("All"); setStatus("All"); setSort("urgency"); showToast("Filters reset — showing all saves."); };
  const startReview = () => { if (!reviewItems.length) { showToast("No HIGH urgency items left — you are clear."); return; } setReviewIndex(0); setReviewDone(0); setReviewActive(true); };
  const reviewCurrent = reviewItems[reviewIndex];
  const reviewAdvance = async (action: "next" | "done" | "snooze") => {
    if (!reviewCurrent) return;
    // Done/Snooze drop the item out of reviewItems, so the same index then points at the next one.
    if (action === "done") { await updateStatus(reviewCurrent, "Done"); setReviewDone(d => d + 1); }
    if (action === "snooze") { await updateStatus(reviewCurrent, "Snoozed"); setReviewDone(d => d + 1); }
    const remaining = action === "next" ? reviewItems.length : reviewItems.length - 1;
    const nextIndex = action === "next" ? reviewIndex + 1 : reviewIndex;
    if (nextIndex >= remaining) { setReviewActive(false); showToast(`Daily review finished — ${reviewDone + (action === "next" ? 0 : 1)} decided.`); setTab("home"); }
    else setReviewIndex(nextIndex);
  };
  const goTab = (t: Tab) => { setShowInstall(false); setTab(t); window.scrollTo({ top: 0 }); };
  const openAdd = () => { setSharedLink(""); setAddOpen(true); };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: "Home", icon: <Home size={20} /> },
    { id: "queue", label: "Queue", icon: <Zap size={20} /> },
    { id: "reminders", label: "Reminders", icon: <Bell size={20} /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
  ];

  const card = (item: Item) => (
    <article key={item.id} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 mb-4 slide-up overflow-hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full ${item.platform === "Instagram" ? "bg-pink-50 text-pink-700 border border-pink-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}><PlatformIcon p={item.platform} size={13} />{item.platform}</span>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--line)]">{item.type}</span>
        <span className="text-xs text-[var(--muted)] ml-auto">{fmt(item.date)}</span>
      </div>
      <div className="mt-3">
        <button onClick={() => { setSelected(item); setCheckState({}); }} className="text-left font-extrabold text-[17px] sm:text-lg leading-snug hover:underline min-h-[44px]">{item.title}</button>
        <div className="text-sm text-[var(--muted)] mt-0.5">{item.author} · {item.likes !== "—" ? `${item.likes} likes · ${item.comments} comments` : "Saved post"}</div>
        <p className="text-sm leading-relaxed mt-2 text-[var(--ink)]/90 break-words">{item.summary}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--line)]">{item.category}</span>
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${urgencyStyle(item.urgency)}`}>{item.urgency} urgency</span>
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${trustStyle(item.trust)}`}>{item.trust === "Verified" ? <span className="inline-flex items-center gap-1"><ShieldCheck size={11} /> Verified</span> : item.trust === "High Fake Risk" ? <span className="inline-flex items-center gap-1"><ShieldAlert size={11} /> High Fake Risk</span> : item.trust}</span>
          {item.deadline && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-[var(--blue-bg)] text-[var(--accent)]"><Calendar size={11} /> {item.deadline}</span>}
          <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${item.status === "Done" ? "bg-[var(--green-bg)] text-[var(--green)]" : item.status === "Snoozed" ? "bg-[var(--amber-bg)] text-[var(--amber)]" : "bg-[var(--surface)]"}`}>{item.status}</span>
        </div>
        <div className="mt-3 text-sm bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2.5"><span className="font-bold">Next action:</span> {item.action}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <a href={safeLink(item.link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full">Open Original <ExternalLink size={13} /></a>
        <button onClick={() => createReminder(item, queueDates[item.id] || tomorrow())} className="inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full hover:bg-[var(--surface)]"><Bell size={14} /> Reminder</button>
        {item.status === "Done" ? <button onClick={() => updateStatus(item, "To Do")} className="inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><CheckCircle2 size={14} /> Undo</button> : <button onClick={() => updateStatus(item, "Done")} className="inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><CheckCircle2 size={14} /> Mark Done</button>}
        <button onClick={() => updateStatus(item, item.status === "Snoozed" ? "To Do" : "Snoozed")} className="inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><AlarmClock size={14} /> {item.status === "Snoozed" ? "Unsnooze" : "Snooze"}</button>
        <button onClick={() => { setSelected(item); setCheckState({}); }} className="inline-flex items-center justify-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Eye size={14} /> Full Analysis</button>
        <button onClick={() => unsave(item)} className="inline-flex items-center justify-center gap-1.5 text-[var(--danger)] text-sm font-bold px-3 min-h-[44px] rounded-full hover:bg-[var(--danger-bg)]"><Trash2 size={14} /> Unsave</button>
      </div>
    </article>
  );

  const filtersPanel = (
    <aside className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 lg:sticky lg:top-[172px]">
      <div className="flex items-center justify-between"><h2 className="font-extrabold">Filters</h2><button onClick={resetFilters} className="text-xs font-bold text-[var(--accent)] hover:underline min-h-[44px] px-2">Reset</button></div>
      <label className="block mt-3 text-xs font-bold text-[var(--muted)]">Search</label>
      <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-xl px-3 py-2 bg-[var(--surface)] min-h-[44px]"><Search size={16} className="text-[var(--muted)] shrink-0" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, author, summary…" className="w-full bg-transparent outline-none text-sm min-w-0" /></div>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Platform</label>
      <div className="mt-1 grid grid-cols-3 gap-1.5">{["All", "Instagram", "Facebook"].map(p => (<button key={p} onClick={() => setPlatform(p)} className={`text-xs font-bold px-2 min-h-[44px] rounded-lg border ${platform === p ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--surface)]"}`}>{p === "All" ? "All" : p === "Instagram" ? "IG" : "FB"}</button>))}</div>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Category</label>
      <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]"><option value="All">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Urgency</label>
      <div className="mt-1 flex flex-wrap gap-1.5">{["All", "HIGH", "MEDIUM", "LOW"].map(u => (<button key={u} onClick={() => setUrgency(u)} className={`text-xs font-bold px-3 min-h-[40px] rounded-full border ${urgency === u ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--ink)]" : "border-[var(--line)]"}`}>{u}</button>))}</div>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Trust</label>
      <select value={trust} onChange={e => setTrust(e.target.value)} className="mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]"><option value="All">All trust levels</option><option>Verified</option><option>Likely Legit</option><option>Check Claims</option><option>High Fake Risk</option></select>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Status</label>
      <div className="mt-1 flex flex-wrap gap-1.5">{["All", "To Do", "Done", "Snoozed"].map(s => (<button key={s} onClick={() => setStatus(s)} className={`text-xs font-bold px-3 min-h-[40px] rounded-full border ${status === s ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--ink)]" : "border-[var(--line)]"}`}>{s}</button>))}</div>
      <label className="block mt-4 text-xs font-bold text-[var(--muted)]">Sort</label>
      <select value={sort} onChange={e => setSort(e.target.value)} className="mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2.5 text-sm bg-[var(--surface)] outline-none min-h-[44px]"><option value="urgency">Urgency, then newest</option><option value="date">Newest first</option></select>
      <div className="mt-4 pt-3 border-t border-[var(--line)] text-xs text-[var(--muted)] leading-relaxed">Showing <b className="text-[var(--ink)]">{filtered.length}</b> of {items.length} saves.<br />Export CSV uses this filtered view.</div>
    </aside>
  );

  const reminderList = (compact: boolean) => (
    <ul className={compact ? "mt-2 space-y-2" : "mt-4 space-y-2"}>{reminders.map(r => (
      <li key={r.id} className={compact ? "flex gap-2 items-start text-sm border border-[var(--line)] rounded-lg px-2.5 py-2" : "flex gap-3 items-start bg-[var(--card)] border border-[var(--line)] rounded-2xl px-4 py-3"}>
        <Calendar size={compact ? 14 : 18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <div className={compact ? "font-bold text-xs leading-snug" : "font-bold text-sm leading-snug"}>{r.itemTitle}</div>
          <div className={compact ? "text-[11px] text-[var(--muted)]" : "text-xs text-[var(--muted)] mt-0.5"}>{fmt(r.date)}</div>
          {!compact && <div className="flex flex-wrap gap-3"><a href={safeLink(r.itemLink)} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-1 mt-1 min-h-[36px]">Open original <ExternalLink size={12} /></a><button onClick={() => downloadIcs(r)} className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-1 mt-1 min-h-[36px]"><CalendarPlus size={12} /> Add to calendar</button></div>}
        </div>
        <button onClick={() => deleteReminder(r)} aria-label="Delete reminder" className={compact ? "text-[var(--danger)] shrink-0 p-1 min-h-[36px] min-w-[36px]" : "text-[var(--danger)] shrink-0 p-2 min-h-[40px] min-w-[40px]"}><X size={compact ? 15 : 16} /></button>
      </li>))}</ul>
  );

  const queuePanel = (compact = false) => (
    <div className="space-y-3">
      {queue.length === 0 ? <p className="text-sm text-[var(--muted)]">Nothing urgent right now. Your queue is clear — enjoy the calm.</p> : queue.map(q => { const d = queueDates[q.id] || tomorrow(); return (
        <div key={q.id} className="border border-[var(--line)] rounded-xl p-3 bg-[var(--card)]">
          <div className="flex gap-1.5 flex-wrap"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${urgencyStyle(q.urgency)}`}>{q.urgency}</span>{q.deadline && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--blue-bg)] text-[var(--accent)]">{q.deadline}</span>}</div>
          <button onClick={() => { setSelected(q); setCheckState({}); }} className="font-bold text-sm leading-snug mt-1.5 text-left hover:underline">{q.title}</button><div className="text-xs text-[var(--muted)]">{q.author} · {q.category}</div>
          <label className="block text-[11px] font-bold text-[var(--muted)] mt-2">Reminder date</label>
          <input type="date" value={d} onChange={e => setQueueDates({ ...queueDates, [q.id]: e.target.value })} className="mt-1 w-full border border-[var(--line)] rounded-lg px-2 py-2 text-sm bg-[var(--surface)] min-h-[44px]" />
          <button onClick={() => createReminder(q, d)} className="mt-2 w-full inline-flex justify-center items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-3 min-h-[44px] rounded-full"><Bell size={13} /> Create reminder</button>
        </div>); })}
      {!compact && <p className="text-xs text-[var(--muted)]">Queue shows HIGH urgency + deadline items that are not done, up to 6.</p>}
    </div>
  );

  const pipelineStrip = (cls: string) => (
    <div className={cls}>
      <span className="shrink-0 font-bold text-white flex items-center gap-1"><Sparkles size={13} className="text-amber-300" /> HOW IT WORKS</span>
      {PIPELINE.map((p, i) => (<span key={p} className="flex items-center gap-2 shrink-0"><span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>{p}{i < PIPELINE.length - 1 && <ArrowRight size={12} className="text-slate-500" />}</span>))}
    </div>
  );

  return (
    <div data-safe-area-inset-root className="min-h-[100vh] bg-[var(--surface)] text-[var(--ink)] pb-[76px] md:pb-0" style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)" }}>
      {/* STICKY HEADER */}
      <header data-safe-area-sticky-top className="sticky z-30 bg-[var(--header)] text-white border-b border-slate-700" style={{ top: "var(--safe-area-inset-top)" }}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <button onClick={() => goTab("home")} className="flex items-center gap-3 min-w-0 text-left" aria-label="SaveBrain home">
            <AppIcon size={40} />
            <span className="min-w-0"><span className="block font-extrabold text-lg sm:text-xl leading-none tracking-tight">SaveBrain</span><span className="block text-[11px] sm:text-xs text-slate-400 truncate">Your Saved Posts Second Brain</span></span>
          </button>
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] bg-slate-800 border border-slate-700 rounded-full px-2.5 py-1 ml-1"><span className={`w-1.5 h-1.5 rounded-full ${apiNote ? "bg-red-400" : "bg-emerald-400 pulse-dot"}`} /> {apiNote ? "Not connected" : "Connected · your Supabase"}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={() => setShowInstall(true)} className="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 border border-slate-600 text-sm font-semibold px-3.5 min-h-[40px] rounded-full hover:bg-slate-700"><Smartphone size={15} /> Get Android App</button>
            <button onClick={syncNow} disabled={syncing} className="inline-flex items-center justify-center gap-1.5 bg-white text-slate-900 text-sm font-bold px-4 min-h-[44px] rounded-full hover:bg-slate-200 disabled:opacity-60"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> Sync Now</button>
            <button onClick={exportCSV} className="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 border border-slate-600 text-sm font-semibold px-3.5 min-h-[40px] rounded-full hover:bg-slate-700"><Download size={15} /> Export CSV</button>
          </div>
        </div>
        {/* DESKTOP TOP NAV */}
        <nav className="hidden md:block border-t border-slate-800" aria-label="Main navigation">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 flex gap-1">
            {tabs.map(t => (<button key={t.id} onClick={() => goTab(t.id)} className={`flex items-center gap-2 text-sm font-bold px-4 py-3 border-b-2 ${tab === t.id && !showInstall ? "border-white text-white" : "border-transparent text-slate-400 hover:text-white"}`}>{t.icon}<span className="text-sm">{t.label}</span>{t.id === "reminders" && reminders.length > 0 && <span className="bg-white text-slate-900 text-[11px] font-extrabold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center">{reminders.length}</span>}</button>))}
            <button onClick={() => setShowInstall(true)} className={`flex items-center gap-2 text-sm font-bold px-4 py-3 border-b-2 ml-auto ${showInstall ? "border-white text-white" : "border-transparent text-slate-400 hover:text-white"}`}><Smartphone size={18} /> Install App</button>
          </div>
        </nav>
        <div className="border-t border-slate-800 md:hidden"><div className="max-w-[1440px] mx-auto">{pipelineStrip("px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar text-[11px] text-slate-300")}</div></div>
        <div className="hidden md:block border-t border-slate-800"><div className="max-w-[1440px] mx-auto">{pipelineStrip("px-4 sm:px-6 py-2.5 flex gap-2 overflow-x-auto no-scrollbar text-[11px] sm:text-xs text-slate-300")}</div></div>
        {syncing && (
          <div className="border-t border-slate-800 bg-slate-900"><div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5">
            <div className="flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin text-emerald-400" /><span className="font-semibold">Syncing:</span><span className="text-slate-300">loading your saves and reminders…</span></div>
          </div></div>
        )}
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 sm:py-5 overflow-x-clip">
        {apiNote && <div className="mb-3 flex gap-2 items-start text-xs sm:text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2.5"><Info size={16} className="shrink-0 mt-0.5" /><span>{apiNote}</span></div>}
        {needsDbUpdate && <DbUpdateBanner projectRef={ref} toast={showToast} />}

        {/* MOBILE INSTALL BANNER */}
        {!bannerDismissed && !showInstall && (
          <div className="md:hidden mb-4 bg-[var(--ink)] text-[var(--surface)] rounded-2xl p-4 flex gap-3 items-center">
            <div className="shrink-0"><AppIcon size={44} /></div>
            <div className="min-w-0 flex-1"><div className="font-extrabold text-[15px] leading-tight">Add SaveBrain to your Home Screen</div><p className="text-xs opacity-80 mt-1 leading-relaxed">Open fullscreen like a native app. No Play Store needed for the fast way.</p><button onClick={() => setShowInstall(true)} className="mt-2 inline-flex items-center gap-1 bg-white text-slate-900 text-xs font-bold px-3 min-h-[36px] rounded-full">See the 2 ways <ChevronRight size={14} /></button></div>
            <button onClick={() => { dismissBanner(true); showToast("Install banner dismissed. Find it again in Settings → Install App."); }} aria-label="Dismiss install banner" className="shrink-0 p-2 rounded-full border border-white/30 min-h-[40px] min-w-[40px] flex items-center justify-center"><X size={16} /></button>
          </div>
        )}

        {showInstall ? (
          <section className="max-w-[820px] mx-auto">
            <button onClick={() => setShowInstall(false)} className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] min-h-[44px]">← Back to SaveBrain</button>
            <div className="mt-2 bg-[var(--header)] text-white rounded-3xl p-5 sm:p-7 flex gap-4 items-center overflow-hidden">
              <AppIcon size={72} />
              <div className="min-w-0"><div className="text-[11px] font-bold tracking-widest text-slate-400">SAVEBRAIN · ANDROID APP</div><h1 className="text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold leading-tight">Get SaveBrain on your phone</h1><p className="text-sm text-slate-300 mt-1">Two real ways — the fast one today, and the Play Store one when you are ready.</p></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 mt-4 text-sm leading-relaxed"><b>No fake download button here.</b> There is no APK file in this page to download. Use one of the two methods below — both install this same web app. Already signed in on your computer? Use <b>Settings → Connect another device</b> to open SaveBrain on your phone first.</div>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div className="bg-[var(--card)] border-2 border-emerald-200 rounded-2xl p-5">
                <div className="flex items-center gap-2"><span className="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-2 py-1 rounded-full">WAY 1 · FASTEST TODAY</span></div>
                <h2 className="font-extrabold text-lg mt-3 flex items-center gap-2"><Globe size={19} className="text-emerald-600" /> Install as a web app</h2>
                <p className="text-sm text-[var(--muted)] mt-1">Opens fullscreen like a native app. No Play Store needed.</p>
                <ol className="mt-4 space-y-3 text-sm leading-relaxed">{["Open this app in Chrome on Android.", "Tap Menu — the 3 dots in the top-right of Chrome.", "Tap Add to Home screen or Install app.", "Confirm Add / Install.", "Open SaveBrain from your Home Screen — it now opens fullscreen, with its own icon."].map((s, i) => (<li key={s} className="flex gap-2.5"><span className="w-6 h-6 shrink-0 rounded-full bg-[var(--ink)] text-[var(--surface)] text-xs font-bold flex items-center justify-center">{i + 1}</span><span>{s}</span></li>))}</ol>
                <div className="mt-4 bg-[var(--surface)] rounded-xl p-3 text-xs text-[var(--muted)]">Tip: if Chrome shows “Install app” instead of “Add to Home screen”, use that — it is the same result.</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <div className="flex items-center gap-2"><span className="bg-blue-100 text-blue-800 text-xs font-extrabold px-2 py-1 rounded-full">WAY 2 · FULL ANDROID APK / AAB</span></div>
                <h2 className="font-extrabold text-lg mt-3 flex items-center gap-2"><Package size={19} className="text-blue-600" /> Wrap it for Play Store</h2>
                <p className="text-sm text-[var(--muted)] mt-1">Wrap this same web app with PWABuilder / Bubblewrap (Trusted Web Activity).</p>
                <ol className="mt-4 space-y-3 text-sm leading-relaxed">{["Make sure this app is installable as a web app (Way 1 works).", "Go to PWABuilder.com and enter this app’s web address.", "Choose Android / Trusted Web Activity, then download the Bubblewrap / Android Studio project.", "In Android Studio / Bubblewrap, set your package name, app name (SaveBrain) and icon — the S in a rounded square.", "Build the signed AAB (for Play Store) or APK (for direct install).", "Upload the AAB to Google Play Console, or share the APK directly."].map((s, i) => (<li key={s} className="flex gap-2.5"><span className="w-6 h-6 shrink-0 rounded-full bg-[var(--surface)] border border-[var(--line)] text-xs font-bold flex items-center justify-center">{i + 1}</span><span>{s}</span></li>))}</ol>
                <div className="mt-4 bg-[var(--surface)] rounded-xl p-3 text-xs text-[var(--muted)]">The wrapped app still opens this same SaveBrain — your saves and reminders stay the same.</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setShowInstall(false)} className="bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full">Back to Daily Home</button><button onClick={() => { setShowInstall(false); goTab("settings"); }} className="border border-[var(--line)] text-sm font-bold px-5 min-h-[48px] rounded-full">Open Settings</button></div>
          </section>
        ) : tab === "settings" ? (
          <section className="max-w-[820px] mx-auto">
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight">Settings</h1><p className="text-sm text-[var(--muted)] mt-1">Make SaveBrain behave like the app you open every morning.</p>
            <div className="mt-4 space-y-4">
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold flex items-center gap-2"><Sparkles size={18} /> Sync with Meta AI</h2>
                <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">Instagram and Facebook don't let apps read your saves, so SaveBrain gets them through Meta AI. Copy a prompt, paste it into Meta AI, then paste the reply in <b className="text-[var(--ink)]">Add saves</b>.</p>
                <div className="mt-3"><MetaPrompts onCopied={showToast} /></div>
                <div className="mt-4 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 text-sm leading-relaxed"><b>Daily sync:</b> in Meta AI, say “Every day at 7:00, run this:” followed by the <b>Last 24 hours</b> prompt. Each morning, copy its reply into SaveBrain.</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={openAdd} className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Plus size={15} /> Add saves</button>
                  <button onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> Sync Now — reload</button>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold flex items-center gap-2"><MonitorSmartphone size={18} /> Connect another device</h2>
                <ConnectDevice cfg={cfg} toast={showToast} />
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold flex items-center gap-2"><Smartphone size={18} /> Install App</h2><p className="text-sm text-[var(--muted)] mt-1">Add SaveBrain to your Android Home Screen, or wrap it for Play Store.</p>
                <button onClick={() => setShowInstall(true)} className="mt-3 inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full">Get Android App — 2 ways <ChevronRight size={15} /></button>
                {!bannerDismissed && <p className="text-xs text-[var(--muted)] mt-2">Install banner is showing on mobile Home.</p>}
                {bannerDismissed && <button onClick={() => dismissBanner(false)} className="mt-2 block text-xs font-bold text-[var(--accent)] min-h-[40px]">Show install banner again</button>}
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold flex items-center gap-2"><Database size={18} /> Storage</h2><p className="text-sm text-[var(--muted)] mt-1">Your saves live in your own Supabase project — only your account can read them.</p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">{[{ l: "Saved posts", v: items.length }, { l: "Reminders", v: reminders.length }, { l: "Project", v: ref.slice(0, 6) + "…" }].map(s => (<div key={s.l} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 min-w-0"><div className="text-lg font-extrabold truncate">{s.v}</div><div className="text-[11px] text-[var(--muted)] font-bold">{s.l}</div></div>))}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={exportCSV} className="inline-flex items-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Download size={15} /> Export CSV</button>
                  <a href={`https://supabase.com/dashboard/project/${ref}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full">Open in Supabase <ExternalLink size={13} /></a>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold">Account</h2><p className="text-sm text-[var(--muted)] mt-1">Signed in as <b className="text-[var(--ink)]">{user.email}</b></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={signOut} className="inline-flex items-center gap-2 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><LogOut size={15} /> Sign out</button>
                  <button onClick={disconnect} className="inline-flex items-center gap-2 text-[var(--danger)] text-sm font-bold px-4 min-h-[44px] rounded-full hover:bg-[var(--danger-bg)]"><Unplug size={15} /> Use a different Supabase project</button>
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5">
                <h2 className="font-extrabold">How SaveBrain works</h2><p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">Instagram / Facebook do not let apps read the posts you saved, so SaveBrain does not poll them. Meta AI can see your saves: it analyzes them with the SaveBrain prompt, you paste the reply here, and SaveBrain files each one with its summary, steps, urgency and trust score. Nothing is posted on your behalf.</p>
              </div>
            </div>
          </section>
        ) : tab === "queue" ? (
          <section className="max-w-[820px] mx-auto">
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight">Up Next — Queue</h1><p className="text-sm text-[var(--muted)] mt-1">HIGH urgency + deadline items first. Pick a date, create a reminder.</p>
            <button onClick={startReview} className="mt-4 w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[48px] rounded-full"><Play size={16} /> Start Daily Review · {reviewItems.length} HIGH items</button>
            <div className="mt-4">{queuePanel()}</div>
            <div className="mt-6"><h2 className="font-extrabold mb-3">All HIGH urgency</h2>{reviewItems.length === 0 ? <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-500" /><p className="font-bold mt-2">No HIGH items left</p><p className="text-sm text-[var(--muted)]">You are clear. Check the full feed on Home.</p></div> : reviewItems.map(card)}</div>
          </section>
        ) : tab === "reminders" ? (
          <section className="max-w-[820px] mx-auto">
            <h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight">Reminders</h1><p className="text-sm text-[var(--muted)] mt-1">Everything you asked to be reminded about — in one place. Use “Add to calendar” to get a notification on the day.</p>
            {reminders.length === 0 ? <div className="mt-4 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center"><Bell className="mx-auto text-[var(--muted)]" /><h3 className="font-bold mt-2">No reminders yet</h3><p className="text-sm text-[var(--muted)] mt-1">Create one from any card, or from the Queue.</p><button onClick={() => goTab("queue")} className="mt-3 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[44px] rounded-full">Go to Queue</button></div> : reminderList(false)}
            <h2 className="font-extrabold mt-6 mb-3">Add from Queue</h2>{queuePanel(true)}
          </section>
        ) : (
          <>
            {/* DAILY HOME */}
            <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
              <div><p className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">Daily Home · {todayLabel}</p><h1 className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight mt-1">{greeting}<br className="sm:hidden" /> Here is what needs you.</h1><p className="text-sm text-[var(--muted)] mt-1 max-w-[640px]">Everything you saved, turned into action. Meta AI analyzes your saves, you paste its reply here, and SaveBrain files them by urgency and trust.</p></div>
              <button onClick={openAdd} className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full hover:opacity-90"><Plus size={16} /> Add Saves</button>
            </div>

            <div className="bg-[var(--card)] border border-[var(--line)] rounded-3xl p-4 sm:p-5 mb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">Today</div><div className="text-lg sm:text-xl font-extrabold mt-1">{stats.needs} need action · {stats.deadlines} deadlines · {stats.fake} fake-risk</div><p className="text-sm text-[var(--muted)] mt-0.5">Start with HIGH urgency — one card at a time.</p></div>
                <button onClick={startReview} className="inline-flex items-center justify-center gap-2 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-5 min-h-[52px] rounded-full w-full sm:w-auto"><Play size={17} /> Start Daily Review · {reviewItems.length}</button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">{[{ l: "Need action", v: stats.needs }, { l: "Deadlines", v: stats.deadlines }, { l: "Fake-risk", v: stats.fake }].map(s => (<div key={s.l} className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-3"><div className="text-[clamp(1.4rem,4vw,1.8rem)] font-extrabold leading-none">{s.v}</div><div className="text-[11px] font-bold text-[var(--muted)] mt-1">{s.l}</div></div>))}</div>
              {reviewItems.length > 0 && <button onClick={() => { setSelected(reviewItems[0]); setCheckState({}); }} className="mt-3 w-full flex items-center justify-between gap-2 text-left bg-[var(--surface)] border border-[var(--line)] rounded-2xl px-4 py-3 min-h-[56px]"><span className="min-w-0"><span className="block text-[11px] font-bold text-[var(--danger)]">FIRST UP · HIGH</span><span className="block font-bold text-sm truncate">{reviewItems[0].title}</span></span><ChevronRight size={18} className="shrink-0" /></button>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[{ l: "Total Analyzed", v: stats.total, s: "Across Instagram + Facebook", icon: <Database size={16} /> }, { l: "Needs Action", v: stats.needs, s: "Status: To Do", icon: <ListChecks size={16} /> }, { l: "Deadlines", v: stats.deadlines, s: "Items with a deadline", icon: <Calendar size={16} /> }, { l: "Fake-Risk Flagged", v: stats.fake, s: "High Fake Risk", icon: <AlertTriangle size={16} /> }, { l: "Done", v: stats.done, s: "Completed actions", icon: <CheckCircle2 size={16} /> }].map(s => (
                <div key={s.l} className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-3.5"><div className="flex items-center justify-between text-[var(--muted)]"><span className="text-xs font-bold uppercase tracking-wide">{s.l}</span>{s.icon}</div><div className="text-[clamp(1.6rem,3vw,2rem)] font-extrabold leading-none mt-2">{s.v}</div><div className="text-xs text-[var(--muted)] mt-1">{s.s}</div></div>
              ))}
            </div>

            <div className="grid lg:grid-cols-[260px_minmax(0,1fr)_300px] gap-5 items-start">
              {filtersPanel}
              <section>
                {loading ? <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 text-sm text-[var(--muted)] flex gap-2 items-center"><Loader2 className="animate-spin" size={18} /> Loading your second brain…</div> : items.length === 0 ? (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center"><Bookmark className="mx-auto text-[var(--muted)]" /><h3 className="font-bold mt-2">No saves yet</h3><p className="text-sm text-[var(--muted)] mt-1">Ask Meta AI to analyze your saved posts, then paste its reply here.</p><button onClick={openAdd} className="mt-3 inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Plus size={15} /> Add your first saves</button></div>
                ) : filtered.length === 0 ? (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-8 text-center"><Bookmark className="mx-auto text-[var(--muted)]" /><h3 className="font-bold mt-2">No saves match these filters</h3><p className="text-sm text-[var(--muted)] mt-1">Try clearing search or resetting filters.</p><button onClick={resetFilters} className="mt-3 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full">Reset filters</button></div>
                ) : filtered.map(card)}
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4"><div className="flex items-center gap-2 font-extrabold"><ShieldAlert size={18} className="text-[var(--danger)]" /> Fake detector — how scoring works</div><p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">Every save is scored for trust, not just urgency. A high score means pause before you pay, share, or act.</p><ul className="mt-3 space-y-2 text-sm">{["Sales screenshots — easy to fake, never proof alone", "Guaranteed income — real income is never guaranteed", "Comment-gated — “comment X for the link” hides the offer", "Small account + big claim — reach does not equal proof", "No proof — no repo, receipt, employer, or source shown"].map(s => (<li key={s} className="flex gap-2"><AlertTriangle size={15} className="text-[var(--amber)] shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul><div className="mt-3 text-xs font-bold">Verified = public source checks out · Likely Legit = plausible, source-based · Check Claims = verify before acting · High Fake Risk = do not buy without proof.</div></div>
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4"><div className="flex items-center gap-2 font-extrabold"><FileSpreadsheet size={18} className="text-[var(--accent)]" /> Storage — your Supabase + CSV export</div><p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">Each analyzed save is filed as one structured record in your own database. Export any filtered view to CSV at any time.</p><pre className="mono mt-3 text-[11px] leading-relaxed bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 overflow-x-auto">{"savebrain_items {\n  title, platform, author, post_date, post_type,\n  summary, category, urgency, trust, deadline,\n  action, url, status, steps, why, signals,\n  links, checklist\n}\nsavebrain_reminders {\n  item_title, item_link, date\n}"}</pre><div className="mt-3 flex flex-wrap gap-2"><button onClick={exportCSV} className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-xs font-bold px-3 min-h-[40px] rounded-full"><Download size={13} /> Export current view</button></div></div>
                </div>
              </section>
              <aside className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 lg:sticky lg:top-[172px]">
                <div className="flex items-center gap-2"><Zap size={18} className="text-amber-500" /><h2 className="font-extrabold">Up Next — Reminders</h2></div>
                <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">HIGH urgency + deadline items first. Pick a date, create a reminder — it is saved to your queue.</p>
                <div className="mt-3">{queuePanel()}</div>
                <div className="mt-4 pt-3 border-t border-[var(--line)]"><h3 className="font-bold text-sm flex items-center gap-1.5"><Clock size={14} /> My reminders ({reminders.length})</h3>
                  {reminders.length === 0 ? <p className="text-xs text-[var(--muted)] mt-2">No reminders yet. Create one from any card or from Up Next.</p> : reminderList(true)}
                </div>
                <button onClick={() => setShowInstall(true)} className="mt-4 w-full inline-flex justify-center items-center gap-2 border border-[var(--line)] text-xs font-bold px-3 min-h-[44px] rounded-full"><MonitorSmartphone size={14} /> Install on Android</button>
              </aside>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-8 text-xs text-[var(--muted)] leading-relaxed">
        <div className="border-t border-[var(--line)] pt-4"><b className="text-[var(--ink)]">How saves arrive:</b> Instagram / Facebook do not let apps read your saved posts, so SaveBrain imports them from Meta AI's analysis — paste its reply in Add Saves, or set up a daily Meta AI task. It is not automatic. <b className="text-[var(--ink)]">Privacy:</b> your saves and reminders live in your own Supabase project, only your account can read them, and nothing is posted on your behalf.</div>
      </footer>

      {/* BOTTOM NAV — MOBILE */}
      <nav aria-label="Bottom navigation" className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[var(--card)] border-t border-[var(--line)]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-4">
          {tabs.map(t => (<button key={t.id} onClick={() => goTab(t.id)} className={`flex flex-col items-center gap-0.5 py-2.5 min-h-[64px] text-[11px] font-bold ${tab === t.id && !showInstall ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}><span className={`p-1.5 rounded-full ${tab === t.id && !showInstall ? "bg-[var(--surface)]" : ""}`}>{t.icon}</span>{t.label}{t.id === "reminders" && reminders.length > 0 && <span className="bg-[var(--danger)] text-white text-[10px] font-extrabold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center -mt-1">{reminders.length}</span>}</button>))}
        </div>
      </nav>

      {addOpen && <AddSaveModal initialLink={sharedLink} onClose={() => setAddOpen(false)} onImport={importReply} onAddLink={addLink} toast={showToast} />}

      {/* DAILY REVIEW */}
      {reviewActive && reviewCurrent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setReviewActive(false)}>
          <div className="bg-[var(--card)] w-full max-w-[640px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><span className="text-xs font-bold tracking-widest text-[var(--muted)] uppercase">Daily Review · {reviewIndex + 1} of {reviewItems.length}</span><button onClick={() => setReviewActive(false)} aria-label="Close review" className="p-2 rounded-full border border-[var(--line)] min-h-[40px] min-w-[40px]"><X size={16} /></button></div>
            <div className="mt-3 h-2 bg-[var(--surface)] rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(reviewIndex / reviewItems.length) * 100}%` }} /></div>
            <div className="flex flex-wrap gap-1.5 mt-4"><span className={`text-xs font-bold px-2 py-1 rounded-full border ${urgencyStyle(reviewCurrent.urgency)}`}>{reviewCurrent.urgency}</span><span className={`text-xs font-bold px-2 py-1 rounded-full ${trustStyle(reviewCurrent.trust)}`}>{reviewCurrent.trust}</span>{reviewCurrent.deadline && <span className="text-xs font-bold px-2 py-1 rounded-full bg-[var(--blue-bg)] text-[var(--accent)]">{reviewCurrent.deadline}</span>}</div>
            <h2 className="text-xl sm:text-2xl font-extrabold leading-tight mt-3">{reviewCurrent.title}</h2><div className="text-sm text-[var(--muted)] mt-1">{reviewCurrent.author} · {reviewCurrent.category}</div>
            <p className="text-sm leading-relaxed mt-3">{reviewCurrent.summary}</p>
            <div className="mt-3 text-sm bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2.5"><span className="font-bold">Next action:</span> {reviewCurrent.action}</div>
            <div className="grid grid-cols-3 gap-2 mt-5">
              <button onClick={() => reviewAdvance("done")} className="inline-flex justify-center items-center gap-1.5 bg-emerald-600 text-white text-sm font-bold px-3 min-h-[52px] rounded-full"><Check size={16} /> Done</button>
              <button onClick={() => reviewAdvance("snooze")} className="inline-flex justify-center items-center gap-1.5 bg-amber-500 text-white text-sm font-bold px-3 min-h-[52px] rounded-full"><AlarmClock size={16} /> Snooze</button>
              <button onClick={() => reviewAdvance("next")} className="inline-flex justify-center items-center gap-1.5 border-2 border-[var(--line)] text-sm font-bold px-3 min-h-[52px] rounded-full">Next <ArrowRight size={16} /></button>
            </div>
            <button onClick={() => { setSelected(reviewCurrent); setCheckState({}); }} className="mt-3 w-full text-sm font-bold text-[var(--accent)] min-h-[44px]">Full analysis →</button>
            <p className="text-xs text-[var(--muted)] text-center mt-1">Done / Snooze saves immediately. Next keeps it in To Do.</p>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelected(null)}>
          <div className="bg-[var(--card)] w-full max-w-[720px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5 items-center"><PlatformIcon p={selected.platform} size={14} /><span className="text-xs font-bold">{selected.platform} · {selected.type} · {fmt(selected.date)}</span></div><h2 className="text-xl sm:text-2xl font-extrabold leading-tight mt-1">{selected.title}</h2><div className="text-sm text-[var(--muted)] mt-1">{selected.author} · {selected.category}</div></div><button onClick={() => setSelected(null)} aria-label="Close detail" className="p-2 rounded-full border border-[var(--line)] min-h-[40px] min-w-[40px]"><X size={18} /></button></div>
            <div className="flex flex-wrap gap-1.5 mt-3"><span className={`text-xs font-bold px-2 py-1 rounded-full border ${urgencyStyle(selected.urgency)}`}>{selected.urgency} urgency</span><span className={`text-xs font-bold px-2 py-1 rounded-full ${trustStyle(selected.trust)}`}>{selected.trust}</span>{selected.deadline && <span className="text-xs font-bold px-2 py-1 rounded-full bg-[var(--blue-bg)] text-[var(--accent)]">Deadline: {selected.deadline}</span>}<span className="text-xs font-bold px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--line)]">Status: {selected.status}</span></div>
            <h3 className="font-extrabold mt-5">What it is</h3><p className="text-sm leading-relaxed mt-1">{selected.summary || "No summary yet — import a Meta AI analysis for this link."}</p>
            {selected.steps.length > 0 && <><h3 className="font-extrabold mt-4">Step-by-step extracted</h3><ol className="mt-2 space-y-1.5">{selected.steps.map((s, i) => (<li key={i} className="flex gap-2 text-sm"><span className="w-5 h-5 shrink-0 rounded-full bg-[var(--ink)] text-[var(--surface)] text-[11px] font-bold flex items-center justify-center">{i + 1}</span><span>{s}</span></li>))}</ol></>}
            {selected.why && <><h3 className="font-extrabold mt-4">Why this urgency</h3><p className="text-sm leading-relaxed mt-1">{selected.why}</p></>}
            {selected.signals.length > 0 && <><h3 className="font-extrabold mt-4">Trust breakdown — fake signals checklist</h3><ul className="mt-2 space-y-1.5">{selected.signals.map((s, i) => (<li key={i} className="flex gap-2 text-sm"><AlertTriangle size={15} className="text-[var(--amber)] shrink-0 mt-0.5" /><span>{s}</span></li>))}</ul></>}
            {selected.links.length > 0 && <><h3 className="font-extrabold mt-4">Links extracted</h3><ul className="mt-2 space-y-1">{selected.links.map((l, i) => (<li key={i} className="text-sm font-mono break-all">{l}</li>))}</ul></>}
            {selected.checklist.length > 0 && <><h3 className="font-extrabold mt-4">Checklist of actions</h3><div className="mt-2 space-y-2">{selected.checklist.map((c, i) => { const k = `${selected.id}-${i}`; return (<label key={k} className="flex gap-2 items-start text-sm cursor-pointer bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2.5"><input type="checkbox" checked={!!checkState[k]} onChange={e => setCheckState({ ...checkState, [k]: e.target.checked })} className="mt-0.5 w-4 h-4 accent-black" /><span className={checkState[k] ? "line-through text-[var(--muted)]" : ""}>{c}</span></label>); })}</div></>}
            <div className="flex flex-wrap gap-2 mt-5"><a href={safeLink(selected.link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--surface)] text-sm font-bold px-4 min-h-[44px] rounded-full">Open Original <ExternalLink size={14} /></a><button onClick={() => { setSelected(null); createReminder(selected, tomorrow()); }} className="inline-flex items-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Bell size={14} /> Create Reminder</button><button onClick={() => { updateStatus(selected, selected.status === "Done" ? "To Do" : "Done"); setSelected(null); }} className="inline-flex items-center gap-1.5 border border-[var(--line)] text-sm font-bold px-4 min-h-[44px] rounded-full"><Play size={14} /> {selected.status === "Done" ? "Undo Done" : "Mark Done"}</button></div>
            <p className="text-xs text-[var(--muted)] mt-3">Checklist ticks in this detail view are for working through the steps; status and reminders above are saved.</p>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-[84px] md:bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-[var(--ink)] text-[var(--surface)] text-sm font-semibold px-4 py-3 rounded-full shadow-2xl max-w-[92vw] text-center flex items-center gap-2"><CircleCheck size={16} className="text-emerald-400 shrink-0" /><span className="truncate">{toast}</span></div>}
    </div>
  );
}
