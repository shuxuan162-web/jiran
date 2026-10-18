import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { photoUrl, uploadPhoto } from "../../../features/issues/api";
import {
  cancelServiceRequest, createServiceRequest, myServiceRequests, rateServiceRequest, serviceRequestDetail, srCategories,
  type SrCategory, type SrContact, type SrDetail, type SrKind, type SrListRow, type SrWindow,
} from "../../../features/services/requests";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { mytToday } from "../../../lib/billing";
import { SR_FLOW, stepIndex } from "../../../lib/serviceFlow";
import { useTitle } from "../../../lib/useTitle";
import { fileProblem } from "../../../lib/validation";
import { LoadError, SrStatusLabel, useOnline } from "../../../components/Status";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { IconChevron, IconUpload, IconX } from "../../../components/ui/Icons";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Service requests and enquiries: private to you, the home owner and management (unlike complaints, which neighbours see). */
export function ServiceRequests() {
  const { t } = useI18n();
  const { session } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  useTitle(t("svc.requests"));
  const [list, setList] = useState<SrListRow[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [cats, setCats] = useState<SrCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<SrKind>("service");
  const [cat, setCat] = useState<string>("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState("");
  const [win, setWin] = useState<SrWindow>("any");
  const [contact, setContact] = useState<SrContact>("app");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoErr, setPhotoErr] = useState<StringKey | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setListErr(null);
    myServiceRequests().then(setList).catch((e) => setListErr(t(errorKey(e))));
  }, [t]);
  useEffect(() => { load(); srCategories().then(setCats).catch(() => setCats([])); }, [load]);

  const catErr = touched && !cat ? t("sr.errCategory") : null;
  const descErr = touched && desc.trim().length < 10 ? t("err.description_short") : null;
  async function submit() {
    setTouched(true); setMsg(null);
    if (!cat || desc.trim().length < 10 || !session) return;
    if (!online) { setMsg({ kind: "error", text: t("common.offline") }); return; }
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of photos) paths.push(await uploadPhoto(session.user.id, f, "issues"));
      const r = await createServiceRequest({ kind, category: cat, description: desc.trim(), date: date || null, window: date ? win : null, contact, photos: paths });
      nav(`/app/services/requests/${r.id}`, { state: { justSent: r.ref_no } });
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }

  return (
    <main className="screen">
      <TopBar title={t("svc.requests")} back="/app/services" />
      <p className="small muted" style={{ marginTop: 0 }}>{t("sr.privateLead")} <Link to="/app/issues">{t("sr.complaintLink")}</Link></p>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {!showForm ? <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ {t("sr.new")}</button> : (
        <section className="card">
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("sr.kindQ")}</legend>
            <div className="segmented">
              {(["service", "enquiry"] as const).map((k) => (
                <label key={k}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} /><span>{t(`sr.kind.${k}` as StringKey)}</span></label>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }} aria-describedby={catErr ? "sr-cat-err" : undefined}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("sr.categoryQ")}</legend>
            {cats.length === 0 ? <Spinner /> : (
              <div className="chip-row">
                {cats.map((c) => <button key={c.id} type="button" className="chip-btn" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
              </div>
            )}
            {catErr && <span className="error" id="sr-cat-err">{catErr}</span>}
          </fieldset>
          <label className="field">
            <span className="label">{t(kind === "enquiry" ? "sr.askWhat" : "sr.describe")}</span>
            <textarea className="textarea" value={desc} maxLength={1000} aria-invalid={!!descErr} onChange={(e) => setDesc(e.target.value)} placeholder={t("sr.describeHint")} />
            {descErr && <span className="error">{descErr}</span>}
          </label>
          <label className="field">
            <span className="label">{t("sr.prefDate")} <span className="muted">({t("common.optional")})</span></span>
            <input className="input" type="date" value={date} min={mytToday()} max={addDays(mytToday(), 90)} onChange={(e) => setDate(e.target.value)} />
          </label>
          {date && (
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
              <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("sr.prefWindow")}</legend>
              <div className="chip-row">
                {(["morning", "afternoon", "evening", "any"] as const).map((w) => <button key={w} type="button" className="chip-btn" aria-pressed={win === w} onClick={() => setWin(w)}>{t(`sr.window.${w}` as StringKey)}</button>)}
              </div>
            </fieldset>
          )}
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("sr.contactQ")}</legend>
            <div className="chip-row">
              {(["app", "phone", "email"] as const).map((c) => <button key={c} type="button" className="chip-btn" aria-pressed={contact === c} onClick={() => setContact(c)}>{t(`sr.contact.${c}` as StringKey)}</button>)}
            </div>
            <span className="hint">{t("sr.contactHint")}</span>
          </fieldset>
          <div className="field">
            <span className="label">{t("report.photo")} <span className="muted">({t("common.optional")})</span></span>
            {photos.length > 0 && <div className="photos" style={{ marginBottom: 8 }}>{photos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}><img src={URL.createObjectURL(f)} alt={t("sr.photoN", { n: i + 1 })} />
                <button type="button" className="icon-btn" aria-label={t("post.removePhoto")} style={{ position: "absolute", top: 4, right: 4, width: 36, height: 36 }}
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><IconX width={18} /></button></div>))}</div>}
            {photos.length < 3 && <button type="button" className="file-drop" style={{ width: "100%", minHeight: 72 }} onClick={() => fileRef.current?.click()}><IconUpload width={24} /> {t("report.photoChoose")}</button>}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden multiple onChange={(e) => {
              setPhotoErr(null); const next = [...photos];
              for (const f of Array.from(e.target.files ?? [])) { const p = fileProblem(f); if (p || f.type === "application/pdf") { setPhotoErr(p ? (`err.${p}` as StringKey) : "err.file_type"); continue; } if (next.length < 3) next.push(f); }
              setPhotos(next); e.target.value = "";
            }} />
            {photoErr && <span className="error">{t(photoErr)}</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? t("common.loading") : t("common.submit")}</button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setTouched(false); }}>{t("common.cancel")}</button>
          </div>
        </section>
      )}

      <h2 className="section">{t("sr.yours")}</h2>
      {listErr ? <LoadError text={listErr} onRetry={load} /> : !list ? <Spinner label={t("common.loading")} /> : list.length === 0 ? <div className="card muted">{t("sr.none")}</div> : (
        <div className="list">
          {list.map((r) => (
            <Link key={r.id} to={`/app/services/requests/${r.id}`} className="list-row" style={{ alignItems: "flex-start" }}>
              <span className="grow">
                <span className="row" style={{ gap: 8, flexWrap: "wrap" }}><SrStatusLabel status={r.status} /><strong>{r.category}</strong></span>
                <span style={{ display: "block", margin: "6px 0 2px" }}>{r.description.length > 90 ? `${r.description.slice(0, 90)}…` : r.description}</span>
                <span className="small muted">{r.ref_no} · {t(`sr.kind.${r.kind}` as StringKey)} · {fmt(r.created_at)}{!r.mine && r.requester ? ` · ${t("sr.byOther", { name: r.requester })}` : ""}</span>
              </span>
              <IconChevron className="chev" width={20} />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

/** One request: timeline Submitted → Acknowledged → Assigned → In progress → Completed, cancel, rating. */
export function ServiceRequestDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [d, setD] = useState<SrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(() => {
    const ref = (window.history.state?.usr as { justSent?: string } | undefined)?.justSent;
    return ref ? { kind: "success", text: t("sr.sent", { ref }) } : null;
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useTitle(d?.ref_no ?? t("svc.requests"));

  const load = useCallback(() => { setErr(null); serviceRequestDetail(id).then(setD).catch((e) => setErr(t(errorKey(e)))); }, [id, t]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    setBusy(true); setMsg(null);
    try { await cancelServiceRequest(id); setMsg({ kind: "success", text: t("sr.cancelled") }); setConfirmCancel(false); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function rate() {
    if (!rating) { setMsg({ kind: "error", text: t("fb.needRating") }); return; }
    setBusy(true); setMsg(null);
    try { await rateServiceRequest(id, rating, comment); setMsg({ kind: "success", text: t("sr.rated") }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }

  if (err) return <main className="screen"><TopBar title={t("svc.requests")} back="/app/services/requests" /><LoadError text={err} onRetry={load} /></main>;
  if (!d) return <main className="screen"><TopBar title={t("svc.requests")} back="/app/services/requests" /><Spinner label={t("common.loading")} /></main>;
  const reached = stepIndex(d.history);
  const cancelled = d.status === "cancelled";
  const at = (s: string) => d.history.filter((h) => h.status === s).slice(-1)[0];
  const notes = d.history.filter((h) => h.note);
  return (
    <main className="screen">
      <TopBar title={d.ref_no} back="/app/services/requests" />
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      <section className="card">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><SrStatusLabel status={d.status} /><strong>{d.category}</strong>
          <span className="small muted" style={{ marginLeft: "auto" }}>{t(`sr.kind.${d.kind}` as StringKey)}</span></div>
        <p style={{ margin: "10px 0 6px", whiteSpace: "pre-wrap" }}>{d.description}</p>
        {d.photo_paths.length > 0 && <div className="photos">{d.photo_paths.map((p, i) => <img key={p} src={photoUrl(p)} alt={t("sr.photoN", { n: i + 1 })} />)}</div>}
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {d.preferred_date ? `${t("sr.prefDate")}: ${fmtDay(d.preferred_date)} (${t(`sr.window.${d.preferred_window ?? "any"}` as StringKey)}) · ` : ""}
          {t("sr.contactShort", { how: t(`sr.contact.${d.contact_pref}` as StringKey) })}
          {!d.mine && d.requester ? ` · ${t("sr.byOther", { name: d.requester })}` : ""}
        </p>
        {d.handler && <p className="small" style={{ margin: "6px 0 0", fontWeight: 700 }}>{t("sr.handledBy", { name: d.handler.nickname, team: t(d.handler.role === "security" ? "sr.team.security" : "sr.team.management") })}</p>}
      </section>

      <h2 className="section">{t("sr.progress")}</h2>
      <ol className="stepper card" aria-label={t("sr.progress")}>
        {SR_FLOW.map((s, i) => {
          const h = at(s);
          const state = cancelled && i === reached + 1 ? "failed" : i < reached || (i === reached && (s === "completed" || cancelled)) ? "done" : i === reached ? "current" : "";
          return (
            <li key={s} className={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="dot" aria-hidden="true">{state === "done" ? "✓" : state === "failed" ? "×" : i + 1}</span>
              <span>
                <strong style={{ display: "block" }}>{cancelled && i === reached + 1 ? t("sr.status.cancelled") : t(`sr.status.${s}` as StringKey)}</strong>
                <span className="small muted">{h ? fmt(h.at) : cancelled && i === reached + 1 ? fmt(at("cancelled")?.at ?? d.updated_at) : t("sr.notYet")}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {notes.length > 0 && (
        <>
          <h2 className="section">{t("sr.updates")}</h2>
          {notes.map((h, i) => (
            <section key={i} className="card">
              <span className="small muted">{fmt(h.at)} · {t(`sr.status.${h.status}` as StringKey)}{h.handler ? ` · ${h.handler}` : ""}</span>
              <p style={{ margin: "4px 0 0" }}>{h.note}</p>
            </section>
          ))}
        </>
      )}

      {d.can_cancel && (!confirmCancel ? (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setConfirmCancel(true)}>{t("sr.cancel")}</button>
      ) : (
        <section className="card" role="alertdialog" aria-label={t("sr.cancelQ")}>
          <strong>{t("sr.cancelQ")}</strong>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn-danger" disabled={busy} onClick={cancel}>{t("sr.cancelYes")}</button>
            <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>{t("sr.cancelNo")}</button>
          </div>
        </section>
      ))}

      {d.can_rate && (
        <section className="card" style={{ marginTop: 12 }}>
          <strong style={{ display: "block", marginBottom: 6 }}>{t("sr.rateQ")}</strong>
          <div className="stars" role="radiogroup" aria-label={t("sr.rateQ")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("fb.stars", { n })} className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <label className="field"><span className="label">{t("fb.message")} <span className="muted">({t("common.optional")})</span></span>
            <textarea className="textarea" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy} onClick={rate}>{t("sr.rateSend")}</button>
        </section>
      )}
      {d.rating && <p className="small" style={{ marginTop: 12 }}>{t("sr.yourRating", { n: d.rating })}{d.rating_comment ? ` · “${d.rating_comment}”` : ""}</p>}
      <button className="link-btn" style={{ marginTop: 12 }} onClick={() => nav("/app/services/requests")}>{t("sr.allRequests")}</button>
    </main>
  );
}
