import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, LEVEL_THRESHOLDS, avatarSvg, isLocked, levelFor, levelProgress, normalizeAvatar, randomAvatar } from "./avatar";

describe("levels (same thresholds as public.level_for)", () => {
  it("starts at level 1 and steps up at each threshold", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(39)).toBe(1);
    expect(levelFor(40)).toBe(2);
    expect(levelFor(199)).toBe(3);
    expect(levelFor(200)).toBe(4);
    expect(levelFor(5000)).toBe(LEVEL_THRESHOLDS.length);
  });
  it("never goes below level 1 for negative XP (after a revoke)", () => {
    expect(levelFor(-30)).toBe(1);
  });
  it("reports progress to the next level", () => {
    expect(levelProgress(70)).toEqual({ level: 2, floor: 40, next: 100, pct: 50, toNext: 30 });
    expect(levelProgress(2500).next).toBeNull();
  });
});

describe("cosmetic locks", () => {
  it("locks the crown until level 6 and the gold ring until level 5", () => {
    expect(isLocked("acc", "crown", 5)).toBe(true);
    expect(isLocked("acc", "crown", 6)).toBe(false);
    expect(isLocked("ring", "gold", 4)).toBe(true);
  });
  it("never locks head coverings", () => {
    expect(isLocked("acc", "songkok", 1)).toBe(false);
  });
  it("only hands out unlocked items when randomising", () => {
    for (let i = 0; i < 50; i++) {
      const a = randomAvatar(1);
      expect(isLocked("acc", a.acc, 1)).toBe(false);
      expect(isLocked("ring", a.ring, 1)).toBe(false);
    }
  });
});

describe("normalizeAvatar", () => {
  it("accepts a valid config", () => {
    expect(normalizeAvatar(DEFAULT_AVATAR)).toEqual(DEFAULT_AVATAR);
  });
  it("rejects old or tampered shapes", () => {
    expect(normalizeAvatar({ ring: "orange" })).toBeNull();
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, skin: 9 })).toBeNull();
    expect(normalizeAvatar({ ...DEFAULT_AVATAR, acc: "<script>" })).toBeNull();
    expect(normalizeAvatar(null)).toBeNull();
  });
});

describe("avatarSvg", () => {
  it("draws the ring colour and a face", () => {
    const s = avatarSvg(DEFAULT_AVATAR, 40);
    expect(s.startsWith("<svg")).toBe(true);
    expect(s).toContain('fill="#F26522"');
    expect(s).toContain('width="40"');
  });
  it("draws a tudung with the face on top", () => {
    const s = avatarSvg({ ...DEFAULT_AVATAR, hair: "tudung" });
    expect(s.indexOf("<ellipse")).toBeGreaterThan(s.indexOf("M32 10C20 10"));
  });
});
