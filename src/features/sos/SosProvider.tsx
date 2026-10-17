import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { env } from "../../config/env";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { readPref, writePref } from "../../lib/prefs";
import { useAuth } from "../auth/AuthProvider";
import { uploadPhoto } from "../issues/api";
import { sosUpdate, triggerSos, type EmergencyType } from "./api";

/** State of the SOS this phone just sent. */
export interface LiveSos {
  clientId: string;
  id?: string;
  ref?: string;
  cancelUntil?: string;
  approximate?: boolean;
  sending: boolean;
  queued: boolean;               // offline: saved on this phone, sent on reconnect
  error?: StringKey;             // suspended, rate limited
  location: "pending" | "found" | "unavailable" | "given";
}

interface FireOptions { type?: EmergencyType; lat?: number; lng?: number; description?: string; photo?: File | null; dial?: boolean }

const Ctx = createContext<{
  live: LiveSos | null;
  fire: (o?: FireOptions) => void;
  dial: () => void;
} | null>(null);

const QUEUE_KEY = "sosQueue";
type Queued = { clientId: string; type: EmergencyType; lat: number | null; lng: number | null; at: number };
const readQueue = (): Queued[] => { try { return JSON.parse(readPref(QUEUE_KEY) ?? "[]") as Queued[]; } catch { return []; } };
const writeQueue = (q: Queued[]) => writePref(QUEUE_KEY, JSON.stringify(q));

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID()
  : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

/**
 * One tap starts three jobs at once, and none waits for another:
 *  1. the dialer opens (a demo modal while demo mode is on, so 999 is never dialled from a demo),
 *  2. the alert goes to management and the security desk (home area first, marked approximate),
 *  3. the phone's location is read once and added to the alert when it arrives.
 */
export function SosProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const { t } = useI18n();
  const { session } = useAuth();
  const [live, setLive] = useState<LiveSos | null>(null);
  const [demoDialer, setDemoDialer] = useState(false);
  const pending = useRef<{ id?: string; pos?: { lat: number; lng: number }; extras?: FireOptions }>({});

  const dial = useCallback(() => {
    if (env.demoMode) setDemoDialer(true);
    else window.location.href = "tel:999";
  }, []);

  // Sends whatever details are waiting once both the alert id and the data exist.
  const flushDetails = useCallback(async () => {
    const p = pending.current;
    if (!p.id) return;
    try {
      if (p.pos) { const pos = p.pos; p.pos = undefined; await sosUpdate(p.id, { lat: pos.lat, lng: pos.lng }); }
      if (p.extras && (p.extras.description || p.extras.photo)) {
        const ex = p.extras; p.extras = undefined;
        const photoPath = ex.photo && session ? await uploadPhoto(session.user.id, ex.photo, "issues") : undefined;
        await sosUpdate(p.id, { description: ex.description, photoPath });
      }
    } catch { /* the alert itself is out; details are best-effort and can be added on the SOS screen */ }
  }, [session]);

  const send = useCallback(async (q: Queued) => {
    try {
      const r = await triggerSos(q.clientId, q.lat, q.lng, q.type);
      writeQueue(readQueue().filter((x) => x.clientId !== q.clientId));
      pending.current.id = r.id;
      setLive((l) => (l && l.clientId === q.clientId
        ? { ...l, id: r.id, ref: r.ref_no, cancelUntil: r.cancel_until, approximate: r.approximate, sending: false, queued: false }
        : l));
      void flushDetails();
    } catch (e) {
      const k = errorKey(e);
      if (k === "err.network") {
        if (!readQueue().some((x) => x.clientId === q.clientId)) writeQueue([...readQueue(), q]);
        setLive((l) => (l && l.clientId === q.clientId ? { ...l, sending: false, queued: true } : l));
      } else {
        writeQueue(readQueue().filter((x) => x.clientId !== q.clientId));
        setLive((l) => (l && l.clientId === q.clientId ? { ...l, sending: false, error: k } : l));
      }
    }
  }, [flushDetails]);

  const fire = useCallback((o: FireOptions = {}) => {
    if (o.dial !== false) dial();                                     // job 1: never waits for the network
    const clientId = newId();
    const given = o.lat != null && o.lng != null;
    pending.current = { extras: o };
    setLive({ clientId, sending: true, queued: false, location: given ? "given" : "pending" });
    nav("/app/sos/live");
    void send({ clientId, type: o.type ?? "unspecified", lat: given ? o.lat! : null, lng: given ? o.lng! : null, at: Date.now() }); // job 2
    if (!given && "geolocation" in navigator) {                       // job 3
      navigator.geolocation.getCurrentPosition(
        (p) => {
          pending.current.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
          setLive((l) => (l && l.clientId === clientId ? { ...l, location: "found" } : l));
          void flushDetails();
        },
        () => setLive((l) => (l && l.clientId === clientId ? { ...l, location: "unavailable" } : l)),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    } else if (!given) {
      setLive((l) => (l ? { ...l, location: "unavailable" } : l));
    }
  }, [dial, nav, send, flushDetails]);

  // Anything queued while offline goes out on reconnect (and on the next app open).
  useEffect(() => {
    const flush = () => { for (const q of readQueue()) if (Date.now() - q.at < 30 * 60 * 1000) void send(q); };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [send]);

  return (
    <Ctx.Provider value={{ live, fire, dial }}>
      {children}
      {demoDialer && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="demo-dial-title" onClick={() => setDemoDialer(false)}>
          <div className="modal pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="dial-art" aria-hidden="true">999</div>
            <h2 id="demo-dial-title">{t("sos.demoDialTitle")}</h2>
            <p>{t("sos.demoDialBody")}</p>
            <button className="btn btn-primary" autoFocus onClick={() => setDemoDialer(false)}>{t("common.close")}</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useSos() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSos outside SosProvider");
  return v;
}
