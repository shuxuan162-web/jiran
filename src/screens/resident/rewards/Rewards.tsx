import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { claimQuest, leaderboard, myRewards, setOptOut, type LeaderRow, type Rewards as R } from "../../../features/rewards/api";
import { useI18n, type StringKey } from "../../../i18n";
import { levelProgress } from "../../../lib/avatar";
import { errorKey } from "../../../lib/errors";
import { timeAgo } from "../../../lib/info";
import { useTitle } from "../../../lib/useTitle";
import { Avatar, Banner, Spinner, TopBar } from "../../../components/ui/parts";

const BADGE_ICON: Record<string, string> = {
  first_report: "📍", fixer: "🛠", confirmer: "✅", voice: "📣", good_neighbour: "🤝", conversation: "💬",
  event_goer: "🎉", host: "🏠", reader: "📰",
};

export function LevelChip({ level }: { level: number }) {
  const { t } = useI18n();
  return <span className="chip level-chip">{t("rw.levelN", { n: level })} · {t(`rw.title.${Math.min(level, 10)}` as StringKey)}</span>;
}

/** Your character, level, badges, this week's quests, the township goal and the leaderboard. */
export default function Rewards() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("rw.title"));
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<"township" | "area">("township");
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(() => { myRewards().then(setR).catch((e) => setErr(t(errorKey(e)))); }, [t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setRows(null); leaderboard(scope, period).then(setRows).catch(() => setRows([])); }, [scope, period, r?.opted_out]);

  async function claim(slug: string) {
    try { const n = await claimQuest(slug); setMsg({ kind: "success", text: t("rw.claimed", { n }) }); load(); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }
  async function toggleOpt(out: boolean) {
    try { await setOptOut(out); load(); } catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }

  if (err) return <main className="screen"><TopBar title={t("rw.title")} back /><Banner kind="error">{err}</Banner></main>;
  if (!r || !profile) return <main className="screen"><TopBar title={t("rw.title")} back /><Spinner /></main>;
  const p = levelProgress(r.xp);
  const earned = r.badges.filter((b) => b.progress >= b.target).length;

  return (
    <main className="screen">
      <TopBar title={t("rw.title")} back />
      <section className="card rewards-hero">
        <Avatar name={profile.nickname} config={profile.avatar_config} size={84} />
        <div className="grow">
          <strong style={{ fontSize: "1.25rem", display: "block" }}>{profile.nickname}</strong>
          <LevelChip level={p.level} />
          <div className="xp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct}
            aria-label={t("rw.xpAria", { xp: r.xp, next: p.next ?? r.xp })}>
            <span style={{ width: `${p.pct}%` }} />
          </div>
          <span className="small muted">
            {p.next == null ? t("rw.maxLevel", { xp: r.xp }) : t("rw.toNext", { xp: r.xp, n: p.toNext, level: p.level + 1 })}
          </span>
        </div>
      </section>
      <Link to="/app/profile/character" className="btn btn-secondary" style={{ marginTop: 12 }}>{t("rw.customise")}</Link>
      {msg && <div style={{ marginTop: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}

      <h2 className="section">{t("rw.quests")}</h2>
      <p className="small muted" style={{ marginTop: -8 }}>{t("rw.questsLead", { date: new Date(r.week_ends).toLocaleDateString(undefined, { weekday: "long" }) })}</p>
      <div className="list">
        {r.quests.map((q) => {
          const done = q.progress >= q.target;
          return (
            <div key={q.slug} className="list-row quest-row">
              <span className="grow">
                <strong style={{ display: "block" }}>{t(`rw.q.${q.slug}` as StringKey)}</strong>
                <span className="mini-bar" aria-hidden="true"><span style={{ width: `${(q.progress / q.target) * 100}%` }} /></span>
                <span className="small muted">{q.progress} / {q.target} · +{q.bonus} XP</span>
              </span>
              {q.claimed ? <span className="chip green">{t("rw.claimedChip")}</span>
                : done ? <button className="btn btn-primary btn-small" onClick={() => claim(q.slug)}>{t("rw.claim")}</button>
                : <span className="chip">{t("rw.inProgress")}</span>}
            </div>
          );
        })}
      </div>

      <h2 className="section">{t("rw.goal")}</h2>
      <section className="card">
        <strong>{t("rw.goalText", { n: r.goal.target })}</strong>
        <div className="xp-bar goal" style={{ marginTop: 8 }} role="progressbar" aria-valuemin={0} aria-valuemax={r.goal.target} aria-valuenow={r.goal.progress}>
          <span style={{ width: `${Math.min(100, (r.goal.progress / r.goal.target) * 100)}%` }} />
        </div>
        <span className="small muted">{t(r.goal.progress >= r.goal.target ? "rw.goalDone" : "rw.goalProgress", { n: r.goal.progress, target: r.goal.target })}</span>
      </section>

      <h2 className="section">{t("rw.badges", { n: earned, total: r.badges.length })}</h2>
      <div className="badge-grid">
        {r.badges.map((b) => {
          const got = b.progress >= b.target;
          return (
            <div key={b.slug} className={`badge${got ? " got" : ""}`}>
              <span className="badge-icon" aria-hidden="true">{BADGE_ICON[b.slug] ?? "⭐"}</span>
              <strong>{t(`rw.b.${b.slug}` as StringKey)}</strong>
              <span className="small">{got ? t("rw.earned") : `${t(`rw.bh.${b.slug}` as StringKey)} (${b.progress}/${b.target})`}</span>
            </div>
          );
        })}
      </div>

      <h2 className="section">{t("rw.leaderboard")}</h2>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="chip-row" role="group" aria-label={t("rw.scope")}>
          {(["township", "area"] as const).map((s) => <button key={s} className="chip-btn" aria-pressed={scope === s} onClick={() => setScope(s)}>{t(`rw.scope.${s}` as StringKey)}</button>)}
        </div>
        <div className="chip-row" role="group" aria-label={t("rw.period")}>
          {(["week", "all"] as const).map((s) => <button key={s} className="chip-btn" aria-pressed={period === s} onClick={() => setPeriod(s)}>{t(`rw.period.${s}` as StringKey)}</button>)}
        </div>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t("rw.lbEmpty")}</div> : (
        <ol className="list leaderboard">
          {rows.map((x) => (
            <li key={`${x.rank}-${x.nickname}`} className={`list-row${x.is_me ? " me" : ""}`}>
              <span className="rank">{x.rank}</span>
              <Avatar name={x.nickname} config={x.avatar ?? undefined} size={36} />
              <span className="grow"><strong>{x.nickname}{x.is_me ? ` (${t("map.you")})` : ""}</strong>
                <span className="small muted" style={{ display: "block" }}>{t("rw.levelN", { n: x.level })}{x.area_name ? ` · ${x.area_name}` : ""}</span></span>
              <strong>{x.xp} XP</strong>
            </li>
          ))}
        </ol>
      )}
      <label className="row card" style={{ cursor: "pointer", minHeight: 48, marginTop: 12 }}>
        <span className="grow"><strong>{t("rw.optOut")}</strong><span className="small muted" style={{ display: "block" }}>{t("rw.optOutHint")}</span></span>
        <input type="checkbox" checked={r.opted_out} onChange={(e) => toggleOpt(e.target.checked)} style={{ width: 28, height: 28 }} />
      </label>

      <h2 className="section">{t("rw.history")}</h2>
      {r.history.length === 0 ? <div className="card muted">{t("rw.historyEmpty")}</div> : (
        <div className="list">
          {r.history.map((h, i) => (
            <div key={i} className="list-row">
              <span className="grow">{t(`rw.r.${h.reason}` as StringKey)}{h.note ? ` · ${h.note}` : ""}
                <span className="small muted" style={{ display: "block" }}>{timeAgo(h.at)}</span></span>
              <strong className={h.amount < 0 ? "neg" : "pos"}>{h.amount > 0 ? "+" : ""}{h.amount} XP</strong>
            </div>
          ))}
        </div>
      )}
      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("rw.howTitle")}</h3>
        <p className="small" style={{ margin: 0 }}>{t("rw.how")}</p>
      </section>
    </main>
  );
}
