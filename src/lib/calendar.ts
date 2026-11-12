// .ics export: calendar events with alarms, so reminders notify on the phone even when SaveBrain is closed.
import type { Reminder } from "./types";

const esc = (s: string) => s.replace(/[\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
const compact = (day: string) => day.replace(/-/g, "");
function nextDay(day: string) {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function alarm(trigger: string, text: string) {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:${trigger}`, `DESCRIPTION:${esc(text)}`, "END:VALARM"];
}

function event(r: Reminder) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const head = ["BEGIN:VEVENT", `UID:${r.id}@savebrain`, `DTSTAMP:${stamp}`];
  if (r.kind === "auto" && r.deadline) {
    // Event on the deadline itself; alert the day before and on the day.
    const title = `⏰ Deadline: ${r.itemTitle}`;
    const when = r.deadlineTime
      ? [`DTSTART:${compact(r.deadline)}T${r.deadlineTime.replace(":", "")}00`, `DURATION:PT30M`, ...alarm("-P1D", title), ...alarm("-PT2H", title)]
      : [`DTSTART;VALUE=DATE:${compact(r.deadline)}`, `DTEND;VALUE=DATE:${compact(nextDay(r.deadline))}`, ...alarm("-PT15H", title), ...alarm("PT9H", title)];
    return [...head, ...when, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc("Saved with SaveBrain — act before it ends.\n" + r.itemLink)}`, "END:VEVENT"];
  }
  const title = `SaveBrain: ${r.itemTitle}`;
  return [...head, `DTSTART;VALUE=DATE:${compact(r.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(r.date))}`, `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(r.itemLink)}`, ...alarm("PT9H", title), "END:VEVENT"];
}

export function buildIcs(reminders: Reminder[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SaveBrain//EN", "CALSCALE:GREGORIAN", ...reminders.flatMap(event), "END:VCALENDAR"].join("\r\n");
}
export function downloadIcs(reminders: Reminder[], filename = "savebrain-reminders.ics") {
  const ics = buildIcs(reminders);
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
