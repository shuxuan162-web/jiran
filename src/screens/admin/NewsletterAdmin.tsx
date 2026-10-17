import { useCallback, useEffect, useState } from "react";
import { draftNewsletter, newsletters, publishNewsletter, updateNewsletter, type Newsletter } from "../../features/info/api";
import { useI18n } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, Spinner } from "../../components/ui/parts";
import { NewsletterBody } from "../resident/info/Newsletter";

/** Weekly newsletter: build the draft from this week's real activity, edit the intro, review, send. */
export default function NewsletterAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.newsletter"));
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async (pick?: string) => {
    const l = await newsletters().catch(() => [] as Newsletter[]);
    setList(l);
    const n = l.find((x) => x.id === pick) ?? l.find((x) => x.status === "draft") ?? l[0];
    if (n) { setSel(n.id); setTitle(n.title); setIntro(n.intro ?? ""); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const n = list?.find((x) => x.id === sel) ?? null;

  async function draft() {
    setBusy(true); setMsg(null);
    try { const id = await draftNewsletter(); await load(id); setMsg({ kind: "success", text: t("admin.n.drafted") }); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function save() {
    if (!n) return;
    setBusy(true);
    try { await updateNewsletter(n.id, title, intro); await load(n.id); setMsg({ kind: "success", text: t("admin.n.saved") }); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function publish() {
    if (!n) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      await updateNewsletter(n.id, title, intro);
      const c = await publishNewsletter(n.id);
      await load(n.id);
      setMsg({ kind: "success", text: t("admin.n.sent", { n: c }) });
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false); setConfirming(false);
  }

  return (
    <div className="admin-two">
      <section style={{ alignSelf: "start" }}>
        <h1>{t("admin.nav.newsletter")}</h1>
        <p className="muted" style={{ marginTop: -8 }}>{t("admin.n.lead")}</p>
        <button className="btn btn-primary btn-small" disabled={busy} onClick={draft}>{t("admin.n.draft")}</button>
        {msg && <div style={{ marginTop: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
        <h2 style={{ fontSize: "1.125rem", marginTop: 20 }}>{t("admin.n.issues")}</h2>
        {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("nl.none")}</div> : (
          <div className="list">
            {list.map((x) => (
              <button key={x.id} className={`list-row${x.id === sel ? " selected" : ""}`} onClick={() => { setSel(x.id); setTitle(x.title); setIntro(x.intro ?? ""); setConfirming(false); }}>
                <span className="grow" style={{ textAlign: "left" }}>
                  <strong style={{ display: "block" }}>{x.title}</strong>
                  <span className="small muted">{t("nl.week", { date: new Date(x.week_start).toLocaleDateString(undefined, { day: "numeric", month: "short" }) })}
                    {x.status === "published" ? ` · ${t("admin.n.reads", { r: x.readers ?? 0, a: x.audience ?? 0 })}` : ""}</span>
                </span>
                <span className={`chip ${x.status === "published" ? "green" : "lvl-medium"}`}>{t(x.status === "published" ? "admin.n.published" : "admin.n.draftChip")}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card newsletter" style={{ alignSelf: "start" }}>
        {!n ? <p className="muted">{t("admin.n.pick")}</p> : (
          <>
            {n.status === "draft" ? (
              <>
                <Field label={t("admin.n.titleLabel")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
                <label className="field">
                  <span className="label">{t("admin.n.intro")}</span>
                  <textarea className="textarea" style={{ minHeight: 80 }} value={intro} maxLength={1000} onChange={(e) => setIntro(e.target.value)} />
                </label>
                <p className="small muted">{t("admin.n.preview")}</p>
              </>
            ) : <h2 style={{ fontSize: "1.375rem" }}>{n.title}</h2>}
            <NewsletterBody n={{ ...n, intro: n.status === "draft" ? intro : n.intro }} />
            {n.status === "draft" && (
              <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-small" disabled={busy} onClick={save}>{t("common.save")}</button>
                <button className={`btn btn-small ${confirming ? "btn-danger" : "btn-primary"}`} disabled={busy || title.trim().length < 4} onClick={publish}>
                  {confirming ? t("admin.n.confirm", { n: n.audience ?? 0 }) : t("admin.n.send")}
                </button>
                {confirming && <button className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
