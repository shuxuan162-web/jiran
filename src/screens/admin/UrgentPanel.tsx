import { useCallback, useEffect, useRef, useState } from "react";
import { staffSosAction, urgentQueue, type UrgentRow } from "../../features/sos/api";
import { photoUrl } from "../../features/issues/api";
import { supabase } from "../../lib/supabase";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import LeafletMap from "../../lib/map/LeafletMap";
import { Banner, Spinner } from "../../components/ui/parts";

type Action = "mgmt_confirmed" | "responding" | "resolved" | "false_alarm";
const ACTIONS: Action[] = ["mgmt_confirmed", "responding", "resolved", "false_alarm"];
const ACTIVE = ["unconfirmed", "community_confirmed", "mgmt_confirmed", "responding"];

/** Short two-tone alert made in the browser (no audio file). Browsers allow it after the first click on the page. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = i % 2 ? 660 : 880; o.type = "square";
      g.gain.setValueAtTime(0.12, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
    });
  } catch { /* sound is a bonus; the flash still shows */ }
}

/** Management and security desk: active SOS first, exact location and contact, two-click lifecycle. */
export default function UrgentPanel() {
  const { t } = useI18n();
  useTitle(t("admin.nav.urgent"));
  const [rows, setRows] = useState<UrgentRow[] | null>(null);
  const [history, setHistory] = useState(false);
  const [flash, setFlash] = useState(false);
  const [arming, setArming] = useState<{ id: string; action: Action } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [err, setErr] = useState<StringKey | null>(null);
  const [sound, setSound] = useState(true);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await urgentQueue(history);
      const newOnes = r.filter((x) => ACTIVE.includes(x.status) && known.current && !known.current.has(x.id));
      if (newOnes.length) {
        setFlash(true); window.setTimeout(() => setFlash(false), 4000);
        if (sound) beep();
        if (document.hidden) document.title = `(${newOnes.length}) SOS · Jiran`;
      }
      known.current = new Set(r.map((x) => x.id));
      setRows(r);
    } catch { setErr("err.network"); setRows((x) => x ?? []); }
  }, [history, sound]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 10000);
    const ch = supabase.channel(`urgent-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emergencies" }, () => void load())
      .subscribe();
    const onVis = () => { if (!document.hidden) document.title = `${t("admin.nav.urgent")} · Jiran`; };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(poll); void supabase.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); };
  }, [load, t]);

  async function act(row: UrgentRow, action: Action) {
    if (!arming || arming.id !== row.id || arming.action !== action) { setArming({ id: row.id, action }); return; } // click 1: arm
    setErr(null);
    try { await staffSosAction(row.id, action, notes[row.id] ?? ""); setArming(null); setNotes((n) => ({ ...n, [row.id]: "" })); await load(); }
    catch (e) { setErr(errorKey(e)); }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  const active = (rows ?? []).filter((r) => ACTIVE.includes(r.status));
  const closed = (rows ?? []).filter((r) => !ACTIVE.includes(r.status));

  return (
    <div className={flash ? "urgent-flash" : ""}>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.u.title")}</h1>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {t("admin.u.sound")}</label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> {t("admin.u.history")}</label>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("admin.u.lead")}</p>
      {err && <div style={{ marginBottom: 12 }}><Banner kind="error">{t(err)}</Banner></div>}
      {!rows ? <Spinner /> : active.length === 0 ? <div className="card" style={{ fontWeight: 700 }}>{t("admin.u.none")}</div> : (
        <div className="urgent-grid">
          {active.map((r) => (
            <article key={r.id} className={`card urgent-card status-${r.status}`} aria-labelledby={`u-${r.id}`}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span className="chip lvl-urgent"><span aria-hidden="true">⚠</span> {t(`sosStatus.${r.status}` as StringKey)}</span>
                <strong id={`u-${r.id}`} style={{ fontSize: "1.125rem" }}>{t(`sosType.${r.type}` as StringKey)} · {r.ref_no}</strong>
                <span className="small muted" style={{ marginLeft: "auto" }}>{fmt(r.created_at)}</span>
              </div>
              <div className="urgent-body">
                <div>
                  <p style={{ margin: "8px 0 4px" }}><strong>{r.area_name ?? "City of Elmina"}</strong> · {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                    {r.approximate && <span className="chip" style={{ marginLeft: 6 }}>{t("admin.u.approx")}</span>}</p>
                  <a className="small" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`} target="_blank" rel="noreferrer">{t("admin.u.openMap")}</a>
                  <p style={{ margin: "8px 0 0" }}>{r.reporter_name} ({r.reporter_nickname})</p>
                  <p className="small" style={{ margin: "2px 0" }}>
                    {r.reporter_phone ? <a href={`tel:${r.reporter_phone}`}>{r.reporter_phone}</a> : t("admin.u.noPhone")} · {r.reporter_email}
                  </p>
                  {r.reporter_warnings > 0 && <p className="small" style={{ color: "var(--color-urgent)", fontWeight: 700, margin: "2px 0" }}>{t("admin.u.warnings", { n: r.reporter_warnings })}</p>}
                  {r.confirm_count > 0 && <p className="small" style={{ margin: "2px 0" }}>{t("admin.u.seen", { n: r.confirm_count })}</p>}
                  {r.description && <p style={{ margin: "8px 0 0" }}>“{r.description}”</p>}
                  {r.photo_path && <a href={photoUrl(r.photo_path)} target="_blank" rel="noreferrer"><img src={photoUrl(r.photo_path)} alt={t("admin.u.photo")} style={{ width: 140, borderRadius: 12, marginTop: 8 }} /></a>}
                  {r.handled_by_nickname && <p className="small muted" style={{ margin: "6px 0 0" }}>{t("admin.u.handledBy", { name: r.handled_by_nickname })}{r.staff_note ? ` · ${r.staff_note}` : ""}</p>}
                </div>
                <LeafletMap label={`${r.ref_no} location`} height={180} interactive={false} center={[r.lat, r.lng]} zoom={16}
                  pins={[{ id: r.id, lat: r.lat, lng: r.lng, label: r.ref_no, html: '<div class="pin pin-sos"><span>!</span></div>', size: [44, 52] }]} />
              </div>
              <input className="input" style={{ marginTop: 10, minHeight: 44 }} placeholder={t("admin.u.notePh")} value={notes[r.id] ?? ""}
                aria-label={t("admin.u.notePh")} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} maxLength={300} />
              <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {ACTIONS.filter((a) => a !== r.status).map((a) => {
                  const armed = arming?.id === r.id && arming.action === a;
                  return (
                    <button key={a} className={`btn btn-small ${a === "false_alarm" ? "btn-ghost" : a === "resolved" ? "btn-success" : "btn-primary"}${armed ? " armed" : ""}`}
                      onClick={() => act(r, a)}>
                      {armed ? t("admin.u.sure", { action: t(`admin.u.act.${a}` as StringKey) }) : t(`admin.u.act.${a}` as StringKey)}
                    </button>
                  );
                })}
                {arming?.id === r.id && <button className="link-btn" onClick={() => setArming(null)}>{t("common.cancel")}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {history && closed.length > 0 && (
        <>
          <h2 className="section">{t("admin.u.recent")}</h2>
          <table className="table">
            <thead><tr><th>Ref</th><th>{t("admin.q.status")}</th><th>{t("admin.q.area")}</th><th>{t("admin.u.reporter")}</th><th>{t("admin.u.time")}</th></tr></thead>
            <tbody>{closed.map((r) => (
              <tr key={r.id}><td>{r.ref_no}</td><td>{t(`sosStatus.${r.status}` as StringKey)}</td><td>{r.area_name}</td>
                <td>{r.reporter_nickname}{r.reporter_warnings ? ` (${r.reporter_warnings}⚠)` : ""}</td><td>{fmt(r.created_at)}</td></tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
