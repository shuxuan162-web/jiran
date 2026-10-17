// Turning scores and statuses into plain words residents understand.
import type { StringKey } from "../../i18n/en";

export type IssueStatus = "submitted" | "acknowledged" | "assigned" | "in_progress" | "resolved" | "rejected" | "duplicate";
export type Level = "low" | "medium" | "high" | "urgent";

export const OPEN_STATUSES: IssueStatus[] = ["submitted", "acknowledged", "assigned", "in_progress"];
export const STEPS: IssueStatus[] = ["submitted", "acknowledged", "assigned", "in_progress", "resolved"];

export function priorityLevel(p: number | null | undefined): Level {
  const x = p ?? 0;
  return x >= 75 ? "urgent" : x >= 55 ? "high" : x >= 40 ? "medium" : "low";
}

export const LEVEL_ICON: Record<Level, string> = { low: "↓", medium: "−", high: "↑", urgent: "⚠" };

export const statusKey = (s: IssueStatus) => `status.${s}` as StringKey;

export interface WhyInput { affected: number; votes: number; ageHours: number; severity: number }

/** One-line, plain-language reason, e.g. "14 homes nearby · 9 upvotes · open 6 days". */
export function whyParts(i: WhyInput): { key: StringKey; n: number }[] {
  const parts: { key: StringKey; n: number }[] = [];
  if (i.severity >= 80) parts.push({ key: "why.safety", n: 0 });
  if (i.affected > 0) parts.push({ key: i.affected === 1 ? "why.home" : "why.homes", n: i.affected });
  if (i.votes > 0) parts.push({ key: i.votes === 1 ? "why.vote" : "why.votes", n: i.votes });
  const days = Math.floor(i.ageHours / 24);
  parts.push(days >= 1 ? { key: days === 1 ? "why.day" : "why.days", n: days } : { key: "why.today", n: 0 });
  return parts;
}

export function ageHours(iso: string, now = Date.now()) {
  return Math.max(0, (now - new Date(iso).getTime()) / 3_600_000);
}
