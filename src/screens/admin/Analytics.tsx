import { useCallback, useEffect, useState } from "react";
import { analyticsSummary, setBaseline, type Analytics as A } from "../../features/info/api";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, Spinner } from "../../components/ui/parts";

// Two-series categorical pair, validated with the dataviz palette checker (CVD ΔE 24.7, contrast ≥ 3:1).
const C_REPORTED = "#2a78d6";
const C_RESOLVED = "#eb6834";

const num = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${v}${unit}`);

/** Hero number with an optional before-Jiran comparison. Lower is better for every metric shown here. */
function Stat({ label, value, unit, base, hint }: { label: string; value: number | null; unit: string; base?: number | null; hint?: string }) {
  const { t } = useI18n();
  const diff = value != null && base != null && base > 0 ? Math.round(((base - value) / base) * 100) : null;
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{num(value)}<span className="stat-unit">{value != null ? unit : ""}</span></span>
      {base != null ? (
        <span className="small">
          {t("admin.a.before", { v: `${base}${unit}` })}
          {diff != null && <strong> · {diff >= 0 ? t("admin.a.better", { n: diff }) : t("admin.a.worse", { n: -diff })}</strong>}
        </span>
      ) : <span className="small muted">{hint ?? t("admin.a.noBaseline")}</span>}
    </div>
  );
}

function WeeklyChart({ data }: { data: A["weekly"] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 640, H = 220, padL = 32, padB = 28, padT = 12;
  const max = Math.max(1, ...data.flatMap((d) => [d.reported, d.resolved]));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const groupW = (W - padL) / data.length;
  const barW = Math.min(18, (groupW - 14) / 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const label = (w: string) => new Date(w).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <section className="card">
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <h2 className="grow" style={{ fontSize: "1.125rem", margin: 0 }}>{t("admin.a.weekly")}</h2>
        <span className="legend"><span className="key" style={{ background: C_REPORTED }} />{t("admin.a.reported")}</span>
        <span className="legend"><span className="key" style={{ background: C_RESOLVED }} />{t("admin.a.resolved")}</span>
        <button className="link-btn" onClick={() => setTable((x) => !x)}>{t(table ? "admin.a.showChart" : "admin.a.showTable")}</button>
      </div>
      {table ? (
        <table className="table" style={{ marginTop: 12 }}>
          <thead><tr><th>{t("admin.a.weekOf")}</th><th>{t("admin.a.reported")}</th><th>{t("admin.a.resolved")}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.week}><td>{label(d.week)}</td><td>{d.reported}</td><td>{d.resolved}</td></tr>)}</tbody>
        </table>
      ) : (
        <div style={{ position: "relative", marginTop: 8 }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("admin.a.weeklyAria")} onMouseLeave={() => setHover(null)}>
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line x1={padL} x2={W} y1={y(i * step)} y2={y(i * step)} stroke="#E8E1D8" strokeWidth={1} />
                <text x={padL - 6} y={y(i * step) + 4} fontSize={11} textAnchor="end" fill="#6B625C">{i * step}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = padL + i * groupW + (groupW - barW * 2 - 2) / 2;
              const bar = (v: number, x: number, c: string) => v > 0 && (
                <path d={`M${x},${y(0)} V${y(v) + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z`} fill={c} />
              );
              return (
                <g key={d.week} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                  aria-label={`${label(d.week)}: ${d.reported} ${t("admin.a.reported")}, ${d.resolved} ${t("admin.a.resolved")}`}>
                  <rect x={padL + i * groupW} y={padT} width={groupW} height={H - padT - padB} fill={hover === i ? "rgba(0,0,0,0.04)" : "transparent"} />
                  {bar(d.reported, x0, C_REPORTED)}
                  {bar(d.resolved, x0 + barW + 2, C_RESOLVED)}
                  <text x={padL + i * groupW + groupW / 2} y={H - 8} fontSize={11} textAnchor="middle" fill="#6B625C">{label(d.week)}</text>
                </g>
              );
            })}
            <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="#B9AEA4" strokeWidth={1} />
          </svg>
          {hover != null && (
            <div className="chart-tip" style={{ left: `${((padL + hover * groupW + groupW / 2) / W) * 100}%` }}>
              <strong>{t("admin.a.weekOf")} {label(data[hover].week)}</strong>
              <span><span className="key" style={{ background: C_REPORTED }} />{t("admin.a.reported")}: {data[hover].reported}</span>
              <span><span className="key" style={{ background: C_RESOLVED }} />{t("admin.a.resolved")}: {data[hover].resolved}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BaselineEditor({ b, onSaved }: { b: A["baseline"]; onSaved: () => void }) {
  const { t } = useI18n();
  const [ack, setAck] = useState(b.ack_hours?.toString() ?? "");
  const [res, setRes] = useState(b.resolve_days?.toString() ?? "");
  const [fu, setFu] = useState(b.followups?.toString() ?? "");
  const [src, setSrc] = useState(b.source ?? "");
  const [err, setErr] = useState<string | null>(null);
  const n = (s: string) => (s.trim() === "" ? null : Number(s));
  const bad = [ack, res, fu].some((s) => s.trim() !== "" && !(Number(s) >= 0));
  return (
    <section className="card">
      <h2 style={{ fontSize: "1.125rem" }}>{t("admin.a.baselineTitle")}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t("admin.a.baselineLead")}</p>
      <div className="three-col">
        <Field label={t("admin.a.bAck")} inputMode="decimal" value={ack} onChange={(e) => setAck(e.target.value)} />
        <Field label={t("admin.a.bRes")} inputMode="decimal" value={res} onChange={(e) => setRes(e.target.value)} />
        <Field label={t("admin.a.bFu")} inputMode="decimal" value={fu} onChange={(e) => setFu(e.target.value)} />
      </div>
      <Field label={t("admin.a.bSource")} value={src} maxLength={200} onChange={(e) => setSrc(e.target.value)} hint={t("admin.a.bSourceHint")} />
      {err && <Banner kind="error">{err}</Banner>}
      <button className="btn btn-secondary btn-small" disabled={bad} onClick={async () => {
        try { await setBaseline({ ack_hours: n(ack), resolve_days: n(res), followups: n(fu), source: src }); onSaved(); }
        catch (e) { setErr(t(errorKey(e))); }
      }}>{t("common.save")}</button>
    </section>
  );
}

/** Analytics-lite: the outcome numbers for "fewer follow-ups, faster resolution", plus SOS and community health. */
export default function Analytics() {
  const { t } = useI18n();
  useTitle(t("admin.nav.analytics"));
  const [days, setDays] = useState(30);
  const [a, setA] = useState<A | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => { setErr(null); analyticsSummary(days).then(setA).catch((e) => setErr(t(errorKey(e)))); }, [days, t]);
  useEffect(() => { setA(null); load(); }, [load]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <h1 className="grow" style={{ margin: 0 }}>{t("admin.nav.analytics")}</h1>
        <div className="chip-row" role="group" aria-label={t("admin.a.period")}>
          {[7, 30, 90].map((d) => <button key={d} className="chip-btn" aria-pressed={days === d} onClick={() => setDays(d)}>{t("admin.a.lastN", { n: d })}</button>)}
        </div>
      </div>
      {err && <Banner kind="error">{err}</Banner>}
      {!a ? (!err && <Spinner />) : (
        <>
          {a.demo_share > 0 && <Banner kind="info">{t("admin.a.demoNote", { n: a.demo_share, total: a.issues.reported })}</Banner>}
          <div className="stat-grid" style={{ marginTop: 12 }}>
            <Stat label={t("admin.a.ack")} value={a.issues.median_ack_hours} unit=" h" base={a.baseline.ack_hours} />
            <Stat label={t("admin.a.resolve")} value={a.issues.median_resolve_days} unit=" d" base={a.baseline.resolve_days} />
            <Stat label={t("admin.a.followups")} value={a.issues.followups_per_issue} unit="" base={a.baseline.followups} />
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {t("admin.a.baselineSource", { s: a.baseline.source })} <button className="link-btn" onClick={() => setEditing((x) => !x)}>{t(editing ? "common.close" : "admin.a.editBaseline")}</button>
          </p>
          {editing && <div style={{ marginTop: 12 }}><BaselineEditor b={a.baseline} onSaved={() => { setEditing(false); load(); }} /></div>}

          <div className="stat-grid small-tiles" style={{ marginTop: 16 }}>
            <Stat label={t("admin.a.reported")} value={a.issues.reported} unit="" hint={t("admin.a.inPeriod")} />
            <Stat label={t("admin.a.resolved")} value={a.issues.resolved} unit="" hint={t("admin.a.inPeriod")} />
            <Stat label={t("admin.a.openNow")} value={a.issues.open} unit="" hint={t("admin.a.allTime")} />
            <Stat label={t("admin.a.rating")} value={a.issues.avg_rating} unit=" / 5" hint={t("admin.a.ratingHint", { y: a.issues.confirmed_fixed, n: a.issues.not_fixed })} />
          </div>

          <div style={{ marginTop: 16 }}><WeeklyChart data={a.weekly} /></div>

          <div className="admin-two" style={{ marginTop: 16 }}>
            <section className="card">
              <h2 style={{ fontSize: "1.125rem" }}>{t("admin.a.byCategory")}</h2>
              {a.by_category.length === 0 ? <p className="muted">{t("admin.a.none")}</p> : (
                <table className="table">
                  <thead><tr><th>{t("admin.a.category")}</th><th>{t("admin.a.reported")}</th><th>{t("admin.a.resolved")}</th><th>{t("admin.a.medianFix")}</th></tr></thead>
                  <tbody>{a.by_category.map((c) => (
                    <tr key={c.category}><td>{t(`cat.${c.category}` as StringKey)}</td><td>{c.reported}</td><td>{c.resolved}</td><td>{num(c.median_resolve_days, " d")}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </section>
            <div>
              <section className="card">
                <h2 style={{ fontSize: "1.125rem" }}>{t("admin.a.sos")}</h2>
                <dl className="kv">
                  <dt>{t("admin.a.sosTotal")}</dt><dd>{a.sos.total}</dd>
                  <dt>{t("admin.a.sosMedian")}</dt><dd>{num(a.sos.median_minutes_to_staff, " min")}</dd>
                  <dt>{t("admin.a.sosFalse")}</dt><dd>{a.sos.false_alarms}</dd>
                  <dt>{t("admin.a.sosCancelled")}</dt><dd>{a.sos.cancelled}</dd>
                </dl>
              </section>
              <section className="card">
                <h2 style={{ fontSize: "1.125rem" }}>{t("admin.a.community")}</h2>
                <dl className="kv">
                  <dt>{t("admin.a.active")}</dt><dd>{a.community.active_residents} / {a.community.residents}</dd>
                  <dt>{t("admin.a.posts")}</dt><dd>{a.community.posts} · {t("admin.a.repliesN", { n: a.community.replies })}</dd>
                  <dt>{t("admin.a.held")}</dt><dd>{a.community.held}</dd>
                  <dt>{t("admin.a.events")}</dt><dd>{a.community.events} · {t("admin.a.rsvpN", { n: a.community.rsvps })} · {t("admin.a.checkinN", { n: a.community.checkins })}</dd>
                  <dt>{t("admin.a.newsletter")}</dt><dd>{a.newsletter ? t("admin.a.nlReads", { n: a.newsletter.reads, total: a.community.residents }) : "—"}</dd>
                </dl>
              </section>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>{t("admin.a.defs")}</p>
        </>
      )}
    </div>
  );
}
