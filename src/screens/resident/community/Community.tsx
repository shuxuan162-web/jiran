import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import {
  POST_TYPES, communityFeed, createPost, deleteOwnPost, postById, repliesFor, replyPost, reportContent, toggleHelpful,
  type Post, type PostType, type Reply,
} from "../../../features/info/api";
import { photoUrl, uploadPhoto } from "../../../features/issues/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { looksPrivate, timeAgo } from "../../../lib/info";
import { insideElmina } from "../../../lib/map/elmina";
import MapView from "../../../lib/map/MapView";
import { readPref, writePref } from "../../../lib/prefs";
import { useTitle } from "../../../lib/useTitle";
import { fileProblem } from "../../../lib/validation";
import { Avatar, Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { NotificationBell } from "../../../components/issues";
import { IconChat, IconHeart, IconPin, IconUpload, IconX } from "../../../components/ui/Icons";
import Announcements from "../info/Announcements";

const TYPE_ICON: Record<PostType, string> = { general: "💬", question: "❓", lost_found: "🔎", recommendation: "👍", safety_tip: "🛡" };

export function PostTypeChip({ type }: { type: PostType }) {
  const { t } = useI18n();
  return <span className="chip"><span aria-hidden="true">{TYPE_ICON[type]}</span> {t(`post.type.${type}` as StringKey)}</span>;
}

function Author({ p }: { p: Pick<Post, "nickname" | "avatar" | "anonymous" | "is_mine"> }) {
  const { t } = useI18n();
  const name = p.nickname ?? t("post.aNeighbour");
  return (
    <span className="row" style={{ gap: 8 }}>
      <Avatar name={p.nickname ?? "?"} config={p.avatar ?? undefined} size={36} />
      <strong>{name}{p.is_mine && p.anonymous ? ` (${t("post.anonToOthers")})` : ""}</strong>
    </span>
  );
}

export function PostCard({ p }: { p: Post }) {
  const { t } = useI18n();
  return (
    <Link to={`/app/community/${p.id}`} className="post-card">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Author p={p} />
        <span className="small muted" style={{ marginLeft: "auto" }}>{timeAgo(p.created_at)}</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
        <PostTypeChip type={p.type} />
        {p.state === "held" && <span className="chip lvl-medium">{t("post.held")}</span>}
        {p.bubble_active && <span className="chip green">{t("post.onMap")}</span>}
      </div>
      <p className="post-body">{p.body}</p>
      <div className="row small muted" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 4 }}><IconPin width={16} />{p.area_name ?? t("issue.nearby")}</span>
        <span className="row" style={{ gap: 4 }}><IconHeart width={16} />{p.helpful_count}</span>
        <span className="row" style={{ gap: 4 }}><IconChat width={16} />{p.reply_count}</span>
      </div>
    </Link>
  );
}

type Tab = "all" | "neighbours" | "official" | "mine";

/** Township feed: neighbours' posts plus the official announcements tab. */
export default function Community() {
  const { t } = useI18n();
  useTitle(t("community.title"));
  const [params, setParams] = useSearchParams();
  const tab = (["all", "neighbours", "official", "mine"].includes(params.get("tab") ?? "") ? params.get("tab") : "all") as Tab;
  const [rows, setRows] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (tab === "official") return;
    communityFeed(tab, 60).then((r) => { setRows(r); setFailed(false); }).catch(() => { setFailed(true); setRows((x) => x ?? []); });
  }, [tab]);
  useEffect(() => {
    setRows(null); load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <main className="screen">
      <TopBar title={t("community.title")} back="/app/residence" right={<NotificationBell />} />
      <Link to="/app/community/new" className="btn btn-primary" style={{ marginBottom: 16 }}>+ {t("community.share")}</Link>
      <div className="tabs" role="tablist" aria-label={t("community.title")}>
        {(["all", "neighbours", "official", "mine"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k}
            onClick={() => setParams(k === "all" ? {} : { tab: k }, { replace: true })}>{t(`community.tab.${k}` as StringKey)}</button>
        ))}
      </div>
      {tab === "official" ? <Announcements embedded /> : (
        <>
          {failed && <Banner kind="error">{t("err.network")}</Banner>}
          {!rows ? <Spinner /> : rows.length === 0 ? (
            <div className="card muted">{t(tab === "mine" ? "community.emptyMine" : "community.empty")}</div>
          ) : (
            <div role="list">{rows.map((p) => <div role="listitem" key={p.id}><PostCard p={p} /></div>)}</div>
          )}
        </>
      )}
    </main>
  );
}

/** Share a post: type, text, optional photo and pin, bubble toggle, anonymous toggle. Under 45 seconds. */
export function NewPost() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { session } = useAuth();
  useTitle(t("community.share"));
  const [type, setType] = useState<PostType>("general");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoErr, setPhotoErr] = useState<StringKey | null>(null);
  const [pinOn, setPinOn] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [bubble, setBubble] = useState(true);
  const [anon, setAnon] = useState(false);
  const [agreed, setAgreed] = useState(() => readPref("postGuidelines") === "1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const text = body.trim();
  const privateWarn = looksPrivate(body);
  const outside = pin ? !insideElmina(pin.lat, pin.lng) : false;
  const valid = text.length >= 3 && text.length <= 500 && (!pinOn || (pin && !outside)) && agreed;

  async function submit() {
    if (!valid || !session) return;
    setBusy(true); setErr(null);
    try {
      const path = photo ? await uploadPhoto(session.user.id, photo, "posts") : null;
      const r = await createPost({ type, body: text, photoPath: path, areaId: null, lat: pinOn && pin ? pin.lat : null,
        lng: pinOn && pin ? pin.lng : null, anonymous: anon, bubble: pinOn && bubble });
      writePref("postGuidelines", "1");
      nav(`/app/community/${r.id}`, { replace: true, state: { justPosted: r.state } });
    } catch (e) { setErr(t(errorKey(e))); setBusy(false); }
  }

  return (
    <main className="screen">
      <TopBar title={t("community.share")} back />
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
        <legend className="label" style={{ fontWeight: 800, marginBottom: 8 }}>{t("post.typeQ")}</legend>
        <div className="chip-row">
          {POST_TYPES.map((k) => (
            <button key={k} type="button" className="chip-btn" aria-pressed={type === k} onClick={() => setType(k)}>
              <span aria-hidden="true">{TYPE_ICON[k]}</span> {t(`post.type.${k}` as StringKey)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span className="label">{t("post.text")}</span>
        <textarea className="textarea" value={body} maxLength={500} onChange={(e) => setBody(e.target.value)}
          placeholder={t(`post.placeholder.${type}` as StringKey)} />
        <span className="hint">{t("post.count", { n: body.length })}</span>
        {privateWarn && <span className="error" role="status">{t("post.privateWarn")}</span>}
      </label>

      <div className="field">
        <span className="label">{t("post.photo")} <span className="muted">({t("common.optional")})</span></span>
        {photo ? (
          <div className="photos" style={{ marginBottom: 8 }}>
            <div style={{ position: "relative" }}>
              <img src={URL.createObjectURL(photo)} alt="" />
              <button type="button" className="icon-btn" aria-label={t("post.removePhoto")} style={{ position: "absolute", top: 4, right: 4, width: 36, height: 36 }}
                onClick={() => setPhoto(null)}><IconX width={18} /></button>
            </div>
          </div>
        ) : (
          <button type="button" className="file-drop" style={{ width: "100%", minHeight: 80 }} onClick={() => fileRef.current?.click()}>
            <IconUpload width={26} /> {t("report.photoChoose")}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = ""; setPhotoErr(null);
            if (!f) return;
            const p = fileProblem(f);
            if (p || f.type === "application/pdf") { setPhotoErr(p ? (`err.${p}` as StringKey) : "err.file_type"); return; }
            setPhoto(f);
          }} />
        {photoErr && <span className="error">{t(photoErr)}</span>}
      </div>

      <section className="card">
        <label className="row" style={{ cursor: "pointer", minHeight: 48 }}>
          <span className="grow"><strong>{t("post.pinQ")}</strong><span className="muted small" style={{ display: "block" }}>{t("post.pinHint")}</span></span>
          <input type="checkbox" checked={pinOn} onChange={(e) => setPinOn(e.target.checked)} style={{ width: 28, height: 28 }} />
        </label>
        {pinOn && (
          <>
            <MapView label={t("post.pinQ")} height={260} pick={pin} onPick={(lat, lng) => setPin({ lat, lng })} />
            {!pin && <p className="small muted">{t("post.tapMap")}</p>}
            {outside && <Banner kind="error">{t("err.outside_township")}</Banner>}
            <label className="row" style={{ cursor: "pointer", minHeight: 48, marginTop: 8 }}>
              <span className="grow"><strong>{t("post.bubble")}</strong><span className="muted small" style={{ display: "block" }}>{t("post.bubbleHint")}</span></span>
              <input type="checkbox" checked={bubble} onChange={(e) => setBubble(e.target.checked)} style={{ width: 28, height: 28 }} />
            </label>
          </>
        )}
        <label className="row" style={{ cursor: "pointer", minHeight: 48, marginTop: 8 }}>
          <span className="grow"><strong>{t("post.anon")}</strong><span className="muted small" style={{ display: "block" }}>{t("post.anonHint")}</span></span>
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} style={{ width: 28, height: 28 }} />
        </label>
      </section>

      {!agreed && (
        <section className="card" aria-labelledby="gl-h" style={{ marginTop: 16 }}>
          <h2 id="gl-h" style={{ fontSize: "1.125rem" }}>{t("post.guidelines")}</h2>
          <ul style={{ paddingLeft: 20, margin: "8px 0 12px" }}>
            {(["post.g1", "post.g2", "post.g3", "post.g4"] as StringKey[]).map((k) => <li key={k} style={{ marginBottom: 4 }}>{t(k)}</li>)}
          </ul>
          <button className="btn btn-secondary btn-small" onClick={() => setAgreed(true)}>{t("post.agree")}</button>
        </section>
      )}

      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{err}</Banner></div>}
      <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!valid || busy} onClick={submit}>
        {busy ? t("common.loading") : t("post.publish")}
      </button>
    </main>
  );
}

const REASONS = ["spam", "rude", "unsafe", "private_info", "other"] as const;

function ReportBox({ onSend, onClose }: { onSend: (reason: string, note: string) => Promise<void>; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<string>("spam");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <strong>{t("post.reportQ")}</strong>
      <div className="chip-row" style={{ margin: "8px 0" }}>
        {REASONS.map((r) => (
          <button key={r} type="button" className="chip-btn" aria-pressed={reason === r} onClick={() => setReason(r)}>{t(`post.reason.${r}` as StringKey)}</button>
        ))}
      </div>
      <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("post.reportNote")} />
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button className="btn btn-secondary btn-small" disabled={busy} onClick={async () => { setBusy(true); await onSend(reason, note); setBusy(false); }}>{t("post.reportSend")}</button>
        <button className="btn btn-ghost btn-small" onClick={onClose}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

export function PostDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { justPosted?: "visible" | "held" } };
  const [p, setP] = useState<Post | null | undefined>(undefined);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(
    loc.state?.justPosted === "held" ? { kind: "info", text: "" } : loc.state?.justPosted === "visible" ? { kind: "success", text: "" } : null);
  const [reporting, setReporting] = useState<{ kind: "post" | "reply"; id: string } | null>(null);
  useTitle(t("community.post"));

  const load = useCallback(async () => {
    try {
      const [x, r] = await Promise.all([postById(id), repliesFor(id)]);
      setP(x); setReplies(r);
    } catch { setP(null); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function helpful() {
    if (!p) return;
    try { const r = await toggleHelpful(p.id); setP({ ...p, i_helpful: r.helpful, helpful_count: r.count }); }
    catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
  }
  async function send() {
    const body = text.trim();
    if (!body || !p) return;
    if (looksPrivate(body)) { setNote({ kind: "error", text: t("err.private_info") }); return; }
    setBusy(true);
    try { await replyPost(p.id, body); setText(""); await load(); setNote(null); }
    catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false);
  }
  async function remove() {
    if (!p || !window.confirm(t("post.deleteQ"))) return;
    try { await deleteOwnPost(p.id); nav("/app/community?tab=mine", { replace: true }); } catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
  }

  const justText = note && note.text === "" ? (note.kind === "info" ? t("post.heldNow") : t("post.published")) : note?.text;

  return (
    <main className="screen">
      <TopBar title={t("community.post")} back="/app/community" />
      {p === undefined ? <Spinner /> : !p ? <Banner kind="error">{t("err.not_found")}</Banner> : (
        <>
          {note && <div style={{ marginBottom: 12 }}><Banner kind={note.kind}>{justText}</Banner></div>}
          <article className="card">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Author p={p} />
              <span className="small muted" style={{ marginLeft: "auto" }}>{timeAgo(p.created_at)}</span>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "10px 0 6px" }}>
              <PostTypeChip type={p.type} />
              {p.state === "held" && <span className="chip lvl-medium">{t("post.held")}</span>}
              <span className="chip"><IconPin width={14} /> {p.area_name ?? t("issue.nearby")}</span>
            </div>
            {p.state === "held" && <Banner kind="info">{t(p.held_reason === "private_info" ? "post.heldPrivate" : "post.heldLead")}</Banner>}
            <p style={{ whiteSpace: "pre-wrap", fontSize: "1.0625rem" }}>{p.body}</p>
            {p.photo_path && <img src={photoUrl(p.photo_path)} alt={t("post.photoAlt")} style={{ width: "100%", borderRadius: 12 }} />}
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {!p.is_mine && p.state === "visible" && (
                <button className={`btn btn-small ${p.i_helpful ? "btn-secondary" : "btn-ghost"}`} aria-pressed={p.i_helpful} onClick={helpful}>
                  <IconHeart width={18} /> {t("post.helpful")} · {p.helpful_count}
                </button>
              )}
              {p.is_mine && <span className="small muted">{t("post.helpfulCount", { n: p.helpful_count })}</span>}
              {!p.is_mine && <button className="link-btn" onClick={() => setReporting({ kind: "post", id: p.id })}>{t("post.report")}</button>}
              {p.is_mine && <button className="link-btn" onClick={remove}>{t("post.delete")}</button>}
            </div>
            {reporting?.kind === "post" && (
              <ReportBox onClose={() => setReporting(null)} onSend={async (reason, n) => {
                try { await reportContent("post", p.id, reason, n); setReporting(null); setNote({ kind: "success", text: t("post.reported") }); }
                catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
              }} />
            )}
          </article>

          <h2 className="section">{t("post.replies", { n: replies.length })}</h2>
          {replies.length === 0 ? <div className="card muted">{t("post.noReplies")}</div> : (
            <div className="list">
              {replies.map((r) => (
                <div key={r.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <Avatar name={r.nickname ?? "?"} config={r.avatar ?? undefined} size={36} />
                  <div className="grow">
                    <strong>{r.nickname ?? t("post.aNeighbour")}</strong>
                    {r.is_staff && <span className="chip blue" style={{ marginLeft: 6 }}>{t("issue.staff")}</span>}
                    <span className="small muted"> · {timeAgo(r.created_at)}</span>
                    <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{r.body}</p>
                    {!r.is_mine && <button className="link-btn small" onClick={() => setReporting({ kind: "reply", id: r.id })}>{t("post.report")}</button>}
                    {reporting?.kind === "reply" && reporting.id === r.id && (
                      <ReportBox onClose={() => setReporting(null)} onSend={async (reason, n) => {
                        try { await reportContent("reply", r.id, reason, n); setReporting(null); setNote({ kind: "success", text: t("post.reported") }); }
                        catch (e) { setNote({ kind: "error", text: t(errorKey(e)) }); }
                      }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {p.state === "visible" && (
            <div className="card" style={{ marginTop: 12 }}>
              <label className="field" style={{ marginBottom: 8 }}>
                <span className="label">{t("post.replyLabel")}</span>
                <textarea className="textarea" style={{ minHeight: 72 }} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />
              </label>
              <button className="btn btn-primary btn-small" disabled={busy || !text.trim()} onClick={send}>{t("post.send")}</button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
