// Billing rules shared by the screens. The database applies the same rules (private.bill_state, flush_bill_reminders).

export type BillKind = "maintenance_fee" | "sinking_fund" | "quit_rent" | "assessment" | "water" | "other";
export const BILL_KINDS: BillKind[] = ["maintenance_fee", "sinking_fund", "quit_rent", "assessment", "water", "other"];
export type BillState = "paid" | "void" | "overdue" | "due_soon" | "upcoming";

/** Today's date in Malaysia (YYYY-MM-DD), whatever the device's time zone. */
export function mytToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/** Overdue = past the due date. Due soon = due today or within `soonDays` days. Paid and void win over dates. */
export function billState(b: { due_date: string; paid_at: string | null; status?: "open" | "void" }, today: string, soonDays: number): BillState {
  if (b.status === "void") return "void";
  if (b.paid_at) return "paid";
  const d = dayNo(b.due_date) - dayNo(today);
  if (d < 0) return "overdue";
  return d <= soonDays ? "due_soon" : "upcoming";
}

/** Which reminder (if any) is owed now: one "due soon" and one "overdue" per bill, only while reminders are on. */
export function reminderDue(
  b: { due_date: string; paid_at: string | null; status?: "open" | "void"; reminders_on: boolean; reminded_soon_at: string | null; reminded_overdue_at: string | null },
  today: string, soonDays: number,
): "soon" | "overdue" | null {
  if (!b.reminders_on || b.paid_at || b.status === "void") return null;
  const s = billState(b, today, soonDays);
  if (s === "overdue") return b.reminded_overdue_at ? null : "overdue";
  if (s === "due_soon") return b.reminded_soon_at ? null : "soon";
  return null;
}

export const money = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Minimal CSV parser: commas, quoted fields with "" escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export const CSV_COLUMNS = ["unit", "type", "period", "amount", "due_date", "reference"] as const;
export type CsvBill = Record<(typeof CSV_COLUMNS)[number], string>;

/** First row must be the header (any order, case-insensitive). Returns rows or the missing column names. */
export function csvToBills(text: string): { rows: CsvBill[]; missing: string[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { rows: [], missing: [...CSV_COLUMNS.slice(0, 5)] };
  const head = all[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = CSV_COLUMNS.filter((c) => c !== "reference" && !head.includes(c));
  if (missing.length) return { rows: [], missing };
  const rows = all.slice(1).map((r) => {
    const o = {} as CsvBill;
    for (const c of CSV_COLUMNS) { const i = head.indexOf(c); o[c] = i >= 0 ? (r[i] ?? "").trim() : ""; }
    return o;
  });
  return { rows, missing: [] };
}
