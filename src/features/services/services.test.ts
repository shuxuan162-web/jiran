import { describe, expect, it } from "vitest";
import { billState, normalizePlate, plateOk } from "./api";
import { FAQS, searchFaq } from "../../data/faq";

describe("car plates", () => {
  it("normalises spacing and case", () => {
    expect(normalizePlate(" wxy  1234 ")).toBe("WXY 1234");
    expect(normalizePlate("b-1 2.3")).toBe("B1 23");
  });
  it("needs at least one digit and 2-12 characters", () => {
    expect(plateOk("WXY 1234")).toBe(true);
    expect(plateOk("ABC")).toBe(false);
    expect(plateOk("A")).toBe(false);
  });
});

describe("billing reminders", () => {
  const today = new Date("2026-10-18T10:00:00+08:00");
  it("labels each bill by its due date", () => {
    expect(billState({ due_date: "2026-10-10", paid_at: null }, today)).toBe("overdue");
    expect(billState({ due_date: "2026-10-25", paid_at: null }, today)).toBe("due_soon");
    expect(billState({ due_date: "2026-12-30", paid_at: null }, today)).toBe("upcoming");
    expect(billState({ due_date: "2026-10-10", paid_at: "2026-10-01" }, today)).toBe("paid");
  });
});

describe("FAQ helper", () => {
  it("finds the visitor answer from a casual question", () => {
    expect(searchFaq("how to register my guest?")[0].id).toBe("visitor");
  });
  it("finds contact numbers", () => {
    expect(searchFaq("what is the hotline number")[0].id).toBe("contact");
  });
  it("returns everything for an empty search and nothing for nonsense", () => {
    expect(searchFaq("")).toHaveLength(FAQS.length);
    expect(searchFaq("zzqx")).toHaveLength(0);
  });
});
