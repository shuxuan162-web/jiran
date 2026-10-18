import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminBills, attachInvoice, importBills, invoiceLink, markBillPaid, reminderDays, removeInvoice, saveBill, setReminderDays, unitSearch, voidBill,
  type AdminBill, type ImportRow, type UnitHit,
} from "../../features/billing/api";
import { loadAreas, type AreaRow } from "../../features/info/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { BILL_KINDS, CSV_COLUMNS, csvToBills, money, mytToday, type BillKind, type CsvBill } from "../../lib/billing";
import { useTitle } from "../../lib/useTitle";
import { BillStatus, LoadError } from "../../components/Status";
import { Banner, Spinner } from "../../components/ui/parts";

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const STATES = ["unpaid", "overdue", "due_soon", "upcoming", "paid", "void", "all"] as const;

type Draft = { id: string | null; unit: UnitHit | null; kind: BillKind; period: string; amount: string; due: string; reference: string; note: string };
const EMPTY: Draft = { id: null, unit: null, kind: "maintenance_fee", period: "", amount: "", due: "", reference: "", note: "" };

/** Billing reminders: management adds real bills per unit (form or CSV), marks them paid, voids mistakes, attaches invoices. */
export default function BillingAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.billing"));
  const [rows, setRows] = useState<AdminBill[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [state, setState] = useState<(typeof STATES)[number]>("unpaid");
  const [area, setArea] = useState<string>("");
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<"none" | "form" | "csv">("none");
  const [days, setDays] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoadErr(null); setRows(null);
    adminBills(state, area || null).then(setRows).catch((e) => setLoadErr(t(errorKey(e))));
  }, [state, area, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadAreas().then((a) => setAreas(a.filter((x) => x.residential && !x.parent_id))).catch(() => {});
    reminderDays().then(setDays).catch(() => setDays(3));
  }, []);

  const done = (text: string) => { setMsg({ kind: "success", text }); load(); };
  const fail = (e: unknown) => setMsg({ kind: "error", text: t(errorKey(e)) });

  function edit(b: AdminBill) {
    setDraft({ id: b.id, unit: { id: b.unit_id, label: b.unit_label, area_name: b.area_name, owners: b.owners }, kind: b.kind, period: b.period,
      amount: b.amount.toFixed(2), due: b.due_date, reference: b.reference ?? "", note: b.note ?? "" });
    setPanel("form"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function paid(b: AdminBill, undo = false) {
    setMsg(null);
    try { await markBillPaid(b.id, undo ? null : mytToday()); done(t(undo ? "admin.bill.unpaidDone" : "admin.bill.paidDone", { unit: b.unit_label })); } catch (e) { fail(e); }
  }
  async function voidIt(b: AdminBill) {
    const reason = window.prompt(t("admin.bill.voidWhy"));
    if (reason === null) return;
    setMsg(null);
    try { await voidBill(b.id, reason); done(t("admin.bill.voidDone", { unit: b.unit_label })); } catch (e) { fail(e); }
  }
  async function invoice(b: AdminBill, file: File | null) {
    setMsg(null);
    try {
      if (!file) { await removeInvoice(b.id); done(t("admin.bill.invoiceRemoved")); return; }
      if (file.size > 10 * 1024 * 1024) { setMsg({ kind: "error", text: t("admin.bill.fileBig") }); return; }
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) { setMsg({ kind: "error", text: t("err.file_type") }); return; }
      await attachInvoice(b, file); done(t("admin.bill.invoiceDone", { unit: b.unit_label }));
    } catch (e) { fail(e); }
  }
  async function viewInvoice(b: AdminBill) {
    const w = window.open("", "_blank"); if (w) w.opener = null;
    try { const url = await invoiceLink(b.id); if (w) w.location.href = url; } catch (e) { w?.close(); fail(e); }
  }
  async function saveDays() {
    if (!days) return;
    try { await setReminderDays(days); setMsg({ kind: "success", text: t("admin.bill.daysSaved", { n: days }) }); } catch (e) { fail(e); }
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="row" style={{ marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.nav.billing")}</h1>
        <button className="btn btn-primary btn-small" onClick={() => { setDraft(EMPTY); setPanel("form"); }}>+ {t("admin.bill.add")}</button>
        <button className="btn btn-ghost btn-small" onClick={() => setPanel(panel === "csv" ? "none" : "csv")}>{t("admin.bill.import")}</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("admin.bill.lead")}</p>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}

      {panel === "form" && draft && <BillForm draft={draft} onClose={() => setPanel("none")} onSaved={(text) => { setPanel("none"); done(text); }} />}
      {panel === "csv" && <CsvImport onClose={() => setPanel("none")} onImported={(n) => { setPanel("none"); done(t("admin.bill.imported", { n })); }} />}

      <div className="row" style={{ gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
        <div className="chip-row" role="group" aria-label={t("admin.bill.filterState")}>
          {STATES.map((s) => <button key={s} className="chip-btn" aria-pressed={state === s} onClick={() => setState(s)}>{t(`admin.bill.f.${s}` as StringKey)}</button>)}
        </div>
        <label className="row" style={{ gap: 8 }}>
          <span className="small" style={{ fontWeight: 700 }}>{t("admin.bill.filterArea")}</span>
          <select className="input" style={{ width: "auto", minHeight: 48 }} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("admin.bill.allAreas")}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      {loadErr ? <LoadError text={loadErr} onRetry={load} /> : !rows ? <Spinner label={t("common.loading")} /> : rows.length === 0 ? (
        <div className="card muted">{state === "unpaid" && !area ? t("admin.bill.emptyAll") : t("admin.bill.empty")}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>{t("admin.bill.colUnit")}</th><th>{t("admin.bill.colBill")}</th><th>{t("admin.bill.colAmount")}</th><th>{t("admin.bill.colStatus")}</th><th>{t("admin.bill.colActions")}</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td><strong>{b.unit_label}</strong><div className="small muted">{b.area_name}{b.owners === 0 ? ` · ${t("admin.bill.noOwner")}` : ""}</div></td>
                  <td>{t(`bill.kind.${b.kind}` as StringKey)}<div className="small muted">{b.period}{b.reference ? ` · ${b.reference}` : ""}</div></td>
                  <td style={{ whiteSpace: "nowrap" }}><strong>{money(b.amount)}</strong><div className="small muted">{t("bill.dueOn", { date: fmtDate(b.due_date) })}</div></td>
                  <td><BillStatus state={b.state} />{b.paid_at && <div className="small muted">{fmtDate(b.paid_at)}</div>}{b.void_reason && <div className="small muted">{b.void_reason}</div>}</td>
                  <td style={{ minWidth: 260 }}>
                    {b.status === "open" && (
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        {b.paid_at ? <button className="btn btn-ghost btn-small" onClick={() => paid(b, true)}>{t("admin.bill.undoPaid")}</button>
                          : <button className="btn btn-success btn-small" onClick={() => paid(b)}>{t("admin.bill.markPaid")}</button>}
                        <button className="btn btn-ghost btn-small" onClick={() => edit(b)}>{t("admin.bill.edit")}</button>
                        <button className="btn btn-ghost btn-small" onClick={() => voidIt(b)}>{t("admin.bill.void")}</button>
                        <InvoiceButton bill={b} onFile={(f) => invoice(b, f)} onView={() => viewInvoice(b)} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card" style={{ marginTop: 20, maxWidth: 560 }}>
        <h2 style={{ fontSize: "1.125rem", margin: "0 0 6px" }}>{t("admin.bill.daysTitle")}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>{t("admin.bill.daysLead")}</p>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" type="number" min={1} max={30} style={{ width: 100 }} aria-label={t("admin.bill.daysTitle")} value={days ?? ""} onChange={(e) => setDays(Number(e.target.value) || null)} />
          <button className="btn btn-ghost btn-small" disabled={!days || days < 1 || days > 30} onClick={saveDays}>{t("common.save")}</button>
        </div>
      </section>
    </div>
  );
}

function InvoiceButton({ bill, onFile, onView }: { bill: AdminBill; onFile: (f: File | null) => void; onView: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      {bill.has_invoice ? (
        <>
          <button className="btn btn-ghost btn-small" onClick={onView}>{t("admin.bill.viewInvoice")}</button>
          <button className="btn btn-ghost btn-small" onClick={() => onFile(null)}>{t("admin.bill.removeInvoice")}</button>
        </>
      ) : <button className="btn btn-ghost btn-small" onClick={() => ref.current?.click()}>{t("admin.bill.attach")}</button>}
      <input ref={ref} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={t("admin.bill.attach")}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </>
  );
}

function BillForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (text: string) => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<Draft>(draft);
  const [q, setQ] = useState(draft.unit?.label ?? "");
  const [hits, setHits] = useState<UnitHit[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setD(draft); setQ(draft.unit?.label ?? ""); }, [draft]);
  useEffect(() => {
    if (d.unit && q === d.unit.label) { setHits([]); return; }
    const h = setTimeout(() => { unitSearch(q).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(h);
  }, [q, d.unit]);

  const amount = Number(d.amount);
  const errs = {
    unit: !d.unit ? t("admin.bill.errUnit") : null,
    period: !d.period.trim() ? t("admin.bill.errPeriod") : null,
    amount: d.amount === "" || !Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100 ? t("admin.bill.errAmount") : null,
    due: !/^\d{4}-\d{2}-\d{2}$/.test(d.due) ? t("admin.bill.errDue") : null,
  };
  async function save() {
    setTouched(true); setErr(null);
    if (Object.values(errs).some(Boolean) || !d.unit) return;
    setBusy(true);
    try {
      await saveBill({ id: d.id, unit: d.unit.id, kind: d.kind, period: d.period.trim(), amount, due: d.due, reference: d.reference.trim(), note: d.note.trim() });
      onSaved(t(d.id ? "admin.bill.updated" : "admin.bill.added", { unit: d.unit.label }));
    } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  const show = (k: keyof typeof errs) => (touched ? errs[k] : null);
  return (
    <section className="card" style={{ maxWidth: 640 }} aria-label={t(d.id ? "admin.bill.editTitle" : "admin.bill.addTitle")}>
      <h2 style={{ fontSize: "1.25rem", marginTop: 0 }}>{t(d.id ? "admin.bill.editTitle" : "admin.bill.addTitle")}</h2>
      <label className="field">
        <span className="label">{t("admin.bill.colUnit")}</span>
        <input className="input" value={q} placeholder={t("admin.bill.unitHint")} aria-invalid={!!show("unit")} onChange={(e) => { setQ(e.target.value); setD({ ...d, unit: null }); }} />
        {show("unit") && <span className="error">{show("unit")}</span>}
      </label>
      {hits.length > 0 && !d.unit && (
        <div className="list" style={{ marginTop: -6, marginBottom: 12 }} role="listbox" aria-label={t("admin.bill.colUnit")}>
          {hits.map((u) => (
            <button key={u.id} type="button" role="option" aria-selected={false} className="list-row" style={{ width: "100%", textAlign: "left" }} onClick={() => { setD({ ...d, unit: u }); setQ(u.label); setHits([]); }}>
              <span className="grow"><strong>{u.label}</strong><span className="small muted" style={{ display: "block" }}>{u.area_name} · {u.owners === 0 ? t("admin.bill.noOwner") : t("admin.bill.owners", { n: u.owners })}</span></span>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span className="label">{t("admin.bill.colBill")}</span>
        <select className="input" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as BillKind })}>
          {BILL_KINDS.map((k) => <option key={k} value={k}>{t(`bill.kind.${k}` as StringKey)}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="label">{t("admin.bill.period")}</span>
        <input className="input" value={d.period} maxLength={60} placeholder={t("admin.bill.periodHint")} aria-invalid={!!show("period")} onChange={(e) => setD({ ...d, period: e.target.value })} />
        {show("period") && <span className="error">{show("period")}</span>}
      </label>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="field grow">
          <span className="label">{t("admin.bill.amountRm")}</span>
          <input className="input" inputMode="decimal" value={d.amount} aria-invalid={!!show("amount")} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^0-9.]/g, "") })} />
          {show("amount") && <span className="error">{show("amount")}</span>}
        </label>
        <label className="field grow">
          <span className="label">{t("admin.bill.due")}</span>
          <input className="input" type="date" value={d.due} aria-invalid={!!show("due")} onChange={(e) => setD({ ...d, due: e.target.value })} />
          {show("due") && <span className="error">{show("due")}</span>}
        </label>
      </div>
      <label className="field"><span className="label">{t("admin.bill.reference")} <span className="muted">({t("common.optional")})</span></span>
        <input className="input" value={d.reference} maxLength={60} onChange={(e) => setD({ ...d, reference: e.target.value })} /></label>
      <label className="field"><span className="label">{t("admin.bill.note")} <span className="muted">({t("common.optional")})</span></span>
        <input className="input" value={d.note} maxLength={300} placeholder={t("admin.bill.noteHint")} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
      {err && <Banner kind="error">{err}</Banner>}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t("common.loading") : t("common.save")}</button>
        <button className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
      </div>
    </section>
  );
}

function CsvImport({ onClose, onImported }: { onClose: () => void; onImported: (n: number) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<CsvBill[] | null>(null);
  const [preview, setPreview] = useState<{ rows: ImportRow[]; errors: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    setErr(null); setPreview(null); setRows(null);
    if (file.size > 1024 * 1024) { setErr(t("admin.bill.csvBig")); return; }
    const { rows: r, missing } = csvToBills(await file.text());
    if (missing.length) { setErr(t("admin.bill.csvMissing", { cols: missing.join(", ") })); return; }
    if (r.length === 0) { setErr(t("admin.bill.csvEmpty")); return; }
    if (r.length > 500) { setErr(t("admin.bill.csvMany")); return; }
    setRows(r); setBusy(true);
    try { setPreview(await importBills(r, false)); } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  async function commit() {
    if (!rows) return;
    setBusy(true); setErr(null);
    try { const r = await importBills(rows, true); if (r.errors) setPreview(r); else onImported(r.inserted); } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  return (
    <section className="card" aria-label={t("admin.bill.import")}>
      <h2 style={{ fontSize: "1.25rem", marginTop: 0 }}>{t("admin.bill.import")}</h2>
      <p className="small" style={{ marginTop: 0 }}>{t("admin.bill.csvLead")}</p>
      <pre className="small" style={{ background: "var(--color-cream)", padding: 10, borderRadius: 8, overflowX: "auto" }}>{CSV_COLUMNS.join(",")}{"\n"}Elmina Green · No. 4,Maintenance fee,Oct-Dec 2026,450.00,2026-12-31,INV-2026-0012</pre>
      <p className="small muted">{t("admin.bill.csvTypes")}</p>
      <button className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()}>{t("admin.bill.csvChoose")}</button>
      <input ref={fileRef} type="file" hidden accept=".csv,text/csv" aria-label={t("admin.bill.csvChoose")} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
      {busy && <Spinner />}
      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{err}</Banner></div>}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <Banner kind={preview.errors ? "warn" : "success"}>{preview.errors ? t("admin.bill.csvHasErrors", { n: preview.errors, total: preview.rows.length }) : t("admin.bill.csvReady", { n: preview.rows.length })}</Banner>
          <div style={{ overflowX: "auto", marginTop: 8, maxHeight: 420, overflowY: "auto" }}>
            <table className="table">
              <thead><tr><th>{t("admin.bill.csvLine")}</th><th>{t("admin.bill.colUnit")}</th><th>{t("admin.bill.colBill")}</th><th>{t("admin.bill.colAmount")}</th><th>{t("admin.bill.due")}</th><th>{t("admin.bill.csvCheck")}</th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} style={r.errors.length ? { background: "var(--color-tint-red)" } : undefined}>
                    <td>{r.row + 1}</td>
                    <td>{r.unit ?? rows?.[r.row - 1]?.unit}</td>
                    <td>{r.type ? t(`bill.kind.${r.type}` as StringKey) : rows?.[r.row - 1]?.type}<div className="small muted">{r.period}</div></td>
                    <td>{r.amount != null ? money(Number(r.amount)) : rows?.[r.row - 1]?.amount}</td>
                    <td>{r.due_date ?? rows?.[r.row - 1]?.due_date}</td>
                    <td>{r.errors.length === 0 ? <span className="chip green">{t("admin.bill.csvOk")}</span> : r.errors.map((e) => <div key={e} className="small" style={{ color: "var(--color-urgent)", fontWeight: 700 }}>{t(`admin.bill.csvErr.${e}` as StringKey)}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={busy || preview.errors > 0} onClick={commit}>{t("admin.bill.csvImportN", { n: preview.rows.length })}</button>
            <button className="btn btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
          </div>
        </div>
      )}
      {!preview && <button className="btn btn-ghost btn-small" style={{ marginLeft: 8 }} onClick={onClose}>{t("common.close")}</button>}
    </section>
  );
}
