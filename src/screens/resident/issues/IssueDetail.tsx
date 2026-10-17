import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { isStaff, useAuth } from "../../../features/auth/AuthProvider";
import {
  addComment, confirmResolution, issueDetail, photoUrl, toggleUpvote, uploadPhoto, type IssueDetail as Detail,
} from "../../../features/issues/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { fileProblem } from "../../../lib/validation";
import { useTitle } from "../../../lib/useTitle";
import { buildTimeline, priorityLevel, statusKey, type IssueStatus } from "../../../lib/scoring/labels";
import LeafletMap from "../../../lib/map/LeafletMap";
import { Avatar, Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { CategoryName, PriorityLabel, StatusChip, WhyLine, issuePinHtml } from "../../../components/issues";
import { IconUpload } from "../../../components/ui/Icons";

const OPEN: IssueStatus[] = ["submitted", "acknowledged", "assigned", "in_progress"];

export default function IssueDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { session, profile } = useAuth();
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [comment, setComment] = useState("");
  const [cPhoto, setCPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [fbText, setFbText] = useState("");
  const [fbDone, setFbDone] = useState<StringKey | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setD(await issueDetail(id)); } catch { setD((x) => x ?? null); setErr("err.network"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const x = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(x); }, [toast]);

  const issue = d?.issue ?? null;
  useTitle(issue ? t("issue.title", { ref: issue.ref_no }) : t("issues.title"));

  if (d === undefined) return <main className="screen"><TopBar title={t("issues.title")} back /><Spinner /></main>;
  if (!issue) return <main className="screen"><TopBar title={t("issues.title")} back /><Banner kind="error">{t("issue.notFound")}</Banner></main>;

  const open = OPEN.includes(issue.status);
  const canVote = open && !issue.is_mine && !isStaff(profile?.role);

  async function vote() {
    if (!issue || voting) return;
    setVoting(true); setErr(null);
    // optimistic
    setD((x) => x && x.issue ? { ...x, issue: { ...x.issue, i_voted: !x.issue.i_voted, upvote_count: x.issue.upvote_count + (x.issue.i_voted ? -1 : 1) } } : x);
    try {
      const r = await toggleUpvote(issue.id);
      setToast(!r.voted ? t("issue.unvoted")
        : r.rank_before && r.rank_after && r.rank_after < r.rank_before ? t("issue.moved", { from: r.rank_before, to: r.rank_after })
        : t("issue.stayed", { to: r.rank_after ?? "?" }));
      await load();
    } catch (e) { setErr(errorKey(e)); await load(); }
    setVoting(false);
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim() || !session || !issue) return;
    setSending(true); setErr(null);
    try {
      let path: string | null = null;
      if (cPhoto) {
        const p = fileProblem(cPhoto);
        if (p) throw new Error(p);
        path = await uploadPhoto(session.user.id, cPhoto, "comments");
      }
      await addComment(issue.id, comment.trim(), path);
      setComment(""); setCPhoto(null);
      await load();
    } catch (e2) { setErr(errorKey(e2)); }
    setSending(false);
  }

  async function feedback(fixed: boolean) {
    if (!issue) return;
    setErr(null);
    try {
      await confirmResolution(issue.id, fixed, rating, fbText);
      setFbDone(fixed ? "issue.thanks" : "issue.reopened");
      await load();
    } catch (e) { setErr(errorKey(e)); }
  }

  // Timeline: what happened in order, then the steps still to come (greyed out)
  const timeline = buildTimeline(issue.status, issue.created_at, d!.history);
  const where = [...new Set([issue.address_text, issue.area_name].filter((x): x is string => !!x))]
    .filter((x, _, all) => !all.some((y) => y !== x && y.includes(x)));
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="screen">
      <TopBar title={issue.ref_no} back />

      <section className="card">
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {open && <PriorityLabel p={issue.p} />}
          <StatusChip status={issue.status} />
        </div>
        <h1 style={{ fontSize: "1.375rem" }}><CategoryName slug={issue.category} /></h1>
        <p style={{ margin: "8px 0" }}>{issue.description}</p>
        <p className="small muted" style={{ marginBottom: 4 }}>
          {issue.is_mine ? t("issue.you") : issue.reporter_nickname ? t("issue.reportedBy", { name: issue.reporter_nickname }) : t("issue.anonymous")}
          {" · "}{fmt(issue.created_at)}
        </p>
        {open && (
          <p style={{ margin: "8px 0 0", fontWeight: 700 }}>
            {issue.queue_rank ? t("issue.rankOnly", { rank: issue.queue_rank }) : null}
            <span style={{ display: "block", fontWeight: 400 }}><WhyLine issue={issue} /></span>
          </p>
        )}
        {d!.merged_into && <Banner kind="info">{t("issue.merged", { ref: d!.merged_into })}</Banner>}
      </section>

      {issue.photo_paths.length > 0 && (
        <div className="photos" style={{ margin: "12px 0" }}>
          {issue.photo_paths.map((p) => <a key={p} href={photoUrl(p)} target="_blank" rel="noreferrer"><img src={photoUrl(p)} alt={t(`cat.${issue.category}` as StringKey)} /></a>)}
        </div>
      )}

      <div style={{ margin: "12px 0" }}>
        {canVote ? (
          <>
            <button className="upvote" aria-pressed={issue.i_voted} disabled={voting} onClick={vote}>
              ▲ {issue.i_voted ? t("issue.upvoted") : t("issue.upvote")} · {issue.upvote_count}
            </button>
            {!issue.i_voted && <p className="small muted" style={{ marginTop: 6 }}>{t("issue.upvoteHint")}</p>}
          </>
        ) : (
          <p className="small muted">▲ {issue.upvote_count} · {issue.is_mine ? t("issue.cantUpvoteOwn") : t("issue.cantUpvoteClosed")}</p>
        )}
      </div>

      {issue.is_mine && issue.status === "resolved" && !d!.my_feedback && !fbDone && (
        <section className="card" style={{ borderLeft: "6px solid var(--color-success)" }}>
          <h2 style={{ fontSize: "1.25rem" }}>{t("issue.fixedQ")}</h2>
          <p className="muted">{t("issue.fixedLead")}</p>
          <p style={{ fontWeight: 700, marginBottom: 4 }}>{t("issue.rate")}</p>
          <div className="stars" role="group" aria-label={t("issue.rate")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={rating !== null && n <= rating} aria-label={`${n} of 5`} onClick={() => setRating(n)}>★</button>
            ))}
          </div>
          <textarea className="textarea" style={{ marginTop: 8, minHeight: 80 }} value={fbText} maxLength={500}
            placeholder={t("issue.feedbackPh")} onChange={(e) => setFbText(e.target.value)} aria-label={t("issue.feedbackPh")} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-success" onClick={() => feedback(true)}>{t("issue.yesFixed")}</button>
            <button className="btn btn-ghost" onClick={() => feedback(false)}>{t("issue.notFixed")}</button>
          </div>
        </section>
      )}
      {fbDone && <Banner kind="success">{t(fbDone)}</Banner>}

      <h2 className="section">{t("issue.progress")}</h2>
      <section className="card">
        {d!.team && <p style={{ fontWeight: 700 }}>{t("issue.team", { team: d!.team })}</p>}
        <ol className="timeline">
          {timeline.map((e, i) => (
            <li key={i} className={e.at ? "" : "todo"}>
              <span className="tl-dot" aria-hidden="true" />
              <strong>{t(statusKey(e.status))}</strong>
              {e.at ? (
                <span className="small muted" style={{ display: "block" }}>
                  {fmt(e.at)}{e.note ? ` · ${e.note}` : ""}
                </span>
              ) : (
                <span className="small" style={{ display: "block" }}>{t(`statusSub.${e.status}` as StringKey)}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <h2 className="section">{t("issue.where")}</h2>
      <LeafletMap label={t("issue.where")} height={200} interactive={false} center={[issue.lat, issue.lng]} zoom={16}
        pins={[{ id: issue.id, lat: issue.lat, lng: issue.lng, label: issue.ref_no, html: issuePinHtml(open ? priorityLevel(issue.p) : "low") }]} />
      <p className="small muted" style={{ marginTop: 6 }}>{where.join(" · ")}</p>

      <h2 className="section">{t("issue.comments")}</h2>
      <section className="card">
        {d!.comments.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("issue.noComments")}</p> : d!.comments.map((c) => (
          <div key={c.id} className="comment">
            <Avatar name={c.nickname ?? "?"} config={c.avatar ?? undefined} size={36} />
            <div className="grow">
              <div className="row" style={{ gap: 6 }}>
                <strong>{c.nickname ?? "A resident"}</strong>
                {c.staff && <span className="chip staff-badge">{t("issue.staff")}</span>}
                <span className="small muted" style={{ marginLeft: "auto" }}>{fmt(c.at)}</span>
              </div>
              <p style={{ margin: "4px 0 0" }}>{c.body}</p>
              {c.photo_path && <img src={photoUrl(c.photo_path)} alt="" style={{ width: 140, borderRadius: 12, marginTop: 6 }} />}
            </div>
          </div>
        ))}
        <form onSubmit={sendComment} style={{ marginTop: 12 }}>
          <label className="field" style={{ marginBottom: 8 }}>
            <span className="label">{t("issue.addComment")}</span>
            <textarea className="textarea" style={{ minHeight: 80 }} value={comment} maxLength={600} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()}>
              <IconUpload width={18} /> {cPhoto ? cPhoto.name.slice(0, 18) : t("issue.addPhoto")}
            </button>
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => setCPhoto(e.target.files?.[0] ?? null)} />
            <button className="btn btn-primary btn-small" style={{ marginLeft: "auto" }} disabled={!comment.trim() || sending}>{t("issue.send")}</button>
          </div>
        </form>
      </section>

      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{t(err)}</Banner></div>}
      {toast && <div className="toast pop-in" role="status" aria-live="polite">{toast}</div>}
    </main>
  );
}
