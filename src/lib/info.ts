// Small pure helpers for phase 4 screens. Kept here so they can be unit-tested.

/** Same patterns the database uses to hold posts: MyKad numbers and Malaysian mobile numbers. */
export function looksPrivate(text: string): boolean {
  return /\d{6}\s?-?\s?\d{2}\s?-?\s?\d{4}/.test(text) || /(\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}/.test(text);
}

export type EventPhase = "upcoming" | "checkin_open" | "over";
/** Check-in opens 30 minutes before the start and closes at the end (matches check_in_event()). */
export function eventPhase(startsAt: string, endsAt: string, now = Date.now()): EventPhase {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (now > e) return "over";
  if (now >= s - 30 * 60 * 1000) return "checkin_open";
  return "upcoming";
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A one-event calendar file (RFC 5545) so residents can add an event to any calendar app. */
export function buildIcs(e: { id: string; title: string; description: string; starts_at: string; ends_at: string; location_name: string; lat: number; lng: number }, now = new Date()): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jiran//City of Elmina//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@jiran-elmina`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.starts_at)}`,
    `DTEND:${icsDate(e.ends_at)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    `LOCATION:${icsText(e.location_name)}`,
    `GEO:${e.lat.toFixed(5)};${e.lng.toFixed(5)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

/** "2026-10-25T08:00" for <input type="datetime-local"> in the phone's own time zone. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Back from a datetime-local value to an ISO timestamp (null when empty or invalid). */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
