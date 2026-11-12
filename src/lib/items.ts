// Mapping between database rows, Meta AI replies and the Item shape the UI renders.
import type { Item, Platform, Reminder, Status, Trust, Urgency } from "./types";

const FIELDS = `Reply with ONLY a JSON array: no intro, no explanation, no markdown. One object per saved post, with exactly these fields:

{
  "link": "full direct URL of the post, e.g. https://www.instagram.com/reel/ABC123/",
  "platform": "Instagram" or "Facebook",
  "type": "Reel", "Post", "Carousel", "Video" or "Story",
  "date": "date the post was published, YYYY-MM-DD",
  "author": "@handle of the account, or the page/person name on Facebook",
  "title": "short headline for what the post offers, max 8 words",
  "summary": "2-3 sentences with the concrete specifics: names of tools, sites, programs, amounts, numbers, requirements",
  "category": "Area / Subarea, e.g. Jobs / Immigration, Learning / AI, Startup / Funding, AI Tools / Video",
  "urgency": "HIGH", "MEDIUM" or "LOW",
  "trust": "Verified", "Likely Legit", "Check Claims" or "High Fake Risk",
  "deadline": "short text if there is a deadline, expiry or limited budget/spots (e.g. \\"Apply before credits end\\" or \\"2026-12-01\\"), otherwise \\"\\"",
  "action": "the single next thing I should do, including the post's call to action (e.g. Comment \\"Guide\\" for the link)",
  "likes": "number of likes as text, or \\"—\\" if unknown",
  "comments": "number of comments as text, or \\"—\\" if unknown",
  "steps": ["3-6 concrete steps the post teaches or requires, in order"],
  "why": "1-2 sentences explaining the urgency you chose",
  "signals": ["1-5 short trust signals you noticed: red flags or proof"],
  "links": ["every website, tool, account, repo or group mentioned in the post"],
  "checklist": ["3-5 short action items for me, including how to verify the claims"]
}

How to choose urgency:
- HIGH: has a deadline, expiry, limited spots or budget, or is worth doing this week
- MEDIUM: useful and actionable, but no time pressure
- LOW: learning for later, inspiration, news or entertainment

How to choose trust:
- Verified: public, checkable source (official site, open-source repo, known organisation)
- Likely Legit: plausible and based on a real source, but not fully checked
- Check Claims: verify before acting (unproven numbers, comment-gated offers, unknown site)
- High Fake Risk: income screenshots, guaranteed results, paid "system" pitches, big claims from small accounts, no proof

Rules:
- Only include posts that are really in my saved items, with their real links. Never invent posts, links or numbers.
- If you can't see a detail, use "" (or "—" for likes/comments, [] for lists) instead of guessing.
- If you can't access my saved posts at all, reply exactly: NO ACCESS`;

export const PROMPTS = {
  all: `Go through all my saved posts on Instagram and Facebook and analyze each one.\n\n${FIELDS}`,
  daily: `Go through the posts I saved on Instagram and Facebook in the last 24 hours and analyze each one.\n\n${FIELDS}`,
  single: (link: string) => `Analyze this saved post: ${link}\n\n${FIELDS.replace("One object per saved post", "One object for this post")}`,
};

export function normalizeUrl(u: unknown): string | null {
  try {
    const x = new URL(String(u).trim());
    if (!/^https?:$/.test(x.protocol)) return null;
    if (/(^|\.)instagram\.com$/.test(x.hostname)) { x.hostname = "www.instagram.com"; x.search = ""; } // drop ?igsh= share tracking
    x.hash = "";
    return x.origin + (x.pathname.replace(/\/+$/, "") || "/") + x.search;
  } catch { return null; }
}
export function safeLink(u: string) { return /^https?:\/\//i.test(u) ? u : undefined; }

const str = (v: unknown, n: number, fallback = "") => (v == null || v === "" ? fallback : String(v).slice(0, n));
const list = (v: unknown, n = 12): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, n);
function platformOf(v: unknown, url: string): Platform {
  const p = String(v || "").toLowerCase();
  if (p.startsWith("insta") || /instagram\.com/.test(url)) return "Instagram";
  if (p.startsWith("face") || /facebook\.com|fb\.watch|fb\.com/.test(url)) return "Facebook";
  return "Other";
}
function urgencyOf(v: unknown): Urgency {
  const u = String(v || "").toUpperCase();
  return u === "HIGH" || u === "LOW" ? u : "MEDIUM";
}
function trustOf(v: unknown): Trust {
  const t = String(v || "").toLowerCase();
  if (t.startsWith("verif")) return "Verified";
  if (t.startsWith("likely")) return "Likely Legit";
  if (t.includes("fake")) return "High Fake Risk";
  return "Check Claims";
}
function statusOf(v: unknown): Status {
  const s = String(v || "").toLowerCase();
  return s === "done" ? "Done" : s === "snoozed" ? "Snoozed" : "To Do";
}

type Row = Record<string, unknown>;
export function fromRow(r: Row): Item {
  const link = String(r.url || "");
  return {
    id: String(r.id), link, platform: platformOf(r.platform, link),
    title: str(r.title, 200, "Saved post — needs review"), author: str(r.author, 100, "Unknown"),
    date: str(r.post_date, 40) || String(r.created_at || "").slice(0, 10), type: str(r.post_type, 30, "Post"),
    summary: str(r.summary, 2000), category: str(r.category, 80, "Needs Review"), urgency: urgencyOf(r.urgency),
    trust: trustOf(r.trust), deadline: str(r.deadline, 80), action: str(r.action, 300, "Open original + review"),
    likes: str(r.likes, 20, "—"), comments: str(r.comments, 20, "—"), status: statusOf(r.status),
    steps: list(r.steps), why: str(r.why, 600), signals: list(r.signals), links: list(r.links), checklist: list(r.checklist),
  };
}
// A row ready to insert. The id is generated here so inserts also work on older tables without an id default.
export function toRow(r: Row, url: string, userId: string) {
  return {
    id: crypto.randomUUID(), user_id: userId, url, platform: platformOf(r.platform, url),
    title: str(r.title, 200, "Saved post — needs review"), author: str(r.author, 100, "Unknown"),
    post_date: str(r.date, 40) || new Date().toISOString().slice(0, 10), post_type: str(r.type, 30, "Post"),
    summary: str(r.summary, 2000), category: str(r.category, 80, "Needs Review"), urgency: urgencyOf(r.urgency),
    trust: trustOf(r.trust), deadline: str(r.deadline, 80), action: str(r.action, 300, "Open original + review"),
    likes: str(r.likes, 20, "—"), comments: str(r.comments, 20, "—"), status: "To Do",
    steps: list(r.steps), why: str(r.why, 600), signals: list(r.signals), links: list(r.links), checklist: list(r.checklist),
  };
}
export function reminderFromRow(r: Row): Reminder {
  return { id: String(r.id), itemTitle: String(r.item_title || ""), itemLink: String(r.item_link || ""), date: String(r.date || ""), createdAt: String(r.created_at || "") };
}

// Accepts Meta AI's reply: a JSON array (even wrapped in text or ``` fences), or failing that, any links in the text.
export function parseMetaReply(text: string): { noAccess?: boolean; rows: { row: Row; url: string }[] } {
  const t = text.trim();
  if (/^NO ACCESS/i.test(t)) return { noAccess: true, rows: [] };
  let data: unknown = null;
  const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a >= 0 && b > a) { try { data = JSON.parse(t.slice(a, b + 1)); } catch { /* fall back to links */ } }
  if (!Array.isArray(data)) {
    const o = t.indexOf("{"), c = t.lastIndexOf("}");
    if (o >= 0 && c > o) { try { data = [JSON.parse(t.slice(o, c + 1))]; } catch { /* fall back to links */ } }
  }
  if (!Array.isArray(data)) data = t.match(/https?:\/\/[^\s"'<>)\]]+/g) || [];
  const seen = new Set<string>(), rows: { row: Row; url: string }[] = [];
  for (const r of data as unknown[]) {
    const row: Row = r && typeof r === "object" ? (r as Row) : {};
    const url = normalizeUrl(typeof r === "string" ? r : row.link ?? row.url);
    if (!url || seen.has(url)) continue;
    seen.add(url); rows.push({ row, url });
  }
  return { rows };
}
