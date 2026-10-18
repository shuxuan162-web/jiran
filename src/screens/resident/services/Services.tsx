import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cancelPass, createPass, myPasses, plateOk, normalizePlate, type VisitorPass } from "../../../features/services/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { passQr } from "../../../lib/qr";
import { useTitle } from "../../../lib/useTitle";
import QrImage from "../../../components/QrImage";
import { Banner, Field, Spinner, TopBar } from "../../../components/ui/parts";
import { IconChevron, IconQR, IconUsers, IconWrench, IconX } from "../../../components/ui/Icons";

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

