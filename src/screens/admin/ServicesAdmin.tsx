import { useCallback, useEffect, useState } from "react";
import {
  feedbackList, serviceRequests, updateServiceRequest, verifyPass, type FeedbackRow, type PassCheck, type ServiceRequest,
} from "../../features/services/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { fromLocalInput } from "../../lib/info";
import { parseQr } from "../../lib/qr";
import { useTitle } from "../../lib/useTitle";
import QrScanner from "../../components/QrScanner";
import { Banner, Spinner } from "../../components/ui/parts";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Guardhouse: scan a visitor's pass with the camera (or type the code), check it, and let them in. */
export function AdminScan() {
  const { t } = useI18n();
  useTitle(t("admin.nav.scan"));
  const [token, setToken] = useState<string | null>(null);
  const [check, setCheck] = useState<PassCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onScan = useCallback(async (raw: string) => {
    const p = parseQr(raw);
    setErr(null); setCheck(null);
    if (p.kind !== "pass") { setToken(null); setErr(t("admin.scan.notPass")); return; }
    setToken(p.token); setBusy(true);
    try { setCheck(await verifyPass(p.token, false)); } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }, [t]);

  async function admit() {
    if (!token) return;
    setBusy(true);
    try { setCheck(await verifyPass(token, true)); } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }

  const good = check && (check.state === "ok" || check.state === "arrived_now");
  return (
    <div className="admin-two">
      <section style={{ alignSelf: "start", maxWidth: 520 }}>
        <h1>{t("admin.nav.scan")}</h1>
        <p className="muted" style={{ marginTop: -8 }}>{t("admin.scan.lead")}</p>
        <QrScanner onResult={onScan} paused={busy || !!check} manualLabel={t("admin.scan.manual")} />
      </section>
      <section style={{ alignSelf: "start" }}>
        {err && <Banner kind="error">{err}</Banner>}
        {busy && !check && <Spinner />}
        {check && (
          <div className={`card pass-result ${good ? "ok" : check.state === "already_arrived" ? "warn" : "bad"}`} aria-live="assertive">
            <div className="pass-verdict">{t(`admin.scan.state.${check.state}` as StringKey)}</div>
            {check.visitor && (
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>{t("svc.visitorName")}</dt><dd>{check.visitor}</dd>
                <dt>{t("svc.plate")}</dt><dd>{check.plate ?? "—"}</dd>
                <dt>{t("admin.scan.date")}</dt><dd>{check.visit_date}</dd>
                <dt>{t("admin.scan.unit")}</dt><dd>{check.unit ?? "—"}</dd>
                <dt>{t("admin.scan.host")}</dt><dd>{check.host ?? "—"}</dd>
                {check.arrived_at && <><dt>{t("admin.scan.arrived")}</dt><dd>{fmt(check.arrived_at)}</dd></>}
              </dl>
            )}
            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {check.state === "ok" && <button className="btn btn-primary" disabled={busy} onClick={admit}>{t("admin.scan.admit")}</button>}
              <button className="btn btn-ghost btn-small" onClick={() => { setCheck(null); setToken(null); }}>{t("admin.scan.next")}</button>
            </div>
          </div>
        )}
        {!check && !err && !busy && <div className="card muted">{t("admin.scan.waiting")}</div>}
      </section>
    </div>
  );
}

const STATUSES: ServiceRequest["status"][] = ["submitted", "scheduled", "in_progress", "done", "cancelled"];

/** Service request queue for management. */
export function ServicesAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.services"));
  const [rows, setRows] = useState<ServiceRequest[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [when, setWhen] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const load = useCallback(() => { serviceRequests().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function set(r: ServiceRequest, status: ServiceRequest["status"]) {
    try { await updateServiceRequest(r.id, status, notes[r.id] ?? "", fromLocalInput(when[r.id] ?? "")); setMsg({ kind: "success", text: t("admin.sv.updated", { ref: r.ref_no }) }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }
  const shown = (rows ?? []).filter((r) => filter === "all" || !["done", "cancelled"].includes(r.status));
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="row" style={{ marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.nav.services")}</h1>
        <div className="chip-row">{(["open", "all"] as const).map((f) => <button key={f} className="chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`admin.c.f.${f}` as StringKey)}</button>)}</div>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {!rows ? <Spinner /> : shown.length === 0 ? <div className="card muted">{t("svc.noRequests")}</div> : (
        <table className="table">
          <thead><tr><th>{t("admin.sv.colRef")}</th><th>{t("admin.sv.colWhat")}</th><th>{t("admin.c.colStatus")}</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="small"><strong>{r.ref_no}</strong><br />{fmt(r.created_at)}</td>
                <td><strong>{t(`svc.cat.${r.category}` as StringKey)}</strong><div className="small">{r.description}</div>
                  {r.preferred_time && <div className="small muted">{t("svc.preferred")}: {r.preferred_time}</div>}</td>
                <td><span className="chip blue">{t(`svc.status.${r.status}` as StringKey)}</span>
                  {r.scheduled_for && <div className="small muted">{fmt(r.scheduled_for)}</div>}</td>
                <td style={{ minWidth: 260 }}>
                  <input className="input" style={{ marginBottom: 6 }} placeholder={t("admin.c.note")} value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                  <input className="input" type="datetime-local" style={{ marginBottom: 6 }} aria-label={t("admin.sv.when")} value={when[r.id] ?? ""} onChange={(e) => setWhen((n) => ({ ...n, [r.id]: e.target.value }))} />
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {STATUSES.filter((s) => s !== r.status && s !== "submitted").map((s) => (
                      <button key={s} className={`btn btn-small ${s === "done" ? "btn-primary" : "btn-ghost"}`} onClick={() => set(r, s)}>{t(`svc.status.${s}` as StringKey)}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Resident feedback (the Feedback tile). Anonymous feedback shows no name. */
export function FeedbackAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.surveys"));
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  useEffect(() => { feedbackList(90).then(setRows).catch(() => setRows([])); }, []);
  const avg = rows && rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
  return (
    <div style={{ maxWidth: 900 }}>
      <h1>{t("admin.fb.title")}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{t("admin.fb.lead", { n: rows?.length ?? 0, avg: avg ?? "—" })}</p>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t("admin.fb.empty")}</div> : rows.map((r) => (
        <section key={r.id} className="card">
          <div className="row" style={{ gap: 8 }}>
            <span className="chip">{t(`fb.topic.${r.topic}` as StringKey)}</span>
            <span aria-label={t("fb.stars", { n: r.rating })} style={{ color: "#B7791F", letterSpacing: 2 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            <span className="small muted" style={{ marginLeft: "auto" }}>{r.nickname ?? t("fb.anonymous")} · {fmt(r.created_at)}</span>
          </div>
          {r.message && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.message}</p>}
        </section>
      ))}
    </div>
  );
}
