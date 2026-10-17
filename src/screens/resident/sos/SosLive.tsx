import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { useSos } from "../../../features/sos/SosProvider";
import { ACTIVE_SOS, EMERGENCY_TYPES, cancelSos, sosStatus, sosUpdate, type EmergencyType, type SosDetail } from "../../../features/sos/api";
import { uploadPhoto } from "../../../features/issues/api";
import { supabase } from "../../../lib/supabase";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { fileProblem } from "../../../lib/validation";
import { useTitle } from "../../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { IconUpload } from "../../../components/ui/Icons";

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** E2: after SOS. Status, call 999, add details, live progress, cancel within 2 minutes. */
export default function SosLive() {
  const { id: param = "live" } = useParams();
  const { t } = useI18n();
  const { session } = useAuth();
  const { live, dial } = useSos();
  useTitle(t("sos.title"));
  const id = param === "live" ? live?.id : param;
  const [d, setD] = useState<SosDetail | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<StringKey | null>(null);
  const [err, setErr] = useState<StringKey | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try { setD(await sosStatus(id)); } catch { setD((x) => x ?? null); }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void load();
    const poll = window.setInterval(load, 5000);
    const ch = supabase.channel(`sos-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "emergencies", filter: `id=eq.${id}` }, () => void load())
      .subscribe();
    return () => { window.clearInterval(poll); void supabase.removeChannel(ch); };
  }, [id, load]);
  useEffect(() => { const x = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(x); }, []);

  const pendingHere = param === "live" && live;
  const active = d ? ACTIVE_SOS.includes(d.status) : true;
  const secsLeft = d ? Math.max(0, Math.round((new Date(d.cancel_until).getTime() - now) / 1000)) : 0;
  const canCancel = d && (d.status === "unconfirmed" || d.status === "community_confirmed") && secsLeft > 0;

  async function setType(type: EmergencyType) {
    if (!id) return;
    setErr(null);
    try { await sosUpdate(id, { type }); await load(); } catch (e) { setErr(errorKey(e)); }
  }
  async function sendDetails() {
    if (!id || !session || (!desc.trim() && !photo)) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      let photoPath: string | undefined;
      if (photo) { const p = fileProblem(photo); if (p) throw new Error(p); photoPath = await uploadPhoto(session.user.id, photo, "issues"); }
      await sosUpdate(id, { description: desc.trim() || undefined, photoPath });
      setDesc(""); setPhoto(null); setMsg("sos.detailsSent");
      await load();
    } catch (e) { setErr(errorKey(e)); }
    setBusy(false);
  }
  async function cancel() {
    if (!id) return;
    setErr(null);
    try { await cancelSos(id); await load(); } catch (e) { setErr(errorKey(e)); }
  }

  // Status line at the top: what is true right now, in plain words.
  let head: { kind: "success" | "warn" | "error" | "info"; text: string };
  if (pendingHere && live.error) head = { kind: "error", text: t(live.error === "err.sos_suspended" || live.error === "err.rate_limited" ? live.error : "sos.failed") };
  else if (pendingHere && live.queued) head = { kind: "warn", text: t("sos.queued") };
  else if (!id || (pendingHere && live.sending)) head = { kind: "info", text: t("sos.sending") };
  else if (d && d.status === "cancelled") head = { kind: "info", text: t("sos.cancelledHead") };
  else if (d && !active) head = { kind: "success", text: t(`sosStatus.${d.status}` as StringKey) };
  else head = { kind: "success", text: t("sos.sent") };

  const locLine = pendingHere && live.location === "pending" ? t("sos.locPending")
    : d?.approximate ? t("sos.locApprox", { area: d.area_name ?? "" })
    : d ? t("sos.locExact", { area: d.area_name ?? "" }) : "";

  return (
    <main className="screen">
      <TopBar title={d?.ref_no ?? t("sos.title")} back="/app/residence" />
      <div className="sos-status-card" data-kind={head.kind} role="status" aria-live="assertive">
        <strong>{head.text}</strong>
        {locLine && <span>{locLine}</span>}
      </div>

      <button className="btn btn-danger" style={{ marginTop: 12, minHeight: 64, fontSize: "1.25rem" }} onClick={dial}>{t("sos.call999")}</button>
      <p className="small muted" style={{ marginTop: 6 }}>{t("sos.note112")}</p>

      {canCancel && (
        <button className="btn btn-ghost" onClick={cancel}>{t("sos.cancel", { s: secsLeft })}</button>
      )}

      {id && d === undefined && <Spinner />}
      {d && active && (
        <>
          <h2 className="section">{t("sos.whatKind")}</h2>
          <div className="chip-row" role="group" aria-label={t("sos.whatKind")}>
            {EMERGENCY_TYPES.map((x) => (
              <button key={x} type="button" className="chip-btn" aria-pressed={d.type === x} onClick={() => setType(x)}>
                {t(`sosType.${x}` as StringKey)}
              </button>
            ))}
          </div>

          <h2 className="section">{t("sos.addDetails")}</h2>
          <section className="card">
            <textarea className="textarea" style={{ minHeight: 80 }} value={desc} maxLength={500} placeholder={t("sos.detailsPh")}
              aria-label={t("sos.addDetails")} onChange={(e) => setDesc(e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()}>
                <IconUpload width={18} /> {photo ? photo.name.slice(0, 18) : t("issue.addPhoto")}
              </button>
              <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <button className="btn btn-primary btn-small" style={{ marginLeft: "auto" }} disabled={busy || (!desc.trim() && !photo)} onClick={sendDetails}>
                {t("issue.send")}
              </button>
            </div>
            {d.description && <p className="small muted" style={{ margin: "8px 0 0" }}>{t("sos.youSaid", { text: d.description })}</p>}
          </section>
        </>
      )}
      {msg && <div style={{ marginTop: 12 }}><Banner kind="success">{t(msg)}</Banner></div>}
      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{t(err)}</Banner></div>}

      <h2 className="section">{t("sos.next")}</h2>
      <section className="card">
        {d ? (
          <ol className="timeline">
            {d.events.map((e, i) => (
              <li key={i}>
                <span className="tl-dot" aria-hidden="true" />
                <strong>{t(`sosStatus.${e.status}` as StringKey)}</strong>
                <span className="small muted" style={{ display: "block" }}>{fmtTime(e.at)}{e.note ? ` · ${e.note}` : ""}</span>
              </li>
            ))}
            {active && (
              <li className="todo"><span className="tl-dot" aria-hidden="true" /><strong>{t("sos.nextStep")}</strong>
                <span className="small" style={{ display: "block" }}>{t("sos.nextStepSub")}</span></li>
            )}
          </ol>
        ) : <p style={{ margin: 0 }}>{t("sos.nextIntro")}</p>}
      </section>

      <Link to="/app/emergency" className="btn btn-ghost" style={{ marginTop: 16 }}>{t("sos.numbers")}</Link>
    </main>
  );
}
