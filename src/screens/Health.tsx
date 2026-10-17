import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { env, configMissing } from "../config/env";
import { useI18n, type StringKey } from "../i18n";
import { useTitle } from "../lib/useTitle";
import { IconAlert, IconCheck, IconX } from "../components/ui/Icons";
import { MAP_PROVIDER_LABEL, TILE_URL } from "../lib/map/elmina";
import { loadGoogleMaps } from "../lib/map/googleLoader";

type State = "checking" | "ok" | "warn" | "fail";
interface Check { key: StringKey; state: State; detail: string; }

const withTimeout = <T,>(p: Promise<T>, ms = 8000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** Pre-demo sanity check: database, auth, storage, realtime, functions, map, demo mode. */
export default function Health({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  useTitle(t("health.title"));
  const [checks, setChecks] = useState<Check[]>([]);

  const run = useCallback(async () => {
    const base: Check[] = [
      { key: "health.db", state: "checking", detail: "" },
      { key: "health.auth", state: "checking", detail: "" },
      { key: "health.storage", state: "checking", detail: "" },
      { key: "health.realtime", state: "checking", detail: "" },
      { key: "health.functions", state: "checking", detail: "" },
      { key: "health.map", state: "checking", detail: "" },
      { key: "health.demo", state: env.demoMode ? "ok" : "warn", detail: env.demoMode ? t("health.demoOn") : t("health.demoOff") },
    ];
    setChecks(base);
    const set = (key: StringKey, state: State, detail: string) =>
      setChecks((cs) => cs.map((c) => (c.key === key ? { ...c, state, detail } : c)));

    // Map: Google Maps when its key works for this site, otherwise the key-less OpenStreetMap tiles.
    const checkTiles = (fallbackNote: string) => {
      const tile = new Image();
      const tileTimer = setTimeout(() => set("health.map", "fail", t("health.mapSlow")), 8000);
      tile.onload = () => { clearTimeout(tileTimer); set("health.map", fallbackNote ? "warn" : "ok", `${MAP_PROVIDER_LABEL}${fallbackNote}`); };
      tile.onerror = () => { clearTimeout(tileTimer); set("health.map", "fail", t("health.mapSlow")); };
      tile.src = TILE_URL.replace("{s}", "a").replace("{z}", "14").replace("{x}", "12811").replace("{y}", "8047").replace("{r}", "");
    };
    if (env.googleMapsKey) {
      loadGoogleMaps().then(() => set("health.map", "ok", t("health.mapGoogle")))
        .catch((e: Error) => checkTiles(` · ${t("health.mapGoogleFailed", { why: e.message })}`));
    } else checkTiles("");

    if (configMissing) {
      ["health.db", "health.auth", "health.storage", "health.realtime", "health.functions"].forEach((k) =>
        set(k as StringKey, "fail", "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing"));
      return;
    }

    withTimeout(Promise.resolve(supabase.rpc("health_ping"))).then(({ data, error }) => {
      if (error) set("health.db", "fail", error.message);
      else set("health.db", "ok", `${(data as { township: string }).township} · ${(data as { areas: number }).areas} areas`);
    }).catch((e) => set("health.db", "fail", String(e.message ?? e)));

    withTimeout(fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } })).then((r) =>
      set("health.auth", r.ok ? "ok" : "fail", r.ok ? "Email sign-in available" : `HTTP ${r.status}`))
      .catch((e) => set("health.auth", "fail", String(e.message ?? e)));

    withTimeout(Promise.resolve(supabase.storage.from("public-media").list("", { limit: 1 }))).then(({ error }) =>
      set("health.storage", error ? "fail" : "ok", error ? error.message : "Buckets reachable"))
      .catch((e) => set("health.storage", "fail", String(e.message ?? e)));

    withTimeout(fetch(`${env.supabaseUrl}/functions/v1/accept-invite`, { method: "OPTIONS" })).then((r) =>
      set("health.functions", r.ok ? "ok" : "fail", r.ok ? "register-owner, accept-invite" : `HTTP ${r.status}`))
      .catch((e) => set("health.functions", "fail", String(e.message ?? e)));

    const ch = supabase.channel(`health-${Math.random().toString(36).slice(2)}`);
    const timer = setTimeout(() => { set("health.realtime", "fail", "No connection after 8 s (app falls back to polling)"); void supabase.removeChannel(ch); }, 8000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); set("health.realtime", "ok", "Connected"); void supabase.removeChannel(ch); }
    });
  }, [t]);

  useEffect(() => { void run(); }, [run]);

  const icon = (s: State) => s === "ok" ? <IconCheck style={{ color: "var(--color-success)" }} width={26} />
    : s === "fail" ? <IconX style={{ color: "var(--color-urgent)" }} width={26} />
    : s === "warn" ? <IconAlert style={{ color: "#B5400C" }} width={26} /> : <span className="spinner" style={{ width: 22, height: 22, margin: 0, borderWidth: 3 }} />;
  const word = (s: State) => s === "ok" ? t("health.ok") : s === "fail" ? t("health.fail") : s === "warn" ? t("health.warn") : t("health.checking");

  const body = (
    <>
      <h1>{t("health.title")}</h1>
      <p className="muted" style={{ marginTop: 8 }}>{t("health.lead")}</p>
      <div className="card" aria-live="polite">
        {checks.map((c) => (
          <div key={c.key} className="health-row">
            {icon(c.state)}
            <div className="grow"><strong>{t(c.key)}</strong><div className="small muted">{c.detail}</div></div>
            <span className={`chip ${c.state === "ok" ? "green" : c.state === "fail" ? "red" : ""}`}>{word(c.state)}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary" style={{ marginTop: 16, maxWidth: 320 }} onClick={run}>{t("health.rerun")}</button>
    </>
  );
  return embedded ? body : <main className="screen no-nav">{body}</main>;
}
