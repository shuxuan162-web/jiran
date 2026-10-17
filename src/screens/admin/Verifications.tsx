import { useCallback, useEffect, useState } from "react";
import { supabase, OWNERSHIP_BUCKET } from "../../lib/supabase";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { maskId } from "../../lib/validation";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner } from "../../components/ui/parts";

interface Row {
  id: string; user_id: string; unit_id: string; status: string; doc_paths: string[]; reason: string | null;
  submitted_at: string; decided_at: string | null;
}
interface Person { user_id: string; full_name: string; email: string; id_type: string | null; id_last4: string | null; }

export default function Verifications() {
  const { t } = useI18n();
  useTitle(t("admin.ver.title"));
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [nicks, setNicks] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<StringKey | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const q = supabase.from("ownership_verifications").select("*").order("submitted_at", { ascending: tab === "pending" });
    const { data, error } = tab === "pending" ? await q.in("status", ["submitted", "under_review"]) : await q.in("status", ["verified", "rejected"]).limit(50);
    if (error) { setErr("err.network"); setRows([]); return; }
    const list = data as Row[];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    const unitIds = [...new Set(list.map((r) => r.unit_id))];
    if (ids.length) {
      const [pp, pr, un] = await Promise.all([
        supabase.from("profiles_private").select("user_id,full_name,email,id_type,id_last4").in("user_id", ids),
        supabase.from("profiles").select("id,nickname").in("id", ids),
        supabase.from("units").select("id,label").in("id", unitIds),
      ]);
      setPeople(Object.fromEntries(((pp.data as Person[]) ?? []).map((p) => [p.user_id, p])));
      setNicks(Object.fromEntries(((pr.data as { id: string; nickname: string }[]) ?? []).map((p) => [p.id, p.nickname])));
      setUnits(Object.fromEntries(((un.data as { id: string; label: string }[]) ?? []).map((u) => [u.id, u.label])));
    }
  }, [tab]);

  useEffect(() => { setRows(null); void load(); }, [load]);

  async function view(path: string) {
    // Short-lived signed URL: the private file is never public
    const { data, error } = await supabase.storage.from(OWNERSHIP_BUCKET).createSignedUrl(path, 60);
    if (error || !data) { setErr(errorKey(error)); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setErr(null);
    const { error } = await supabase.rpc("decide_verification", { p_id: id, p_approve: approve, p_reason: approve ? null : reason });
    setBusy(null);
    if (error) { setErr(errorKey(error)); return; }
    setRejecting(null);
    setReason("");
    void load();
  }

  return (
    <>
      <h1>{t("admin.ver.title")}</h1>
      <div className="tabs" role="group">
        <button aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>{t("admin.ver.pending")}</button>
        <button aria-pressed={tab === "decided"} onClick={() => setTab("decided")}>{t("admin.ver.decided")}</button>
      </div>
      {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t("admin.ver.empty")}</div> : (
        <table className="table">
          <thead>
            <tr><th>{t("admin.ver.resident")}</th><th>{t("admin.ver.unit")}</th><th>{t("admin.ver.id")}</th>
              <th>{t("admin.ver.submitted")}</th><th>{t("admin.ver.docs")}</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = people[r.user_id];
              return (
                <tr key={r.id}>
                  <td><strong>{p?.full_name}</strong><div className="small muted">{nicks[r.user_id]} · {p?.email}</div></td>
                  <td>{units[r.unit_id]}</td>
                  <td>{p?.id_type?.toUpperCase()} {maskId(p?.id_last4)}</td>
                  <td>{new Date(r.submitted_at).toLocaleString()}</td>
                  <td>
                    {r.doc_paths.length === 0 ? <span className="chip red">{t("admin.ver.noDocs")}</span>
                      : r.doc_paths.map((d) => <button key={d} className="btn btn-ghost btn-small" onClick={() => view(d)}>{t("admin.ver.view")}</button>)}
                  </td>
                  <td style={{ minWidth: 260 }}>
                    {tab === "decided" ? (
                      <span className={`chip ${r.status === "verified" ? "green" : "red"}`}>{r.status === "verified" ? t("verify.verified") : t("verify.rejected")}</span>
                    ) : rejecting === r.id ? (
                      <div className="stack">
                        <label className="field" style={{ marginBottom: 0 }}>
                          <span className="label">{t("admin.ver.reason")}</span>
                          <textarea className="textarea" value={reason} placeholder={t("admin.ver.reasonPh")} onChange={(e) => setReason(e.target.value)} />
                        </label>
                        <div className="row">
                          <button className="btn btn-danger btn-small" disabled={!reason.trim() || busy === r.id} onClick={() => decide(r.id, false)}>{t("admin.ver.confirmReject")}</button>
                          <button className="btn btn-ghost btn-small" onClick={() => setRejecting(null)}>{t("common.cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="row">
                        <button className="btn btn-success btn-small" disabled={busy === r.id} onClick={() => decide(r.id, true)}>{t("admin.ver.approve")}</button>
                        <button className="btn btn-ghost btn-small" onClick={() => { setRejecting(r.id); setReason(""); }}>{t("admin.ver.reject")}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
