import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { openSurveys, submitSurvey, surveyWithQuestions, type Answer, type OpenSurvey, type SurveyQuestion } from "../../../features/surveys/api";
import { useI18n } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { useTitle } from "../../../lib/useTitle";
import { LoadError } from "../../../components/Status";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { IconChevron, IconClipboard } from "../../../components/ui/Icons";

/** Open surveys, shown at the top of Feedback. Nothing is shown when there are none. */
export function OpenSurveys() {
  const { t } = useI18n();
  const [list, setList] = useState<OpenSurvey[] | null>(null);
  useEffect(() => { openSurveys().then(setList).catch(() => setList([])); }, []);
  if (!list || list.length === 0) return null;
  return (
    <section style={{ marginBottom: 16 }}>
      <h2 className="section" style={{ marginTop: 0 }}>{t("sv.openTitle")}</h2>
      <div className="list">
        {list.map((s) => (
          <Link key={s.id} to={`/app/surveys/${s.id}`} className="list-row">
            <span className="ico" style={{ background: "var(--color-tint-purple)" }}><IconClipboard /></span>
            <span className="grow"><strong style={{ display: "block" }}>{s.title}</strong>
              <span className="small muted">{s.answered ? t("sv.answered") : t("sv.nQuestions", { n: s.questions })}</span></span>
            <IconChevron className="chev" width={20} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Answer a survey once. Management sees totals and comments, never who answered. */
export function SurveyAnswer() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof surveyWithQuestions>> | null>(null);
  const [answered, setAnswered] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ans, setAns] = useState<Record<string, Answer>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useTitle(data?.survey?.title ?? t("sv.title"));

  const load = () => {
    setErr(null);
    Promise.all([surveyWithQuestions(id), openSurveys()])
      .then(([d, open]) => { setData(d); setAnswered(!!open.find((s) => s.id === id)?.answered); })
      .catch((e) => setErr(t(errorKey(e))));
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (q: SurveyQuestion, patch: Partial<Answer>) => setAns((a) => ({ ...a, [q.id!]: { ...(a[q.id!] ?? { question_id: q.id! }), ...patch } }));
  const filled = (q: SurveyQuestion) => {
    const a = ans[q.id!];
    return q.kind === "rating" ? !!a?.rating : q.kind === "choice" ? !!a?.choice : !!a?.text?.trim();
  };
  async function send() {
    if (!data) return;
    const miss = data.questions.filter((q) => q.required && !filled(q)).map((q) => q.id!);
    setMissing(miss);
    if (miss.length) { setSendErr(t("sv.answerAll")); return; }
    setBusy(true); setSendErr(null);
    try { await submitSurvey(id, Object.values(ans)); setDone(true); } catch (e) { setSendErr(t(errorKey(e))); }
    setBusy(false);
  }

  return (
    <main className="screen">
      <TopBar title={data?.survey?.title ?? t("sv.title")} back />
      {err ? <LoadError text={err} onRetry={load} /> : !data ? <Spinner label={t("common.loading")} /> : !data.survey || data.survey.status !== "open" ? (
        <Banner kind="info">{t("sv.closed")}</Banner>
      ) : done || answered ? (
        <section className="card pop-in">
          <Banner kind="success">{done ? t("sv.thanks") : t("sv.already")}</Banner>
          <button className="btn btn-ghost btn-small" style={{ marginTop: 12 }} onClick={() => nav("/app/feedback")}>{t("common.back")}</button>
        </section>
      ) : (
        <>
          {data.survey.intro && <p className="muted" style={{ marginTop: 0 }}>{data.survey.intro}</p>}
          <p className="small muted">{t("sv.privacy")}</p>
          {data.questions.map((q, i) => (
            <fieldset key={q.id} className="card" style={{ border: missing.includes(q.id!) ? "2px solid var(--color-urgent)" : undefined }}>
              <legend className="sr-only">{q.prompt}</legend>
              <p style={{ margin: "0 0 10px", fontWeight: 800 }} aria-hidden="true">{i + 1}. {q.prompt}{!q.required && <span className="muted" style={{ fontWeight: 600 }}> ({t("common.optional")})</span>}</p>
              {q.kind === "rating" && (
                <div className="stars" role="radiogroup" aria-label={q.prompt}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={ans[q.id!]?.rating === n} aria-label={t("fb.stars", { n })}
                      className={n <= (ans[q.id!]?.rating ?? 0) ? "on" : ""} onClick={() => set(q, { rating: n })}>★</button>
                  ))}
                </div>
              )}
              {q.kind === "choice" && (
                <div className="chip-row" role="radiogroup" aria-label={q.prompt}>
                  {q.options.map((o) => <button key={o} type="button" role="radio" className="chip-btn" aria-checked={ans[q.id!]?.choice === o} aria-pressed={ans[q.id!]?.choice === o} onClick={() => set(q, { choice: o })}>{o}</button>)}
                </div>
              )}
              {q.kind === "text" && <textarea className="textarea" aria-label={q.prompt} maxLength={1000} value={ans[q.id!]?.text ?? ""} onChange={(e) => set(q, { text: e.target.value })} />}
              {missing.includes(q.id!) && <span className="error">{t("sv.needThis")}</span>}
            </fieldset>
          ))}
          {sendErr && <Banner kind="error">{sendErr}</Banner>}
          <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{busy ? t("common.loading") : t("sv.send")}</button>
        </>
      )}
    </main>
  );
}
