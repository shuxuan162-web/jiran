import { describe, expect, it } from "vitest";
import { needsHandler, nextStatuses, residentCanCancel, residentCanRate, stepIndex } from "./serviceFlow";

describe("service request flow", () => {
  it("only moves forward, and can be cancelled until completed", () => {
    expect(nextStatuses("submitted")).toEqual(["acknowledged", "assigned", "in_progress", "completed", "cancelled"]);
    expect(nextStatuses("in_progress")).toEqual(["completed", "cancelled"]);
    expect(nextStatuses("completed")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });
  it("needs a handler from assigned onwards", () => {
    expect(needsHandler("acknowledged")).toBe(false);
    expect(needsHandler("assigned")).toBe(true);
    expect(needsHandler("completed")).toBe(true);
  });
  it("lets the requester cancel only before assignment", () => {
    expect(residentCanCancel("submitted", true)).toBe(true);
    expect(residentCanCancel("acknowledged", true)).toBe(true);
    expect(residentCanCancel("assigned", true)).toBe(false);
    expect(residentCanCancel("submitted", false)).toBe(false);
  });
  it("lets the requester rate once after completion", () => {
    expect(residentCanRate("completed", true, null)).toBe(true);
    expect(residentCanRate("completed", true, 4)).toBe(false);
    expect(residentCanRate("in_progress", true, null)).toBe(false);
    expect(residentCanRate("completed", false, null)).toBe(false);
  });
  it("finds the furthest step reached", () => {
    expect(stepIndex([{ status: "submitted" }, { status: "acknowledged" }, { status: "cancelled" }])).toBe(1);
  });
});
