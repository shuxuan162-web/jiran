import { describe, expect, it } from "vitest";
import { billState, csvToBills, mytToday, parseCsv, reminderDue } from "./billing";

const bill = (due: string, extra: Partial<{ paid_at: string | null; status: "open" | "void"; reminders_on: boolean; reminded_soon_at: string | null; reminded_overdue_at: string | null }> = {}) =>
  ({ due_date: due, paid_at: null, status: "open" as const, reminders_on: true, reminded_soon_at: null, reminded_overdue_at: null, ...extra });

describe("bill status", () => {
  const today = "2026-10-18";
  it("is overdue the day after the due date, not on it", () => {
    expect(billState(bill("2026-10-17"), today, 3)).toBe("overdue");
    expect(billState(bill("2026-10-18"), today, 3)).toBe("due_soon");
  });
  it("is due soon inside the reminder window and upcoming after it", () => {
    expect(billState(bill("2026-10-21"), today, 3)).toBe("due_soon");
    expect(billState(bill("2026-10-22"), today, 3)).toBe("upcoming");
    expect(billState(bill("2026-10-22"), today, 7)).toBe("due_soon");
  });
  it("paid and void win over dates", () => {
    expect(billState(bill("2026-01-01", { paid_at: "2026-01-02" }), today, 3)).toBe("paid");
    expect(billState(bill("2026-01-01", { status: "void" }), today, 3)).toBe("void");
  });
  it("uses Malaysia's date, not the device's", () => {
    expect(mytToday(new Date("2026-10-18T17:30:00Z"))).toBe("2026-10-19"); // 1.30am in Kuala Lumpur
    expect(mytToday(new Date("2026-10-18T15:59:00Z"))).toBe("2026-10-18");
  });
});

describe("reminder timing", () => {
  const today = "2026-10-18";
  it("sends one due-soon reminder inside the window, then nothing", () => {
    expect(reminderDue(bill("2026-10-25"), today, 3)).toBeNull();
    expect(reminderDue(bill("2026-10-21"), today, 3)).toBe("soon");
    expect(reminderDue(bill("2026-10-21", { reminded_soon_at: "x" }), today, 3)).toBeNull();
  });
  it("sends one overdue reminder even if the due-soon one was sent", () => {
    expect(reminderDue(bill("2026-10-10", { reminded_soon_at: "x" }), today, 3)).toBe("overdue");
    expect(reminderDue(bill("2026-10-10", { reminded_overdue_at: "x" }), today, 3)).toBeNull();
  });
  it("sends nothing when turned off, paid or void", () => {
    expect(reminderDue(bill("2026-10-10", { reminders_on: false }), today, 3)).toBeNull();
    expect(reminderDue(bill("2026-10-10", { paid_at: "2026-10-09" }), today, 3)).toBeNull();
    expect(reminderDue(bill("2026-10-10", { status: "void" }), today, 3)).toBeNull();
  });
});

describe("CSV import", () => {
  it("parses quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n\r\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("maps columns by header and reports missing ones", () => {
    const ok = csvToBills("Unit,Type,Period,Amount,Due date,Reference\nElmina Green · No. 4,Maintenance fee,Q4 2026,450.00,2026-12-31,INV-1\n");
    expect(ok.missing).toEqual([]);
    expect(ok.rows[0]).toEqual({ unit: "Elmina Green · No. 4", type: "Maintenance fee", period: "Q4 2026", amount: "450.00", due_date: "2026-12-31", reference: "INV-1" });
    expect(csvToBills("unit,amount\nx,1").missing).toEqual(["type", "period", "due_date"]);
  });
});
