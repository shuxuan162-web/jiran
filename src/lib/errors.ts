import type { StringKey } from "../i18n/en";
import { en } from "../i18n/en";

/** Turns any error (code string, Supabase error, exception) into a translation key. */
export function errorKey(err: unknown): StringKey {
  let code = "";
  if (typeof err === "string") code = err;
  else if (err && typeof err === "object" && "message" in err) code = String((err as { message: unknown }).message);
  const c = code.toLowerCase();
  if (c.includes("invalid login credentials")) return "err.invalid_credentials";
  if (c.includes("failed to fetch") || c.includes("networkerror") || c.includes("load failed")) return "err.network";
  const match = Object.keys(en).find((k) => k.startsWith("err.") && c.includes(k.slice(4)));
  return (match as StringKey) ?? "err.generic";
}
