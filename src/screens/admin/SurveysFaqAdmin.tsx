import { useCallback, useEffect, useState } from "react";
import { feedbackList, type FeedbackRow } from "../../features/services/api";
import {
  FAQ_CATEGORIES, adminSurveys, loadFaqs, saveFaq, saveSurvey, setSurveyStatus, surveyResults, surveyWithQuestions,
  type AdminSurvey, type FaqCategory, type FaqRow, type QKind, type SurveyQuestion, type SurveyResults,
} from "../../features/surveys/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { LoadError } from "../../components/Status";
import { Banner, Spinner } from "../../components/ui/parts";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Tab = "surveys" | "faq" | "feedback";

/** Surveys and FAQ: write and open surveys, read results; edit the FAQ residents search; read feedback. */
export default function SurveysFaqAdmin() {
  const { t } = useI18n();
  useTitle(t("admin.nav.surveys"));
  const [tab, setTab] = useState<Tab>("surveys");
  return (
    <div style={{ maxWidth: 1000 }}>
      <h1>{t("admin.nav.surveys")}</h1>
      <div className="chip-row" role="tablist" aria-label={t("admin.nav.surveys")} style={{ marginBottom: 16 }}>
        {(["surveys", "faq", "feedback"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className="chip-btn" aria-pressed={tab === k} onClick={() => setTab(k)}>{t(`admin.sf.tab.${k}` as StringKey)}</button>
        ))}
      </div>
      <div role="tabpanel">{tab === "surveys" ? <SurveysTab /> : tab === "faq" ? <FaqTab /> : <FeedbackTab />}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SurveysTab() {
  const { t } = useI18n();
  const [list, setList] = useState<AdminSurvey[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [results, setResults] = useState<{ survey: AdminSurvey; data: SurveyResults } | null>(null);
  const load = useCallback(() => { setErr(null); adminSurveys().then(setList).catch((e) => setErr(t(errorKey(e)))); }, [t]);
  useEffect(() => { load(); }, [load]);

  async function status(s: AdminSurvey, to: "open" | "closed") {
    if (to === "open" && !window.confirm(t("admin.sv.openConfirm"))) return;
    setMsg(null);
    try { await setSurveyStatus(s.id, to); setMsg({ kind: "success", text: t(to === "open" ? "admin.sv.opened" : "admin.sv.closedDone", { title: s.title }) }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }
  async function showResults(s: AdminSurvey) {
    setMsg(null);
    try { setResults({ survey: s, data: await surveyResults(s.id) }); } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }

  if (editing) return <SurveyEditor id={editing.id} onDone={(text) => { setEditing(null); if (text) setMsg({ kind: "success", text }); load(); }} />;
  if (results) return <Results survey={results.survey} data={results.data} onBack={() => setResults(null)} />;
  return (
    <>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <p className="muted grow" style={{ margin: 0 }}>{t("admin.sv.lead")}</p>
        <button className="btn btn-primary btn-small" onClick={() => setEditing({ id: null })}>+ {t("admin.sv.new")}</button>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {err ? <LoadError text={err} onRetry={load} /> : !list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("admin.sv.empty")}</div> : list.map((s) => (
        <section key={s.id} className="card">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className={`chip ${s.status === "open" ? "green" : s.status === "draft" ? "lvl-medium" : ""}`}>{t(`admin.sv.status.${s.status}` as StringKey)}</span>
            <strong className="grow">{s.title}</strong>
            <span className="small muted">{t("admin.sv.counts", { q: s.questions, r: s.responses })}</span>
          </div>
          {s.intro && <p className="small" style={{ margin: "6px 0 0" }}>{s.intro}</p>}
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {s.status === "draft" && <button className="btn btn-ghost btn-small" onClick={() => setEditing({ id: s.id })}>{t("admin.sv.edit")}</button>}
            {s.status === "draft" && <button className="btn btn-primary btn-small" onClick={() => status(s, "open")}>{t("admin.sv.open")}</button>}
            {s.status === "open" && <button className="btn btn-ghost btn-small" onClick={() => status(s, "closed")}>{t("admin.sv.close")}</button>}
            {s.status !== "draft" && <button className="btn btn-ghost btn-small" onClick={() => showResults(s)}>{t("admin.sv.results")}</button>}
          </div>
        </section>
      ))}
    </>
  );
}

function SurveyEditor({ id, onDone }: { id: string | null; onDone: (text?: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [qs, setQs] = useState<SurveyQuestion[]>([{ kind: "rating", prompt: "", options: [], required: true }]);
  const [loading, setLoading] = useState(!!id);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    surveyWithQuestions(id).then(({ survey, questions }) => {
      setTitle(survey?.title ?? ""); setIntro(survey?.intro ?? "");
      setQs(questions.map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options ?? [], required: q.required })));
    }).catch((e) => setErr(t(errorKey(e)))).finally(() => setLoading(false));
  }, [id, t]);

  const qErr = (q: SurveyQuestion) => (q.prompt.trim().length < 3 ? t("admin.sv.errPrompt") : q.kind === "choice" && q.options.filter((o) => o.trim()).length < 2 ? t("admin.sv.errOptions") : null);
  const titleErr = title.trim().length < 3 ? t("admin.sv.errTitle") : null;
  const upd = (i: number, patch: Partial<SurveyQuestion>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  async function save() {
    setTouched(true); setErr(null);
    if (titleErr || qs.some(qErr)) return;
    setBusy(true);
    try {
      await saveSurvey(id, title.trim(), intro.trim(), qs.map((q) => ({ ...q, options: q.kind === "choice" ? q.options.map((o) => o.trim()).filter(Boolean) : [] })));
      onDone(t("admin.sv.saved"));
    } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  if (loading) return <Spinner />;
  return (
    <section className="card" aria-label={t(id ? "admin.sv.edit" : "admin.sv.new")}>
      <h2 style={{ fontSize: "1.25rem", marginTop: 0 }}>{t(id ? "admin.sv.edit" : "admin.sv.new")}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t("admin.sv.draftNote")}</p>
      <label className="field"><span className="label">{t("admin.sv.title")}</span>
        <input className="input" maxLength={100} value={title} aria-invalid={touched && !!titleErr} onChange={(e) => setTitle(e.target.value)} />
        {touched && titleErr && <span className="error">{titleErr}</span>}</label>
      <label className="field"><span className="label">{t("admin.sv.intro")} <span className="muted">({t("common.optional")})</span></span>
        <textarea className="textarea" maxLength={500} value={intro} onChange={(e) => setIntro(e.target.value)} /></label>
      {qs.map((q, i) => (
        <fieldset key={i} className="card" style={{ background: "var(--color-cream)" }}>
          <legend style={{ fontWeight: 800 }}>{t("admin.sv.questionN", { n: i + 1 })}</legend>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="input" style={{ width: "auto", minHeight: 48 }} aria-label={t("admin.sv.kind")} value={q.kind} onChange={(e) => upd(i, { kind: e.target.value as QKind })}>
              {(["rating", "choice", "text"] as const).map((k) => <option key={k} value={k}>{t(`admin.sv.kind.${k}` as StringKey)}</option>)}
            </select>
            <label className="row" style={{ gap: 6, minHeight: 48 }}><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { required: e.target.checked })} style={{ width: 24, height: 24 }} />{t("admin.sv.required")}</label>
            <span className="grow" />
            {i > 0 && <button className="btn btn-ghost btn-small" aria-label={t("admin.sv.moveUp", { n: i + 1 })} onClick={() => { const n = [...qs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setQs(n); }}>↑</button>}
            {qs.length > 1 && <button className="btn btn-ghost btn-small" onClick={() => setQs(qs.filter((_, j) => j !== i))}>{t("admin.sv.remove")}</button>}
          </div>
          <label className="field"><span className="label">{t("admin.sv.prompt")}</span>
            <input className="input" maxLength={200} value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} /></label>
          {q.kind === "choice" && (
            <label className="field"><span className="label">{t("admin.sv.options")}</span>
              <textarea className="textarea" value={q.options.join("\n")} onChange={(e) => upd(i, { options: e.target.value.split("\n").slice(0, 8) })} />
              <span className="hint">{t("admin.sv.optionsHint")}</span></label>
          )}
          {touched && qErr(q) && <span className="error">{qErr(q)}</span>}
        </fieldset>
      ))}
      {qs.length < 10 && <button className="btn btn-ghost btn-small" onClick={() => setQs([...qs, { kind: "rating", prompt: "", options: [], required: true }])}>+ {t("admin.sv.addQ")}</button>}
      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{err}</Banner></div>}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t("common.loading") : t("admin.sv.saveDraft")}</button>
        <button className="btn btn-ghost" onClick={() => onDone()}>{t("common.cancel")}</button>
      </div>
    </section>
  );
}

function Results({ survey, data, onBack }: { survey: AdminSurvey; data: SurveyResults; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <section>
      <button className="btn btn-ghost btn-small" onClick={onBack}>← {t("common.back")}</button>
      <h2>{survey.title}</h2>
      <p className="muted">{t("admin.sv.resultsLead", { n: data.responses })}</p>
      {data.questions.map((q) => {
        const total = Object.values(q.counts ?? {}).reduce((s, n) => s + n, 0) || 1;
        return (
          <section key={q.id} className="card">
            <strong style={{ display: "block" }}>{q.position}. {q.prompt}</strong>
            <span className="small muted">{t("admin.sv.answeredN", { n: q.answered })}{q.avg != null ? ` · ${t("admin.sv.avg", { n: q.avg })}` : ""}</span>
            {q.counts && (
              <table className="table" style={{ marginTop: 8, boxShadow: "none" }}>
                <tbody>
                  {Object.entries(q.counts).map(([k, n]) => (
                    <tr key={k}>
                      <td style={{ width: "40%" }}>{q.kind === "rating" ? t("fb.stars", { n: Number(k) }) : k}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div aria-hidden="true" style={{ height: 14, width: `${Math.round((n / total) * 100)}%`, minWidth: n ? 4 : 0, background: "#2a78d6", borderRadius: 4 }} />
                          <span className="small">{n} ({Math.round((n / total) * 100)}%)</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {q.texts && (q.texts.length === 0 ? <p className="small muted">{t("admin.sv.noText")}</p> : (
              <ul className="small" style={{ paddingLeft: 18, margin: "8px 0 0" }}>{q.texts.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
            ))}
          </section>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
type FaqDraft = { id: string | null; category: FaqCategory; question: string; answer: string; keywords: string; link_to: string; link_label: string; sort_order: number; active: boolean };

function FaqTab() {
  const { t } = useI18n();
  const [list, setList] = useState<FaqRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setErr(null); loadFaqs().then(setList).catch((e) => setErr(t(errorKey(e)))); }, [t]);
  useEffect(() => { load(); }, [load]);

  const toDraft = (f: FaqRow): FaqDraft => ({ id: f.id, category: f.category, question: f.question, answer: f.answer, keywords: f.keywords.join(", "),
    link_to: f.link_to ?? "", link_label: f.link_label ?? "", sort_order: f.sort_order, active: f.active });
  async function save(d: FaqDraft) {
    setBusy(true); setMsg(null);
    try {
      await saveFaq({ ...d, question: d.question.trim(), answer: d.answer.trim(), keywords: d.keywords.split(",").map((k) => k.trim()).filter(Boolean) });
      setDraft(null); setMsg({ kind: "success", text: t("admin.faq.saved") }); load();
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  const d = draft;
  const bad = d && (d.question.trim().length < 5 || d.answer.trim().length < 5 || (!!d.link_to.trim() !== !!d.link_label.trim()) || (!!d.link_to && !/^\/app\/[a-z0-9/_-]*$/.test(d.link_to)));
  return (
    <>
      <div className="row" style={{ gap: 12, marginBottom: 12 }}>
        <p className="muted grow" style={{ margin: 0 }}>{t("admin.faq.lead")}</p>
        <button className="btn btn-primary btn-small" onClick={() => setDraft({ id: null, category: "other", question: "", answer: "", keywords: "", link_to: "", link_label: "", sort_order: ((list?.length ?? 0) + 1) * 10, active: true })}>+ {t("admin.faq.add")}</button>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      {d && (
        <section className="card" aria-label={t(d.id ? "admin.faq.edit" : "admin.faq.add")}>
          <label className="field"><span className="label">{t("admin.faq.question")}</span>
            <input className="input" maxLength={200} value={d.question} onChange={(e) => setDraft({ ...d, question: e.target.value })} /></label>
          <label className="field"><span className="label">{t("admin.faq.answer")}</span>
            <textarea className="textarea" maxLength={2000} value={d.answer} onChange={(e) => setDraft({ ...d, answer: e.target.value })} /></label>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="field"><span className="label">{t("admin.faq.category")}</span>
              <select className="input" value={d.category} onChange={(e) => setDraft({ ...d, category: e.target.value as FaqCategory })}>
                {FAQ_CATEGORIES.map((c) => <option key={c} value={c}>{t(`admin.faq.cat.${c}` as StringKey)}</option>)}
              </select></label>
            <label className="field"><span className="label">{t("admin.faq.order")}</span>
              <input className="input" type="number" style={{ width: 110 }} value={d.sort_order} onChange={(e) => setDraft({ ...d, sort_order: Number(e.target.value) || 0 })} /></label>
          </div>
          <label className="field"><span className="label">{t("admin.faq.keywords")} <span className="muted">({t("common.optional")})</span></span>
            <input className="input" value={d.keywords} onChange={(e) => setDraft({ ...d, keywords: e.target.value })} />
            <span className="hint">{t("admin.faq.keywordsHint")}</span></label>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="field grow"><span className="label">{t("admin.faq.linkTo")} <span className="muted">({t("common.optional")})</span></span>
              <input className="input" placeholder="/app/services/requests" value={d.link_to} onChange={(e) => setDraft({ ...d, link_to: e.target.value.trim() })} /></label>
            <label className="field grow"><span className="label">{t("admin.faq.linkLabel")}</span>
              <input className="input" maxLength={40} value={d.link_label} onChange={(e) => setDraft({ ...d, link_label: e.target.value })} /></label>
          </div>
          <label className="row" style={{ gap: 8, minHeight: 48 }}><input type="checkbox" checked={d.active} onChange={(e) => setDraft({ ...d, active: e.target.checked })} style={{ width: 24, height: 24 }} />{t("admin.faq.visible")}</label>
          {bad && <p className="error">{t("admin.faq.check")}</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy || !!bad} onClick={() => save(d)}>{t("common.save")}</button>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>{t("common.cancel")}</button>
          </div>
        </section>
      )}
      {err ? <LoadError text={err} onRetry={load} /> : !list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("admin.faq.empty")}</div> : (
        <div className="list">
          {list.map((f) => (
            <div key={f.id} className="list-row" style={{ alignItems: "flex-start" }}>
              <span className="grow">
                <strong style={{ display: "block" }}>{f.question}</strong>
                <span className="small muted">{t(`admin.faq.cat.${f.category}` as StringKey)} · #{f.sort_order}{f.active ? "" : ` · ${t("admin.sr.hidden")}`}</span>
              </span>
              <button className="btn btn-ghost btn-small" onClick={() => { setDraft(toDraft(f)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("admin.bill.edit")}</button>
              <button className="btn btn-ghost btn-small" onClick={() => save({ ...toDraft(f), active: !f.active })}>{f.active ? t("admin.sr.hide") : t("admin.sr.show")}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function FeedbackTab() {
  const { t } = useI18n();
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { setErr(null); feedbackList(90).then(setRows).catch((e) => setErr(t(errorKey(e)))); }, [t]);
  useEffect(() => { load(); }, [load]);
  const avg = rows && rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>{t("admin.fb.lead", { n: rows?.length ?? 0, avg: avg ?? "—" })}</p>
      {err ? <LoadError text={err} onRetry={load} /> : !rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t("admin.fb.empty")}</div> : rows.map((r) => (
        <section key={r.id} className="card">
          <div className="row" style={{ gap: 8 }}>
            <span className="chip">{t(`fb.topic.${r.topic}` as StringKey)}</span>
            <span aria-label={t("fb.stars", { n: r.rating })} style={{ color: "#B7791F", letterSpacing: 2 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            <span className="small muted" style={{ marginLeft: "auto" }}>{r.nickname ?? t("fb.anonymous")} · {fmt(r.created_at)}</span>
          </div>
          {r.message && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.message}</p>}
        </section>
      ))}
    </>
  );
}
