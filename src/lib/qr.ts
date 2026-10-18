// What a Jiran QR code can hold. Codes carry no personal details: a pass holds a random token,
// an event holds its id and the 6-digit check-in code the host already shows on screen.

export type QrPayload =
  | { kind: "pass"; token: string }
  | { kind: "event"; eventId: string; code: string }
  | { kind: "url"; url: string }
  | { kind: "unknown"; text: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const passQr = (token: string) => `JIRAN:PASS:${token}`;
export const eventQr = (eventId: string, code: string) => `JIRAN:EVENT:${eventId}:${code}`;

export function parseQr(raw: string): QrPayload {
  const text = raw.trim();
  const parts = text.split(":");
  if (parts[0]?.toUpperCase() === "JIRAN") {
    const kind = parts[1]?.toUpperCase();
    if (kind === "PASS" && /^[0-9a-f]{24}$/i.test(parts[2] ?? "")) return { kind: "pass", token: parts[2].toLowerCase() };
    if (kind === "EVENT" && UUID.test(parts[2] ?? "") && /^\d{6}$/.test(parts[3] ?? "")) return { kind: "event", eventId: parts[2].toLowerCase(), code: parts[3] };
  }
  // A bare 24-hex token typed by a guard
  if (/^[0-9a-f]{24}$/i.test(text)) return { kind: "pass", token: text.toLowerCase() };
  if (/^https?:\/\//i.test(text)) return { kind: "url", url: text };
  return { kind: "unknown", text };
}

/** Only links to our own app or the official Sime Darby Property site are opened from a scan. */
export function isTrustedUrl(url: string, origin: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === origin || (u.protocol === "https:" && (u.hostname === "www.simedarbyproperty.com" || u.hostname === "simedarbyproperty.com"));
  } catch { return false; }
}
