import { describe, expect, it } from "vitest";
import { priorityFrom } from "./priority";
import { severityFor } from "./severity";
import { priorityLevel, whyParts } from "./labels";

// Fixtures shared with the SQL function public.priority_from (same inputs, same expected outputs).
// Run in Supabase:  select public.priority_from(85, 9, 12, 2, 4, 144);  -- 69.2
const PRIORITY: [number, number, number, number, number, number, number][] = [
  // severity, votes, maxVotes, affected, maxAffected, ageHours, expected P
  [85, 9, 12, 2, 4, 144, 69.2],
  [30, 0, 0, 0, 0, 0, 12.0],
  [100, 12, 12, 4, 4, 400, 100.0],
  [55, 3, 10, 1, 4, 24, 35.6],
  [65, 5, 5, 0, 4, 336, 66.0],
  [120, 20, 10, 9, 4, -5, 85.0],
  [40, 1, 3, 3, 3, 12.5, 44.9],
];

describe("priority formula (twin of SQL priority_from)", () => {
  it.each(PRIORITY)("S=%d U=%d/%d A=%d/%d T=%dh -> %d", (s, v, mv, a, ma, h, expected) => {
    expect(priorityFrom({ severity: s, votes: v, maxVotes: mv, affected: a, maxAffected: ma, ageHours: h })).toBe(expected);
  });
  it("is never above 100 or below 0", () => {
    expect(priorityFrom({ severity: 999, votes: 99, maxVotes: 1, affected: 99, maxAffected: 1, ageHours: 9999 })).toBe(100);
    expect(priorityFrom({ severity: -5, votes: 0, maxVotes: 0, affected: 0, maxAffected: 0, ageHours: -9 })).toBe(0);
  });
});

// Shared with SQL public.issue_severity(category, text)
const SEVERITY: [string, string, number][] = [
  ["electrical", "Exposed wires near the school, sparks when it rains", 100],
  ["road", "Pothole on the rapid lane", 55],                         // "api" must not match inside "rapid"
  ["pest", "Stagnant water, worried about aedes", 65],
  ["other", "Signboard blocking view", 30],
  ["road", "An elderly neighbour tripped and was hurt", 80],
  ["noise", "Loud music", 25],
  ["drain_flood", "Banjir again, flooding the road, bahaya!", 95],
  ["unknown", "Something odd", 30],
];

describe("severity rules (twin of SQL issue_severity)", () => {
  it.each(SEVERITY)("%s: %s -> %d", (cat, text, expected) => {
    expect(severityFor(cat, text)).toBe(expected);
  });
  it("adds 15 per reopen", () => {
    expect(severityFor("road", "x", 1)).toBe(70);
  });
});

describe("labels", () => {
  it("maps scores to levels", () => {
    expect(priorityLevel(80)).toBe("urgent");
    expect(priorityLevel(60)).toBe("high");
    expect(priorityLevel(45)).toBe("medium");
    expect(priorityLevel(10)).toBe("low");
    expect(priorityLevel(null)).toBe("low");
  });
  it("explains a score in parts", () => {
    const parts = whyParts({ affected: 14, votes: 9, ageHours: 6 * 24 + 3, severity: 85 });
    expect(parts.map((p) => p.key)).toEqual(["why.safety", "why.homes", "why.votes", "why.days"]);
    expect(parts[3].n).toBe(6);
  });
});
