// Per-device conveniences only (text size, motion; "lang" is kept only to clear an old choice). Storage may be
// unavailable (private mode, blocked site data), so every access is guarded.
const PREFIX = "jiran.";

export function readPref(key: string): string | null {
  try { return window.localStorage.getItem(PREFIX + key); } catch { return null; }
}
export function writePref(key: string, value: string) {
  try { window.localStorage.setItem(PREFIX + key, value); } catch { /* ignore */ }
}

export const TEXT_SCALES = { normal: 1, large: 1.15, larger: 1.3 } as const;
export type TextScale = keyof typeof TEXT_SCALES;

export function applyDisplayPrefs() {
  const scale = (readPref("textScale") as TextScale) || "normal";
  document.documentElement.style.setProperty("--text-scale", String(TEXT_SCALES[scale] ?? 1));
  document.documentElement.classList.toggle("reduce-motion", readPref("reduceMotion") === "1");
}
