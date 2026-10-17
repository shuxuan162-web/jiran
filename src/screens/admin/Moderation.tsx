import { useCallback, useEffect, useState } from "react";
import { moderate, moderationQueue, warnUser, type ModItem } from "../../features/info/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { timeAgo } from "../../lib/info";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner } from "../../components/ui/parts";

/** Held posts and reported posts/replies. Every action is logged; authors are told when something is removed. */
export default function Moderation() {
  const { t } = useI18n();
  useTitle(t("admin.nav.moderation"));
  const [rows, setRows] = useState<ModItem[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(() => { moderationQueue().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); const id = window.setInterval(load, 20000); return () => window.clearInterval(id); }, [load]);

  async function act(m: ModItem, action: "hide" | "release" | "dismiss") {
    try { await moderate(m.kind, m.id, action, notes[m.id] ?? ""); setMsg({ kind: "success", text: t(`admin.m.done.${action}` as StringKey) }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }
  async function warn(m: ModItem) {
    const reason = (notes[m.id] ?? "").trim();
    if (!m.author_id) return;
    if (reason.length < 3) { setMsg({ kind: "error", text: t("admin.m.warnNeedsNote") }); return; }
    try { await warnUser(m.author_id, reason); setMsg({ kind: "success", text: t("admin.m.warned", { name: m.author_nickname ?? "—" }) }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1>{t("admin.nav.moderation")}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{t("admin.m.lead")}</p>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t("admin.m.empty")}</div> : rows.map((m) => (
        <section key={`${m.kind}-${m.id}`} className="card">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip">{t(m.kind === "post" ? "admin.m.post" : "admin.m.reply")}</span>
            {m.state === "held" && <span className="chip lvl-medium">{t("post.held")}{m.held_reason ? ` · ${t(`admin.m.why.${m.held_reason}` as StringKey)}` : ""}</span>}
            {m.open_reports > 0 && <span className="chip red">{t("admin.m.reports", { n: m.open_reports })}</span>}
            {m.author_warned && <span className="chip">{t("admin.m.warnedChip")}</span>}
            <span className="small muted" style={{ marginLeft: "auto" }}>{timeAgo(m.created_at)}</span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{m.body}</p>
          <p className="small muted" style={{ margin: 0 }}>
            {t("admin.m.by", { name: m.author_nickname ?? "—" })}{m.anonymous ? ` (${t("admin.m.anonToResidents")})` : ""}
            {m.reasons.length > 0 && <> · {t("admin.m.reasons")}: {[...new Set(m.reasons)].map((r) => t(`post.reason.${r}` as StringKey)).join(", ")}</>}
          </p>
          {m.notes.length > 0 && <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{m.notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>}
          <input className="input" style={{ marginTop: 10 }} placeholder={t("admin.m.note")} value={notes[m.id] ?? ""}
            onChange={(e) => setNotes((x) => ({ ...x, [m.id]: e.target.value }))} />
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {m.kind === "post" && m.state === "held" && <button className="btn btn-primary btn-small" onClick={() => act(m, "release")}>{t("admin.m.release")}</button>}
            {m.state !== "hidden" && <button className="btn btn-danger btn-small" onClick={() => act(m, "hide")}>{t("admin.m.hide")}</button>}
            {m.open_reports > 0 && <button className="btn btn-ghost btn-small" onClick={() => act(m, "dismiss")}>{t("admin.m.dismiss")}</button>}
            {m.author_id && !m.author_warned && <button className="btn btn-ghost btn-small" onClick={() => warn(m)}>{t("admin.m.warn")}</button>}
          </div>
        </section>
      ))}
    </div>
  );
}
