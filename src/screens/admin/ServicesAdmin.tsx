import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { photoUrl } from "../../features/issues/api";
import { loadAreas, type AreaRow } from "../../features/info/api";
import {
  addServiceNote, saveSrCategory, serviceQueue, serviceRequestDetail, serviceStaff, srCategories, updateServiceRequest,
  type SrCategory, type SrDetail, type SrQueueRow, type Staff,
} from "../../features/services/requests";
import { needsHandler, nextStatuses, type SrStatus } from "../../lib/serviceFlow";
import { LoadError, SrStatusLabel } from "../../components/Status";
import { verifyPass, type PassCheck } from "../../features/services/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
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

const QUEUE_FILTERS = ["open", "submitted", "acknowledged", "assigned", "in_progress", "completed", "cancelled", "all"] as const;

/** Service requests & enquiries: queue with filters, assign, status with a note to the requester, internal notes, categories. */
export function ServicesAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.services"));
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<SrQueueRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [status, setStatus] = useState<(typeof QUEUE_FILTERS)[number]>("open");
  const [cat, setCat] = useState("");
  const [area, setArea] = useState("");
  const [cats, setCats] = useState<SrCategory[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [showCats, setShowCats] = useState(false);
  const openId = params.get("id");

  const load = useCallback(() => {
    setLoadErr(null);
    serviceQueue(status, cat || null, area || null).then(setRows).catch((e) => setLoadErr(t(errorKey(e))));
  }, [status, cat, area, t]);
  const loadCats = useCallback(() => { srCategories(true).then(setCats).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCats(); loadAreas().then((a) => setAreas(a.filter((x) => x.residential && !x.parent_id))).catch(() => {}); }, [loadCats]);

  return (
    <div className="admin-two" style={{ gridTemplateColumns: openId ? "minmax(360px, 560px) 1fr" : "1fr" }}>
      <section style={{ alignSelf: "start", minWidth: 0 }}>
        <div className="row" style={{ marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
          <h1 className="grow" style={{ margin: 0 }}>{t("admin.nav.services")}</h1>
          <button className="btn btn-ghost btn-small" onClick={() => setShowCats(!showCats)}>{t("admin.sr.categories")}</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{t("admin.sr.lead")}</p>
        {showCats && <CategoryEditor cats={cats} onChange={loadCats} />}
        {cats.some((c) => c.proposed) && !showCats && <Banner kind="warn">{t("admin.sr.proposedNote")}</Banner>}
        <div className="chip-row" role="group" aria-label={t("admin.sr.filterStatus")} style={{ margin: "12px 0" }}>
          {QUEUE_FILTERS.map((s) => <button key={s} className="chip-btn" aria-pressed={status === s} onClick={() => setStatus(s)}>{s === "open" || s === "all" ? t(`admin.sr.f.${s}` as StringKey) : t(`sr.status.${s}` as StringKey)}</button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select className="input" style={{ width: "auto", minHeight: 48 }} aria-label={t("admin.sr.filterCategory")} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">{t("admin.sr.allCategories")}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" style={{ width: "auto", minHeight: 48 }} aria-label={t("admin.bill.filterArea")} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("admin.bill.allAreas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {loadErr ? <LoadError text={loadErr} onRetry={load} /> : !rows ? <Spinner label={t("common.loading")} /> : rows.length === 0 ? <div className="card muted">{t("admin.sr.empty")}</div> : (
          <div className="list">
            {rows.map((r) => (
              <button key={r.id} className="list-row" style={{ width: "100%", textAlign: "left", alignItems: "flex-start", outline: openId === r.id ? "3px solid var(--color-red)" : undefined }}
                aria-current={openId === r.id ? "true" : undefined} onClick={() => setParams({ id: r.id })}>
                <span className="grow">
                  <span className="row" style={{ gap: 8, flexWrap: "wrap" }}><SrStatusLabel status={r.status} /><strong>{r.ref_no}</strong><span className="small muted">{t(`sr.kind.${r.kind}` as StringKey)} · {r.category}</span></span>
                  <span style={{ display: "block", margin: "6px 0 2px" }}>{r.description.length > 110 ? `${r.description.slice(0, 110)}…` : r.description}</span>
                  <span className="small muted">{r.unit ?? "—"}{r.area ? ` · ${r.area}` : ""} · {fmt(r.created_at)}{r.handler ? ` · ${r.handler}` : ""}{r.photos ? ` · ${t("admin.sr.photos", { n: r.photos })}` : ""}{r.rating ? ` · ${"★".repeat(r.rating)}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {openId && <RequestPanel id={openId} onClose={() => setParams({})} onChanged={load} />}
    </div>
  );
}

function RequestPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<SrDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [assignee, setAssignee] = useState("");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const load = useCallback(() => {
    setErr(null);
    serviceRequestDetail(id).then((x) => { setD(x); setAssignee(x.handler?.id ?? ""); }).catch((e) => setErr(t(errorKey(e))));
  }, [id, t]);
  useEffect(() => { setD(null); setMsg(null); setNote(""); load(); }, [load]);
  useEffect(() => { serviceStaff().then(setStaff).catch(() => {}); }, []);

  async function move(status: SrStatus) {
    if (!d) return;
    if (needsHandler(status) && !assignee) { setMsg({ kind: "error", text: t("err.assignee_required") }); return; }
    setBusy(true); setMsg(null);
    try {
      await updateServiceRequest(d.id, status, note.trim(), assignee || null);
      setMsg({ kind: "success", text: t("admin.sr.updated", { ref: d.ref_no }) }); setNote(""); load(); onChanged();
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function addNote() {
    if (!d || !internal.trim()) return;
    setBusy(true);
    try { await addServiceNote(d.id, internal.trim()); setInternal(""); load(); } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }

  if (err) return <section><LoadError text={err} onRetry={load} /></section>;
  if (!d) return <section><Spinner /></section>;
  const closed = d.status === "completed" || d.status === "cancelled";
  return (
    <section style={{ alignSelf: "start", minWidth: 0 }} aria-label={d.ref_no}>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <h2 className="grow" style={{ margin: 0 }}>{d.ref_no}</h2>
        <button className="btn btn-ghost btn-small" onClick={onClose}>{t("common.close")}</button>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      <div className="card">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><SrStatusLabel status={d.status} /><strong>{d.category}</strong><span className="small muted">{t(`sr.kind.${d.kind}` as StringKey)}</span></div>
        <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{d.description}</p>
        {d.photo_paths.length > 0 && <div className="photos">{d.photo_paths.map((p, i) => <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer"><img src={photoUrl(p)} alt={t("sr.photoN", { n: i + 1 })} /></a>)}</div>}
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>{t("admin.sr.from")}</dt><dd>{d.requester ?? "—"} · {d.unit ?? "—"}{d.area ? ` · ${d.area}` : ""}</dd>
          <dt>{t("sr.prefDate")}</dt><dd>{d.preferred_date ? `${d.preferred_date} (${t(`sr.window.${d.preferred_window ?? "any"}` as StringKey)})` : "—"}</dd>
          <dt>{t("sr.contactQ")}</dt><dd>{t(`sr.contact.${d.contact_pref}` as StringKey)}{d.requester_contact ? `: ${d.requester_contact}` : ""}</dd>
          {d.rating && <><dt>{t("admin.sr.rating")}</dt><dd>{"★".repeat(d.rating)}{d.rating_comment ? ` “${d.rating_comment}”` : ""}</dd></>}
        </dl>
      </div>

      {!closed && (
        <div className="card">
          <label className="field">
            <span className="label">{t("admin.sr.handler")}</span>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t("admin.sr.nobody")}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.nickname} ({t(s.role === "security" ? "sr.team.security" : "sr.team.management")})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">{t("admin.sr.noteToResident")} <span className="muted">({t("common.optional")})</span></span>
            <textarea className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("admin.sr.noteHint")} />
          </label>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {nextStatuses(d.status).map((s) => (
              <button key={s} disabled={busy} className={`btn btn-small ${s === "completed" ? "btn-success" : s === "cancelled" ? "btn-ghost" : "btn-primary"}`} onClick={() => move(s)}>
                {t(`admin.sr.to.${s}` as StringKey)}
              </button>
            ))}
            {(note.trim() || assignee !== (d.handler?.id ?? "")) && <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => move(d.status)}>{t("admin.sr.sendUpdate")}</button>}
          </div>
        </div>
      )}

      <h3 className="section">{t("sr.progress")}</h3>
      <ol className="card" style={{ paddingLeft: 32 }}>
        {d.history.map((h, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <strong>{t(`sr.status.${h.status}` as StringKey)}</strong> <span className="small muted">{fmt(h.at)}{h.handler ? ` · ${h.handler}` : ""}</span>
            {h.note && <div className="small">{h.note}</div>}
          </li>
        ))}
      </ol>

      <h3 className="section">{t("admin.sr.internal")}</h3>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>{t("admin.sr.internalLead")}</p>
        {(d.notes ?? []).length === 0 ? <p className="small muted">{t("admin.sr.noNotes")}</p> : (d.notes ?? []).map((n, i) => (
          <p key={i} className="small" style={{ margin: "0 0 8px" }}><strong>{n.author ?? "—"}</strong> <span className="muted">{fmt(n.at)}</span><br />{n.body}</p>
        ))}
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" maxLength={1000} value={internal} aria-label={t("admin.sr.addNote")} placeholder={t("admin.sr.addNote")} onChange={(e) => setInternal(e.target.value)} />
          <button className="btn btn-ghost btn-small" disabled={busy || !internal.trim()} onClick={addNote}>{t("common.save")}</button>
        </div>
      </div>
    </section>
  );
}

function CategoryEditor({ cats, onChange }: { cats: SrCategory[]; onChange: () => void }) {
  const { t } = useI18n();
  const [names, setNames] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(c: SrCategory | null, name: string, active: boolean) {
    setErr(null);
    try { await saveSrCategory(c?.id ?? null, name.trim(), active, c?.sort_order ?? (cats.length + 1) * 10); if (!c) setFresh(""); onChange(); }
    catch (e) { setErr(t(errorKey(e))); }
  }
  return (
    <section className="card" aria-label={t("admin.sr.categories")}>
      <p className="small" style={{ marginTop: 0 }}>{t("admin.sr.catLead")}</p>
      {cats.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="input grow" style={{ minWidth: 160 }} aria-label={t("admin.sr.catName")} value={names[c.id] ?? c.name} onChange={(e) => setNames({ ...names, [c.id]: e.target.value })} />
          {c.proposed && <span className="chip lvl-medium">{t("admin.sr.proposed")}</span>}
          {!c.active && <span className="chip">{t("admin.sr.hidden")}</span>}
          <button className="btn btn-ghost btn-small" onClick={() => save(c, names[c.id] ?? c.name, c.active)}>{c.proposed ? t("admin.sr.confirm") : t("common.save")}</button>
          <button className="btn btn-ghost btn-small" onClick={() => save(c, names[c.id] ?? c.name, !c.active)}>{c.active ? t("admin.sr.hide") : t("admin.sr.show")}</button>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" maxLength={40} value={fresh} placeholder={t("admin.sr.newCat")} aria-label={t("admin.sr.newCat")} onChange={(e) => setFresh(e.target.value)} />
        <button className="btn btn-primary btn-small" disabled={fresh.trim().length < 2} onClick={() => save(null, fresh, true)}>{t("admin.sr.addCat")}</button>
      </div>
      {err && <Banner kind="error">{err}</Banner>}
    </section>
  );
}
