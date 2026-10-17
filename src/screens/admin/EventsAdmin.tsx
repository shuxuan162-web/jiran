import { useCallback, useEffect, useState } from "react";
import { cancelEvent, decideEvent, eventCode, eventsList, type EventRow } from "../../features/info/api";
import { useI18n } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner } from "../../components/ui/parts";
import { EventForm, EventStateChip } from "../resident/events/Events";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Approvals for residents' events, every event with its numbers and check-in code, and official events. */
export default function EventsAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.events"));
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(() => { eventsList("all").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(e: EventRow, approve: boolean) {
    const reason = reasons[e.id]?.trim() ?? "";
    if (!approve && !reason) { setMsg({ kind: "error", text: t("err.reason_required") }); return; }
    try { await decideEvent(e.id, approve, reason); setMsg({ kind: "success", text: t(approve ? "admin.e.approved" : "admin.e.rejected", { title: e.title }) }); load(); }
    catch (x) { setMsg({ kind: "error", text: t(errorKey(x)) }); }
  }
  async function showCode(e: EventRow) {
    const c = await eventCode(e.id).catch(() => null);
    if (c) setCodes((x) => ({ ...x, [e.id]: c }));
  }
  async function cancel(e: EventRow) {
    const reason = window.prompt(t("event.cancelQ"));
    if (reason === null) return;
    try { await cancelEvent(e.id, reason); load(); } catch (x) { setMsg({ kind: "error", text: t(errorKey(x)) }); }
  }

  const pending = (rows ?? []).filter((e) => e.approval_state === "pending");
  const others = (rows ?? []).filter((e) => e.approval_state !== "pending");
  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.nav.events")}</h1>
        <button className="btn btn-primary btn-small" onClick={() => setCreating((x) => !x)}>{creating ? t("common.close") : `+ ${t("admin.e.create")}`}</button>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {creating && (
        <section className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
          <EventForm staff onDone={() => { setCreating(false); setMsg({ kind: "success", text: t("admin.e.createdOfficial") }); load(); }} />
        </section>
      )}

      <h2 style={{ fontSize: "1.25rem" }}>{t("admin.e.pending", { n: pending.length })}</h2>
      {!rows ? <Spinner /> : pending.length === 0 ? <div className="card muted">{t("admin.e.noPending")}</div> : pending.map((e) => (
        <section key={e.id} className="card">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><EventStateChip e={e} /><strong>{e.title}</strong></div>
          <p className="small muted" style={{ margin: "4px 0" }}>{fmt(e.starts_at)} · {e.location_name} · {t("event.hostedBy", { name: e.host_nickname ?? "—" })}{e.capacity ? ` · ${t("admin.e.cap", { n: e.capacity })}` : ""}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-small" onClick={() => decide(e, true)}>{t("admin.e.approve")}</button>
            <input className="input" style={{ maxWidth: 320 }} placeholder={t("admin.e.reason")} value={reasons[e.id] ?? ""}
              onChange={(x) => setReasons((r) => ({ ...r, [e.id]: x.target.value }))} />
            <button className="btn btn-ghost btn-small" onClick={() => decide(e, false)}>{t("admin.e.reject")}</button>
          </div>
        </section>
      ))}

      <h2 style={{ fontSize: "1.25rem", marginTop: 24 }}>{t("admin.e.all")}</h2>
      {rows && (
        <table className="table">
          <thead><tr><th>{t("admin.e.colEvent")}</th><th>{t("admin.e.colWhen")}</th><th>{t("admin.e.colPeople")}</th><th>{t("admin.e.colCode")}</th><th /></tr></thead>
          <tbody>
            {others.map((e) => (
              <tr key={e.id}>
                <td><div style={{ marginBottom: 4 }}><EventStateChip e={e} /></div><strong>{e.title}</strong><div className="small muted">{e.location_name} · {e.host_nickname}</div></td>
                <td className="small">{fmt(e.starts_at)}</td>
                <td className="small">{t("admin.e.people", { going: e.going_count, interested: e.interested_count, came: e.checked_in_count })}</td>
                <td>{e.approval_state === "approved" && (codes[e.id] ? <strong style={{ letterSpacing: 2 }}>{codes[e.id]}</strong> :
                  <button className="link-btn" onClick={() => showCode(e)}>{t("admin.e.showCode")}</button>)}</td>
                <td>{e.approval_state === "approved" && new Date(e.ends_at) > new Date() && <button className="link-btn" onClick={() => cancel(e)}>{t("event.cancel")}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
