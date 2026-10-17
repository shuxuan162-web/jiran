// Pure validation helpers shared by forms. Unit-tested in validation.test.ts.

export const digitsOnly = (s: string) => s.replace(/\D/g, "");
export const alnumUpper = (s: string) => s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

/** Malaysian NRIC: 12 digits, YYMMDD-PB-###G, with a plausible month and day. */
export function isValidNric(input: string): boolean {
  const d = digitsOnly(input);
  if (!/^\d{12}$/.test(d)) return false;
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** Formats as 900101-14-1234 while typing (max 12 digits). */
export function formatNric(input: string): string {
  const d = digitsOnly(input).slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

export const isValidPassport = (input: string) => /^[A-Z0-9]{6,12}$/.test(alnumUpper(input));

export function isValidId(type: "nric" | "passport", input: string) {
  return type === "nric" ? isValidNric(input) : isValidPassport(input);
}

/** Shows only the last 4 characters, e.g. "•••• 1234". */
export function maskId(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "••••";
}

export const isValidEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export const isValidNickname = (s: string) => /^[A-Za-z0-9_]{3,24}$/.test(s.trim());

/** Returns null when OK, else an error code understood by errors.ts. */
export function passwordProblem(pw: string): "weak_password" | null {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw) ? null : "weak_password";
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function fileProblem(file: { size: number; type: string }): "file_too_big" | "file_type" | null {
  if (!DOC_TYPES.includes(file.type)) return "file_type";
  if (file.size > MAX_UPLOAD_BYTES) return "file_too_big";
  return null;
}

export const isInviteToken = (s: string) => /^[0-9a-f]{48}$/.test(s);

/** Storage-safe file name: keeps the extension, drops anything odd. */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "bin";
  const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "file";
  return `${base}.${ext}`;
}
