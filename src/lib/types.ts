export type Urgency = "HIGH" | "MEDIUM" | "LOW";
export type Trust = "Verified" | "Likely Legit" | "Check Claims" | "High Fake Risk";
export type Status = "To Do" | "Done" | "Snoozed";
export type Platform = "Instagram" | "Facebook" | "Other";
export type Item = {
  id: string; title: string; author: string; platform: Platform; date: string; type: string;
  summary: string; category: string; urgency: Urgency; trust: Trust; deadline: string;
  action: string; link: string; likes: string; comments: string; status: Status;
  steps: string[]; why: string; signals: string[]; links: string[]; checklist: string[];
  deadlineDate: string; deadlineTime: string; // YYYY-MM-DD / HH:MM, "" when the post has no time limit
};
export type Reminder = {
  id: string; itemId: string; itemTitle: string; itemLink: string; date: string; createdAt: string;
  kind: "auto" | "manual"; deadline: string; deadlineTime: string;
};
export type Tab = "home" | "queue" | "reminders" | "settings";
