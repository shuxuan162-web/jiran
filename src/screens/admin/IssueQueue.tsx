import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { issueFeed, loadCategories, updateIssueStatus, type Category, type IssueRow } from "../../features/issues/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { OPEN_STATUSES, statusKey, type IssueStatus } from "../../lib/scoring/labels";
import { Banner, Spinner } from "../../components/ui/parts";
import { CategoryName, PriorityLabel, StatusChip } from "../../components/issues";

const ALL_STATUSES: IssueStatus[] = ["submitted", "acknowledged", "assigned", "in_progress", "resolved", "rejected", "duplicate"];

/** Weighted parts of P, drawn as one bar (S/U/A/T), with the numbers as text beside it. */
function ScoreBar({ r }: { r: IssueRow }) {
  if (r.s == null) return <span className="muted">–</span>;
  const parts = [
    { v: 0.4 * (r.s ?? 0), c: "var(--color-urgent)" }, { v: 0.25 * (r.u ?? 0), c: "var(--color-orange)" },
    { v: 0.2 * (r.a ?? 0), c: "var(--color-amber)" }, { v: 0.15 * (r.t ?? 0), c: "#2E4A62" },
  ];
  return (
    <span className="score-bar" aria-hidden="true">
      {parts.map((x, i) => <span key={i} style={{ width: `${x.v}%`, background: x.c }} />)}
    </span>
  );
}

export default function IssueQueue() {
  const { t } = useI18n();
  useTitle(t("admin.q.title"));
  const [rows, setRows] = useState<IssueRow[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [fStatus, setFStatus] = useState<"open" | "closed" | "all" | IssueStatus>("open");
  const [fCat, setFCat] = useState("");
  const [fArea, setFArea] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [newStatus, setNewStatus] = useState<IssueStatus>("acknowledged");
  const [team, setTeam] = useState("");
  const [note, setNote] = useState("");
  const [mergeRef, setMergeRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<StringKey | null>(null);

  const load = useCallback(async () => {
    try { setRows(await issueFeed("all", 200)); } catch { setErr("err.network"); setRows((r) => r ?? []); }
  }, []);
  useEffect(() => {
    void load();
    loadCategories().then(setCats).catch(() => {});
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  const areas = useMemo(() => [...new Set((rows ?? []).map((r) => r.area_name).filter(Boolean))].sort() as string[], [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) =>
    (fStatus === "all" || (fStatus === "open" ? OPEN_STATUSES.includes(r.status) : fStatus === "closed" ? !OPEN_STATUSES.includes(r.status) : r.status === fStatus))
    && (!fCat || r.category === fCat) && (!fArea || r.area_name === fArea)), [rows, fStatus, fCat, fArea]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((r) => sel.has(r.id));

  async function apply() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      let mergeInto: string | undefined;
      if (newStatus === "duplicate") {
        mergeInto = rows?.find((r) => r.ref_no.toLowerCase() === mergeRef.trim().toLowerCase())?.id;
        if (!mergeInto) throw new Error("merge_target_required");
      }
      const n = await updateIssueStatus([...sel], newStatus, note, team, mergeInto);
      setMsg(t("admin.q.done", { n }));
      setSel(new Set()); setNote(""); setTeam(""); setMergeRef("");
      await load();
    } catch (e) { setErr(errorKey(e)); }
    setBusy(false);
  }

  const fmtAge = (iso: string) => {
    const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
    return h < 24 ? `${Math.max(1, Math.round(h))} h` : `${Math.floor(h / 24)} d`;
  };

  return (
    <>
      <h1>{t("admin.q.title")}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{t("admin.q.lead")}</p>

      <div className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <label className="field" style={{ margin: 0, minWidth: 180 }}>
          <span className="label">{t("admin.q.status")}</span>
          <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)}>
            <option value="open">{t("admin.q.open")}</option>
            <option value="closed">{t("admin.q.closed")}</option>
            <option value="all">{t("admin.q.all")}</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{t(statusKey(s))}</option>)}
          </select>
        </label>
        <label className="field" style={{ margin: 0, minWidth: 200 }}>
          <span className="label">{t("admin.q.category")}</span>
          <select className="select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">{t("admin.q.all")}</option>
            {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name_en}</option>)}
          </select>
        </label>
        <label className="field" style={{ margin: 0, minWidth: 200 }}>
          <span className="label">{t("admin.q.area")}</span>
          <select className="select" value={fArea} onChange={(e) => setFArea(e.target.value)}>
            <option value="">{t("admin.q.all")}</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {sel.size > 0 && (
        <section className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--color-red)" }} aria-label={t("admin.q.selected", { n: sel.size })}>
          <strong>{t("admin.q.selected", { n: sel.size })}</strong>
          <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 8, alignItems: "flex-end" }}>
            <label className="field" style={{ margin: 0, minWidth: 170 }}>
              <span className="label">{t("admin.q.setStatus")}</span>
              <select className="select" value={newStatus} onChange={(e) => setNewStatus(e.target.value as IssueStatus)}>
                {ALL_STATUSES.filter((s) => s !== "submitted").map((s) => <option key={s} value={s}>{t(statusKey(s))}</option>)}
              </select>
            </label>
            {newStatus === "duplicate" ? (
              <label className="field" style={{ margin: 0, minWidth: 200 }}>
                <span className="label">{t("admin.q.mergeInto")}</span>
                <input className="input" value={mergeRef} placeholder="JRN-2610-0001" onChange={(e) => setMergeRef(e.target.value)} />
              </label>
            ) : (
              <label className="field" style={{ margin: 0, minWidth: 200 }}>
                <span className="label">{t("admin.q.team")}</span>
                <input className="input" value={team} placeholder="Drainage team" onChange={(e) => setTeam(e.target.value)} />
              </label>
            )}
            <label className="field grow" style={{ margin: 0, minWidth: 240 }}>
              <span className="label">{t("admin.q.note")}</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </label>
            <button className="btn btn-primary btn-small" disabled={busy} onClick={apply}>{t("admin.q.apply", { n: sel.size })}</button>
          </div>
        </section>
      )}
      {msg && <div style={{ marginBottom: 12 }}><Banner kind="success">{msg}</Banner></div>}
      {err && <div style={{ marginBottom: 12 }}><Banner kind="error">{t(err)}</Banner></div>}

      {!rows ? <Spinner /> : shown.length === 0 ? <div className="card muted">{t("admin.q.empty")}</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all shown" checked={allOn}
                  onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.id)))} /></th>
                <th>#</th><th>{t("admin.q.score")}</th><th>Issue</th><th>{t("admin.q.area")}</th><th>▲</th><th>{t("admin.q.status")}</th><th>Age</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={sel.has(r.id) ? "sel" : ""}>
                  <td><input type="checkbox" aria-label={`Select ${r.ref_no}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td>{r.queue_rank ?? "–"}</td>
                  <td style={{ minWidth: 170 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{r.p != null && r.queue_rank != null ? Number(r.p).toFixed(1) : "–"}</strong>
                      {r.queue_rank != null && <PriorityLabel p={r.p} />}
                    </div>
                    {r.queue_rank != null && (
                      <>
                        <ScoreBar r={r} />
                        <div className="small muted">{t("admin.q.breakdown", { s: Math.round(r.s ?? 0), u: Math.round(r.u ?? 0), a: Math.round(r.a ?? 0), t: Math.round(r.t ?? 0) })}</div>
                      </>
                    )}
                  </td>
                  <td style={{ maxWidth: 360 }}>
                    <Link to={`/admin/issues/${r.id}`} style={{ fontWeight: 800 }}>{r.ref_no}</Link>{" "}
                    <span className="small">· <CategoryName slug={r.category} /></span>
                    <div className="small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.description}</div>
                    <div className="small muted">{r.reporter_nickname ?? "Anonymous"} · S {r.severity} · {r.affected_units} homes</div>
                  </td>
                  <td>{r.area_name}</td>
                  <td>{r.upvote_count}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td>{fmtAge(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
