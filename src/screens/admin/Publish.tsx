import { useCallback, useEffect, useState } from "react";
import {
  NOTICE_CATEGORIES, adminAnnouncements, loadAreas, publishAnnouncement, withdrawAnnouncement,
  type AdminAnnouncement, type AreaRow, type NoticeCategory,
} from "../../features/info/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { fromLocalInput } from "../../lib/info";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, SelectField, Spinner } from "../../components/ui/parts";
import { CategoryChip } from "../resident/info/Announcements";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STATE_CLASS: Record<AdminAnnouncement["state"], string> = { live: "green", scheduled: "blue", ended: "", withdrawn: "red" };

/** Publish composer (notices to the whole township or chosen areas) and the list of everything published. */
export default function Publish() {
  const { t } = useI18n();
  useTitle(t("admin.nav.publish"));
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [list, setList] = useState<AdminAnnouncement[] | null>(null);
  const [cat, setCat] = useState<NoticeCategory>("general");
  const [source, setSource] = useState("Township management");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"township" | "areas">("township");
  const [picked, setPicked] = useState<string[]>([]);
  const [publishAt, setPublishAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => { adminAnnouncements().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { loadAreas().then(setAreas).catch(() => {}); load(); }, [load]);

  const errs: string[] = [];
  if (title.trim().length < 4) errs.push(t("admin.p.errTitle"));
  if (body.trim().length < 10) errs.push(t("err.description_short"));
  if (target === "areas" && picked.length === 0) errs.push(t("admin.p.errAreas"));
  const end = fromLocalInput(endsAt), pub = fromLocalInput(publishAt);
  if (end && new Date(end) <= new Date(pub ?? Date.now())) errs.push(t("admin.p.errEnd"));

  async function send() {
    if (errs.length) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await publishAnnouncement({ category: cat, source, title: title.trim(), body: body.trim(), targetKind: target, areaIds: picked,
        publishAt: pub, startsAt: fromLocalInput(startsAt), endsAt: end, pinned });
      setMsg({ kind: "success", text: t(r.scheduled ? "admin.p.scheduled" : "admin.p.sent", { n: r.audience }) });
      setTitle(""); setBody(""); setPicked([]); setPublishAt(""); setStartsAt(""); setEndsAt(""); setPinned(false);
      load();
    } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
    setBusy(false); setConfirming(false);
  }

  async function withdraw(a: AdminAnnouncement) {
    if (!window.confirm(t("admin.p.withdrawQ", { title: a.title }))) return;
    try { await withdrawAnnouncement(a.id); load(); } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }

  const residential = areas.filter((a) => a.residential || a.kind === "commercial" || a.kind === "park");
  return (
    <div className="admin-two">
      <section className="card" style={{ alignSelf: "start" }}>
        <h1 style={{ fontSize: "1.375rem" }}>{t("admin.p.title")}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{t("admin.p.lead")}</p>
        <SelectField label={t("admin.p.category")} value={cat} onChange={(v) => setCat(v as NoticeCategory)}
          hint={cat === "safety" || cat === "maintenance" ? t("admin.p.tier2") : undefined}>
          {NOTICE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`notice.cat.${c}` as StringKey)}</option>)}
        </SelectField>
        <Field label={t("admin.p.source")} value={source} maxLength={60} onChange={(e) => setSource(e.target.value)} hint={t("admin.p.sourceHint")} />
        <Field label={t("admin.p.titleLabel")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <label className="field">
          <span className="label">{t("admin.p.body")}</span>
          <textarea className="textarea" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
          <legend className="label" style={{ fontWeight: 800, marginBottom: 8 }}>{t("admin.p.who")}</legend>
          <div className="segmented">
            {(["township", "areas"] as const).map((k) => (
              <label key={k}><input type="radio" name="target" checked={target === k} onChange={() => setTarget(k)} />
                <span>{t(k === "township" ? "admin.p.everyone" : "admin.p.someAreas")}</span></label>
            ))}
          </div>
          {target === "areas" && (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {residential.map((a) => (
                <button key={a.id} type="button" className="chip-btn" aria-pressed={picked.includes(a.id)}
                  onClick={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))}>{a.name}</button>
              ))}
            </div>
          )}
        </fieldset>
        <div className="two-col">
          <Field label={t("admin.p.publishAt")} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} hint={t("admin.p.publishAtHint")} optional />
          <Field label={t("admin.p.endsAt")} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} hint={t("admin.p.endsAtHint")} optional />
        </div>
        {(cat === "maintenance" || cat === "event") && (
          <Field label={t("admin.p.startsAt")} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} hint={t("admin.p.startsAtHint")} optional />
        )}
        <label className="row" style={{ cursor: "pointer", minHeight: 48 }}>
          <span className="grow"><strong>{t("admin.p.pin")}</strong><span className="muted small" style={{ display: "block" }}>{t("admin.p.pinHint")}</span></span>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ width: 24, height: 24 }} />
        </label>
        {errs.length > 0 && (title || body) && <ul className="small" style={{ color: "var(--color-urgent)", paddingLeft: 18 }}>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className={`btn ${confirming ? "btn-danger" : "btn-primary"}`} disabled={busy || errs.length > 0} onClick={send}>
            {busy ? t("common.loading") : confirming ? t("admin.p.confirm") : t(pub && new Date(pub) > new Date() ? "admin.p.schedule" : "admin.p.publish")}
          </button>
          {confirming && <button className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.25rem", marginBottom: 12 }}>{t("admin.p.published")}</h2>
        {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("notice.empty")}</div> : (
          <table className="table">
            <thead><tr><th>{t("admin.p.colNotice")}</th><th>{t("admin.p.colWho")}</th><th>{t("admin.p.colWhen")}</th><th>{t("admin.p.colReads")}</th><th /></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                      <CategoryChip c={a.category} />
                      <span className={`chip ${STATE_CLASS[a.state]}`}>{t(`admin.p.state.${a.state}` as StringKey)}</span>
                      {a.pinned && <span className="chip">{t("notice.pinned")}</span>}
                    </div>
                    <strong>{a.title}</strong>
                    <div className="small muted">{a.source_label}</div>
                  </td>
                  <td className="small">{a.target_kind === "township" ? t("notice.everyone") : a.area_names.join(", ")}</td>
                  <td className="small">{fmt(a.publish_at)}{a.ends_at && <><br />{t("admin.p.until", { time: fmt(a.ends_at) })}</>}</td>
                  <td className="small">{a.reads} / {a.audience}</td>
                  <td>{(a.state === "live" || a.state === "scheduled") && <button className="link-btn" onClick={() => withdraw(a)}>{t("admin.p.withdraw")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
