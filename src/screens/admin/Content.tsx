import { useCallback, useEffect, useState } from "react";
import { listEnquiries, updateEnquiry, type Enquiry } from "../../features/showroom/api";
import { propertyBySlug } from "../../data/properties";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner } from "../../components/ui/parts";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Property enquiries and viewing requests from residents, for the property team to call back. */
export default function Content() {
  const { t } = useI18n();
  useTitle(t("admin.nav.content"));
  const [rows, setRows] = useState<Enquiry[] | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(() => { listEnquiries().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function set(e: Enquiry, status: Enquiry["status"]) {
    try { await updateEnquiry(e.id, status, notes[e.id] ?? ""); setMsg({ kind: "success", text: t(`admin.c.done.${status}` as StringKey) }); load(); }
    catch (x) { setMsg({ kind: "error", text: t(errorKey(x)) }); }
  }

  const shown = (rows ?? []).filter((e) => filter === "all" || e.status !== "closed");
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="row" style={{ marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.c.title")}</h1>
        <div className="chip-row">
          {(["open", "all"] as const).map((f) => <button key={f} className="chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`admin.c.f.${f}` as StringKey)}</button>)}
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("admin.c.lead")}</p>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {!rows ? <Spinner /> : shown.length === 0 ? <div className="card muted">{t("admin.c.empty")}</div> : (
        <table className="table">
          <thead><tr><th>{t("admin.c.colWhen")}</th><th>{t("admin.c.colProperty")}</th><th>{t("admin.c.colContact")}</th><th>{t("admin.c.colStatus")}</th><th /></tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="small">{fmt(e.created_at)}<br /><span className="muted">ENQ-{e.id.replace(/-/g, "").slice(0, 6).toUpperCase()}</span></td>
                <td><strong>{propertyBySlug(e.property_slug)?.name ?? e.property_slug}</strong>
                  <div className="small muted">{t(e.kind === "viewing" ? "enq.viewing" : "enq.enquiry")}</div></td>
                <td className="small"><strong>{e.full_name}</strong><br /><a href={`tel:${e.phone}`}>{e.phone}</a><br /><a href={`mailto:${e.email}`}>{e.email}</a></td>
                <td><span className={`chip ${e.status === "new" ? "red" : e.status === "contacted" ? "blue" : "green"}`}>{t(`enq.status.${e.status}` as StringKey)}</span>
                  {e.staff_note && <div className="small muted" style={{ marginTop: 4 }}>{e.staff_note}</div>}</td>
                <td>
                  <input className="input" style={{ minWidth: 160, marginBottom: 6 }} placeholder={t("admin.c.note")} value={notes[e.id] ?? ""}
                    onChange={(x) => setNotes((n) => ({ ...n, [e.id]: x.target.value }))} />
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    {e.status === "new" && <button className="btn btn-primary btn-small" onClick={() => set(e, "contacted")}>{t("admin.c.contacted")}</button>}
                    {e.status !== "closed" && <button className="btn btn-ghost btn-small" onClick={() => set(e, "closed")}>{t("admin.c.close")}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>{t("admin.c.privacy")}</p>
    </div>
  );
}
