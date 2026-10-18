import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import {
  SERVICE_CATEGORIES, cancelPass, createPass, createServiceRequest, myPasses, plateOk, normalizePlate, serviceRequests, updateServiceRequest,
  type ServiceCategory, type ServiceRequest, type VisitorPass,
} from "../../../features/services/api";
import { uploadPhoto } from "../../../features/issues/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { passQr } from "../../../lib/qr";
import { useTitle } from "../../../lib/useTitle";
import { fileProblem } from "../../../lib/validation";
import QrImage from "../../../components/QrImage";
import { Banner, Field, Spinner, TopBar } from "../../../components/ui/parts";
import { IconCalendar, IconChevron, IconQR, IconUpload, IconUsers, IconWrench, IconX } from "../../../components/ui/Icons";

const myt = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** Services hub */
export default function Services() {
  const { t } = useI18n();
  useTitle(t("svc.title"));
  const row = (to: string, key: StringKey, sub: StringKey, Icon: typeof IconWrench, tint: string) => (
    <Link to={to} className="list-row">
      <span className="ico" style={{ background: tint }}><Icon /></span>
      <span className="grow"><strong style={{ display: "block" }}>{t(key)}</strong><span className="small muted">{t(sub)}</span></span>
      <IconChevron className="chev" width={20} />
    </Link>
  );
  return (
    <main className="screen">
      <TopBar title={t("svc.title")} back="/app/residence" />
      <div className="list">
        {row("/app/services/requests", "svc.requests", "svc.requestsSub", IconWrench, "var(--color-tint-blue)")}
        {row("/app/services/visitors", "svc.visitors", "svc.visitorsSub", IconUsers, "var(--color-tint-green)")}
        {row("/app/scan", "qr.title", "svc.scanSub", IconQR, "var(--color-tint-orange)")}
        {row("/app/soon/facilities", "svc.facilities", "svc.facilitiesSub", IconCalendar, "var(--color-tint-amber)")}
      </div>
    </main>
  );
}

/** Visitor passes: create, share the QR, see when they arrived, cancel. */
export function VisitorPasses() {
  const { t } = useI18n();
  useTitle(t("svc.visitors"));
  const [list, setList] = useState<VisitorPass[] | null>(null);
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [date, setDate] = useState(myt());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<VisitorPass | null>(null);

  const load = useCallback(() => { myPasses().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);

  const nameErr = name.trim().length < 2 ? t("svc.errVisitor") : null;
  const plateErr = plate.trim() && !plateOk(plate) ? t("svc.errPlate") : null;
  async function create() {
    setTouched(true);
    if (nameErr || plateErr) return;
    setBusy(true); setErr(null);
    try {
      const r = await createPass(name.trim(), plate.trim() ? normalizePlate(plate) : "", date);
      const fresh = await myPasses(); setList(fresh);
      setOpen(fresh.find((p) => p.id === r.id) ?? null);
      setName(""); setPlate(""); setTouched(false);
    } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  async function share(p: VisitorPass) {
    const text = t("svc.shareText", { name: p.visitor_name, date: fmtDate(p.visit_date), code: p.token });
    try { if (navigator.share) await navigator.share({ title: t("svc.passTitle"), text }); else { await navigator.clipboard.writeText(text); setErr(null); alert(t("svc.copied")); } } catch { /* cancelled */ }
  }

  const today = myt();
  return (
    <main className="screen">
      <TopBar title={t("svc.visitors")} back="/app/services" />
      <section className="card">
        <h2 style={{ fontSize: "1.125rem" }}>{t("svc.newPass")}</h2>
        <Field label={t("svc.visitorName")} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={touched ? nameErr : null} />
        <Field label={t("svc.plate")} optional value={plate} maxLength={14} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="WXY 1234" error={touched ? plateErr : null} />
        <Field label={t("svc.visitDate")} type="date" value={date} min={today} max={addDays(today, 30)} onChange={(e) => setDate(e.target.value)} hint={t("svc.visitDateHint")} />
        {err && <Banner kind="error">{err}</Banner>}
        <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? t("common.loading") : t("svc.createPass")}</button>
      </section>

      {open && (
        <section className="card pass-card pop-in" aria-labelledby="pass-h">
          <button className="icon-btn sheet-close" aria-label={t("common.close")} onClick={() => setOpen(null)}><IconX /></button>
          <h2 id="pass-h" style={{ fontSize: "1.125rem" }}>{t("svc.passTitle")}</h2>
          <QrImage value={passQr(open.token)} size={220} label={t("svc.passQrAlt", { name: open.visitor_name })} />
          <p style={{ margin: "8px 0 0", fontWeight: 800 }}>{open.visitor_name}{open.plate ? ` · ${open.plate}` : ""}</p>
          <p className="small muted" style={{ margin: "2px 0 8px" }}>{t("svc.validOn", { date: fmtDate(open.visit_date) })}</p>
          <p className="small" style={{ margin: "0 0 10px" }}>{t("svc.passHow")}</p>
          <button className="btn btn-secondary btn-small" onClick={() => share(open)}>{t("svc.share")}</button>
          <p className="small muted" style={{ marginTop: 8, wordBreak: "break-all" }}>{t("svc.code")}: {open.token}</p>
        </section>
      )}

      <h2 className="section">{t("svc.myPasses")}</h2>
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("svc.noPasses")}</div> : (
        <div className="list">
          {list.map((p) => {
            const state = p.status !== "active" ? p.status : p.visit_date < today ? "expired" : "active";
            return (
              <div key={p.id} className="list-row" style={{ alignItems: "center" }}>
                <span className="grow">
                  <strong style={{ display: "block" }}>{p.visitor_name}{p.plate ? ` · ${p.plate}` : ""}</strong>
                  <span className="small muted">{fmtDate(p.visit_date)}{p.arrived_at ? ` · ${t("svc.arrivedAt", { time: new Date(p.arrived_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })}` : ""}</span>
                </span>
                <span className={`chip ${state === "active" ? "green" : state === "arrived" ? "blue" : ""}`}>{t(`svc.pass.${state}` as StringKey)}</span>
                {state === "active" && <>
                  <button className="btn btn-ghost btn-small" onClick={() => setOpen(p)}>{t("svc.showQr")}</button>
                  <button className="link-btn" onClick={async () => { await cancelPass(p.id).catch(() => {}); load(); if (open?.id === p.id) setOpen(null); }}>{t("common.cancel")}</button>
                </>}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

/** Service requests for the household: new request form + list with status. */
export function ServiceRequests() {
  const { t } = useI18n();
  const { session } = useAuth();
  useTitle(t("svc.requests"));
  const [list, setList] = useState<ServiceRequest[] | null>(null);
  const [cat, setCat] = useState<ServiceCategory>("aircond");
  const [desc, setDesc] = useState("");
  const [pref, setPref] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoErr, setPhotoErr] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => { serviceRequests().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (desc.trim().length < 10 || !session) { setMsg({ kind: "error", text: t("err.description_short") }); return; }
    setBusy(true); setMsg(null);
    try {
      const paths: string[] = [];
      for (const f of photos) paths.push(await uploadPhoto(session.user.id, f, "issues"));
      const r = await createServiceRequest(cat, desc.trim(), pref.trim(), paths);
      setMsg({ kind: "success", text: t("svc.sent", { ref: r.ref_no }) });
      setDesc(""); setPref(""); setPhotos([]); setShowForm(false); load();
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }

  return (
    <main className="screen">
      <TopBar title={t("svc.requests")} back="/app/services" />
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {!showForm ? <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ {t("svc.newRequest")}</button> : (
        <section className="card">
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("svc.categoryQ")}</legend>
            <div className="chip-row">
              {SERVICE_CATEGORIES.map((c) => <button key={c} type="button" className="chip-btn" aria-pressed={cat === c} onClick={() => setCat(c)}>{t(`svc.cat.${c}` as StringKey)}</button>)}
            </div>
          </fieldset>
          <label className="field">
            <span className="label">{t("svc.describe")}</span>
            <textarea className="textarea" value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} placeholder={t("svc.describeHint")} />
          </label>
          <Field label={t("svc.preferred")} optional value={pref} maxLength={80} onChange={(e) => setPref(e.target.value)} placeholder={t("svc.preferredHint")} />
          <div className="field">
            <span className="label">{t("report.photo")} <span className="muted">({t("common.optional")})</span></span>
            {photos.length > 0 && <div className="photos" style={{ marginBottom: 8 }}>{photos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}><img src={URL.createObjectURL(f)} alt="" />
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
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>{t("common.cancel")}</button>
          </div>
        </section>
      )}

      <h2 className="section">{t("svc.household")}</h2>
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("svc.noRequests")}</div> : list.map((r) => (
        <section key={r.id} className="card">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`chip ${r.status === "done" ? "green" : r.status === "cancelled" ? "" : "blue"}`}>{t(`svc.status.${r.status}` as StringKey)}</span>
            <strong>{t(`svc.cat.${r.category}` as StringKey)}</strong>
            <span className="small muted" style={{ marginLeft: "auto" }}>{r.ref_no}</span>
          </div>
          <p style={{ margin: "8px 0 4px" }}>{r.description}</p>
          {r.preferred_time && <p className="small muted" style={{ margin: 0 }}>{t("svc.preferred")}: {r.preferred_time}</p>}
          {r.scheduled_for && <p className="small" style={{ margin: "4px 0 0", fontWeight: 700 }}>{t("svc.scheduledFor", { time: new Date(r.scheduled_for).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p>}
          {r.staff_note && <p className="small" style={{ margin: "4px 0 0" }}>{t("svc.fromManagement")}: {r.staff_note}</p>}
          {r.status === "submitted" && r.requester_id === session?.user.id && (
            <button className="link-btn" onClick={async () => { await updateServiceRequest(r.id, "cancelled", "").catch(() => {}); load(); }}>{t("svc.cancelRequest")}</button>
          )}
        </section>
      ))}
    </main>
  );
}
