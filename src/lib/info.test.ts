import { describe, expect, it } from "vitest";
import { buildIcs, eventPhase, fromLocalInput, looksPrivate, timeAgo, toLocalInput } from "./info";

describe("looksPrivate", () => {
  it("catches MyKad numbers with or without dashes", () => {
    expect(looksPrivate("my IC is 900101-14-1234 please call")).toBe(true);
    expect(looksPrivate("900101141234")).toBe(true);
  });
  it("catches Malaysian mobile numbers", () => {
    expect(looksPrivate("WhatsApp me 012-345 6789")).toBe(true);
    expect(looksPrivate("+6012 3456789")).toBe(true);
  });
  it("leaves ordinary posts alone", () => {
    expect(looksPrivate("Lost a grey cat near Elmina Green 4, answers to Milo")).toBe(false);
    expect(looksPrivate("Pasar malam on Saturday from 5 to 10 pm, stall 12")).toBe(false);
  });
});

describe("eventPhase", () => {
  const start = "2026-10-25T08:00:00Z";
  const end = "2026-10-25T10:00:00Z";
  it("is upcoming until 30 minutes before the start", () => {
    expect(eventPhase(start, end, Date.parse("2026-10-25T07:29:00Z"))).toBe("upcoming");
  });
  it("opens check-in 30 minutes early and keeps it open until the end", () => {
    expect(eventPhase(start, end, Date.parse("2026-10-25T07:30:00Z"))).toBe("checkin_open");
    expect(eventPhase(start, end, Date.parse("2026-10-25T09:59:00Z"))).toBe("checkin_open");
  });
  it("is over after the end", () => {
    expect(eventPhase(start, end, Date.parse("2026-10-25T10:01:00Z"))).toBe("over");
  });
});

describe("buildIcs", () => {
  const ics = buildIcs({
    id: "abc", title: "Gotong-royong, drain clean-up", description: "Bring gloves;\nwater provided",
    starts_at: "2026-10-25T00:30:00Z", ends_at: "2026-10-25T03:00:00Z", location_name: "Elmina Valley 3 court", lat: 3.1705, lng: 101.4985,
  }, new Date("2026-10-18T00:00:00Z"));
  it("has one event with UTC times", () => {
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261025T003000Z");
    expect(ics).toContain("DTEND:20261025T030000Z");
  });
  it("escapes commas, semicolons and new lines", () => {
    expect(ics).toContain("SUMMARY:Gotong-royong\\, drain clean-up");
    expect(ics).toContain("DESCRIPTION:Bring gloves\\;\\nwater provided");
  });
  it("uses CRLF line endings", () => {
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });
});

describe("datetime-local helpers", () => {
  it("round-trip a local time", () => {
    const d = new Date(2026, 9, 25, 8, 5);
    expect(toLocalInput(d)).toBe("2026-10-25T08:05");
    expect(fromLocalInput("2026-10-25T08:05")).toBe(d.toISOString());
  });
  it("returns null for empty input", () => {
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  it("reads naturally", () => {
    expect(timeAgo("2026-10-18T11:59:40Z", now)).toBe("now");
    expect(timeAgo("2026-10-18T11:15:00Z", now)).toBe("45 min");
    expect(timeAgo("2026-10-18T07:00:00Z", now)).toBe("5 h");
    expect(timeAgo("2026-10-15T12:00:00Z", now)).toBe("3 d");
  });
});
