// Loads the Google Maps JavaScript API once. Rejects if the key is missing, refused (gm_authFailure),
// blocked, or slow, so callers can fall back to the Leaflet/OpenStreetMap map.
import { env } from "../../config/env";

let promise: Promise<typeof google.maps> | null = null;
let failed = false;

export const googleMapsFailed = () => failed;

export function loadGoogleMaps(timeoutMs = 10000): Promise<typeof google.maps> {
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    const fail = (why: string) => { failed = true; reject(new Error(why)); };
    if (!env.googleMapsKey) { fail("no_key"); return; }
    if (typeof window === "undefined") { fail("no_window"); return; }
    const w = window as unknown as Record<string, unknown> & { google?: { maps: typeof google.maps } };
    if (w.google?.maps?.Map) { resolve(w.google.maps); return; }
    const timer = window.setTimeout(() => fail("timeout"), timeoutMs);
    // Google calls this when the key is rejected for this site (referrer, billing, API not enabled).
    w.gm_authFailure = () => { window.clearTimeout(timer); fail("auth"); window.dispatchEvent(new Event("jiran-gmaps-failed")); };
    w.__jiranGmapsReady = () => { window.clearTimeout(timer); resolve(w.google!.maps); };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(env.googleMapsKey)}&v=weekly&loading=async&callback=__jiranGmapsReady`;
    s.async = true;
    s.onerror = () => { window.clearTimeout(timer); fail("blocked"); };
    document.head.appendChild(s);
  });
  return promise;
}
