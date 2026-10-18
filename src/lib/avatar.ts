// Character avatars: a small layered SVG built from a config, plus levels and cosmetic unlocks.
// The database checks the same locks on save (trg_profile_avatar in 0006_rewards.sql).

export const SKINS = ["#F9DDC4", "#F1C6A3", "#E0A97E", "#C68863", "#9B6444", "#6E4530"];
export const HAIR_COLORS = ["#1E1B1A", "#4A2F22", "#7A4E2D", "#B07A43", "#D9B26B", "#8C8C8C"];
export const SCARF_COLORS = ["#7FA7C9", "#E7A1B0", "#9CC59A", "#E9C46A", "#B39DDB", "#EDE7DC"];
export const TOPS = ["#D71920", "#F26522", "#FDB515", "#1F7A5C", "#2F6FB3", "#5B3B8C", "#2B2523", "#EDE7DC"];
export const RINGS = {
  red: "#D71920", orange: "#F26522", amber: "#FDB515", green: "#1F7A5C", blue: "#2F6FB3", purple: "#7B4FC9", teal: "#138A8A", gold: "#C9A227",
} as const;
export const HAIRS = ["short", "long", "bun", "curly", "buzz", "tudung", "none"] as const;
export const ACCS = ["none", "glasses", "songkok", "cap", "flower", "headphones", "shades", "crown"] as const;

export type Hair = (typeof HAIRS)[number];
export type Acc = (typeof ACCS)[number];
export type Ring = keyof typeof RINGS;
export interface AvatarConfig { v: 1; skin: number; hair: Hair; hairColor: number; top: number; acc: Acc; ring: Ring }

/** Level needed for each locked cosmetic. Head coverings are never locked. */
export const LOCKS: { acc: Partial<Record<Acc, number>>; ring: Partial<Record<Ring, number>> } = {
  acc: { cap: 2, flower: 2, headphones: 3, shades: 4, crown: 6 },
  ring: { purple: 3, teal: 4, gold: 5 },
};
export const lockLevel = (kind: "acc" | "ring", value: string): number =>
  ((LOCKS[kind] as Record<string, number | undefined>)[value]) ?? 1;
export const isLocked = (kind: "acc" | "ring", value: string, level: number) => level < lockLevel(kind, value);

// Same thresholds as public.level_for()
export const LEVEL_THRESHOLDS = [0, 40, 100, 200, 350, 550, 800, 1100, 1500, 2000];
export function levelFor(xp: number): number {
  let lvl = 1;
  LEVEL_THRESHOLDS.forEach((t, i) => { if (xp >= t) lvl = i + 1; });
  return lvl;
}
export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const floor = LEVEL_THRESHOLDS[level - 1];
  const next = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : null;
  const pct = next == null ? 100 : Math.round(((xp - floor) / (next - floor)) * 100);
  return { level, floor, next, pct, toNext: next == null ? 0 : next - xp };
}

const inRange = (n: unknown, max: number) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

/** A valid character config, or null for old/unknown shapes (those fall back to the initial-letter avatar). */
export function normalizeAvatar(c: unknown): AvatarConfig | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!inRange(o.skin, SKINS.length - 1) || !inRange(o.hairColor, HAIR_COLORS.length - 1) || !inRange(o.top, TOPS.length - 1)) return null;
  if (!HAIRS.includes(o.hair as Hair) || !ACCS.includes(o.acc as Acc) || !(String(o.ring) in RINGS)) return null;
  return { v: 1, skin: o.skin as number, hair: o.hair as Hair, hairColor: o.hairColor as number, top: o.top as number, acc: o.acc as Acc, ring: o.ring as Ring };
}

export const DEFAULT_AVATAR: AvatarConfig = { v: 1, skin: 2, hair: "short", hairColor: 0, top: 1, acc: "none", ring: "orange" };

export function randomAvatar(level: number, rnd: () => number = Math.random): AvatarConfig {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const accs = ACCS.filter((a) => !isLocked("acc", a, level));
  const rings = (Object.keys(RINGS) as Ring[]).filter((r) => !isLocked("ring", r, level));
  return {
    v: 1, skin: Math.floor(rnd() * SKINS.length), hair: pick(HAIRS), hairColor: Math.floor(rnd() * HAIR_COLORS.length),
    top: Math.floor(rnd() * TOPS.length), acc: pick(accs), ring: pick(rings),
  };
}

/** SVG markup (64×64 viewBox). Every value comes from the fixed palettes above, never from free text. */
export function avatarSvg(c: AvatarConfig, size = 48): string {
  const skin = SKINS[c.skin];
  const hc = c.hair === "tudung" ? SCARF_COLORS[c.hairColor] : HAIR_COLORS[c.hairColor];
  const top = TOPS[c.top];
  const ring = RINGS[c.ring];
  const parts: string[] = [];
  parts.push(`<circle cx="32" cy="32" r="32" fill="${ring}"/>`);
  parts.push(`<path d="M9 64C9 49 19 42 32 42C45 42 55 49 55 64Z" fill="${top}"/>`);
  parts.push(`<rect x="27" y="35" width="10" height="9" rx="3" fill="${skin}"/>`);
  if (c.hair === "long") parts.push(`<path d="M17 29C17 16 24 11 32 11C40 11 47 16 47 29L48 46L41 46L42 27L22 27L23 46L16 46Z" fill="${hc}"/>`);
  if (c.hair === "tudung") {
    parts.push(`<path d="M32 10C20 10 15 19 15 30C15 40 19 46 10 57L54 57C45 46 49 40 49 30C49 19 44 10 32 10Z" fill="${hc}"/>`);
    parts.push(`<ellipse cx="32" cy="29" rx="10.5" ry="12" fill="${skin}"/>`);
  } else {
    parts.push(`<circle cx="32" cy="28" r="13" fill="${skin}"/>`);
  }
  if (c.hair === "short" || c.hair === "long" || c.hair === "bun")
    parts.push(`<path d="M19 27C19 16 25 12 32 12C40 12 45 17 45 26C42 21 37 19 32 19C27 19 22 22 19 27Z" fill="${hc}"/>`);
  if (c.hair === "bun") parts.push(`<circle cx="32" cy="10" r="5.5" fill="${hc}"/>`);
  if (c.hair === "curly")
    for (const [x, y, r] of [[21, 22, 5.5], [25, 16, 6], [32, 13, 6], [39, 16, 6], [43, 22, 5.5]])
      parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`);
  if (c.hair === "buzz") parts.push(`<path d="M20 25C20 17 26 14 32 14C38 14 44 17 44 25C40 21 24 21 20 25Z" fill="${hc}" opacity="0.75"/>`);
  // face
  parts.push(`<circle cx="27.5" cy="29" r="1.7" fill="#2B2523"/><circle cx="36.5" cy="29" r="1.7" fill="#2B2523"/>`);
  parts.push(`<path d="M28 34Q32 37.5 36 34" stroke="#2B2523" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
  switch (c.acc) {
    case "glasses":
      parts.push(`<g fill="none" stroke="#2B2523" stroke-width="1.5"><circle cx="27.5" cy="29" r="3.6"/><circle cx="36.5" cy="29" r="3.6"/><path d="M31.1 29H32.9"/></g>`);
      break;
    case "shades":
      parts.push(`<g fill="#2B2523"><rect x="23" y="26.5" width="8" height="5" rx="2"/><rect x="33" y="26.5" width="8" height="5" rx="2"/><rect x="30.5" y="27.5" width="3" height="1.4"/></g>`);
      break;
    case "songkok":
      parts.push(`<path d="M21 19L43 19L42 10C36 8.5 28 8.5 22 10Z" fill="#1D1A19"/>`);
      break;
    case "cap":
      parts.push(`<path d="M19 22C19 13 25 10 32 10C39 10 45 14 45 22Z" fill="#D71920"/><path d="M32 20L53 21L53 24L32 23Z" fill="#A9141A"/>`);
      break;
    case "flower":
      parts.push(`<g transform="translate(43 16)"><circle r="3" cx="0" cy="-3" fill="#F48FB1"/><circle r="3" cx="3" cy="0" fill="#F48FB1"/><circle r="3" cx="0" cy="3" fill="#F48FB1"/><circle r="3" cx="-3" cy="0" fill="#F48FB1"/><circle r="2" fill="#FDB515"/></g>`);
      break;
    case "headphones":
      parts.push(`<path d="M18 28C18 16 24 11 32 11C40 11 46 16 46 28" stroke="#2B2523" stroke-width="2.5" fill="none"/><rect x="15" y="25" width="6" height="10" rx="2.5" fill="#2F6FB3"/><rect x="43" y="25" width="6" height="10" rx="2.5" fill="#2F6FB3"/>`);
      break;
    case "crown":
      parts.push(`<path d="M22 14L25 6L29 11L32 4L35 11L39 6L42 14Z" fill="#C9A227" stroke="#8C6D12" stroke-width="0.8"/>`);
      break;
    default: break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false">${parts.join("")}</svg>`;
}
