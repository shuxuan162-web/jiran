import { describe, expect, it } from "vitest";
import { eventQr, isTrustedUrl, parseQr, passQr } from "./qr";

describe("Jiran QR codes", () => {
  const token = "0123456789abcdef01234567";
  const id = "6f1c2a7e-1b2c-4d5e-8f90-123456789abc";
  it("round-trips a visitor pass", () => {
    expect(parseQr(passQr(token))).toEqual({ kind: "pass", token });
  });
  it("round-trips an event check-in", () => {
    expect(parseQr(eventQr(id, "135790"))).toEqual({ kind: "event", eventId: id, code: "135790" });
  });
  it("accepts a pass token typed by hand", () => {
    expect(parseQr(` ${token.toUpperCase()} `)).toEqual({ kind: "pass", token });
  });
  it("rejects malformed Jiran codes", () => {
    expect(parseQr("JIRAN:EVENT:not-a-uuid:135790").kind).toBe("unknown");
    expect(parseQr(`JIRAN:EVENT:${id}:12345`).kind).toBe("unknown");
    expect(parseQr("JIRAN:PASS:short").kind).toBe("unknown");
  });
  it("treats links separately and only trusts our own or the official site", () => {
    expect(parseQr("https://example.com/x")).toEqual({ kind: "url", url: "https://example.com/x" });
    expect(isTrustedUrl("https://jiran-elmina.vercel.app/app/events", "https://jiran-elmina.vercel.app")).toBe(true);
    expect(isTrustedUrl("https://www.simedarbyproperty.com/city-of-elmina/", "https://jiran-elmina.vercel.app")).toBe(true);
    expect(isTrustedUrl("https://evil.example/simedarbyproperty.com", "https://jiran-elmina.vercel.app")).toBe(false);
    expect(isTrustedUrl("javascript:alert(1)", "https://jiran-elmina.vercel.app")).toBe(false);
  });
});
