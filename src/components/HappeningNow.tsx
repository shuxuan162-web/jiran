import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { activeEmergencies, feedOrdered, type FeedItem, type PublicEmergency } from "../features/sos/api";
import { useI18n, type StringKey } from "../i18n";
import { LEVEL_ICON } from "../lib/scoring/labels";

/** Icon, title, sub-line and link for any row of the ordered feed (emergency, notice, issue, event). */
export function feedRowParts(f: FeedItem, sos: PublicEmergency[], t: (k: StringKey, v?: Record<string, string | number>) => string) {
  if (f.kind === "emergency") {
    const e = sos.find((x) => x.id === f.id);
    return { icon: "!", title: t(`sosType.${e?.type ?? "unspecified"}` as StringKey),
      sub: `${t("map.tierEmergency")} · ${f.area_name ?? t("issue.nearby")}`, to: e?.is_mine ? `/app/sos/${f.id}` : "/app/map" };
  }
  if (f.kind === "notice") {
    return { icon: f.status === "safety" ? "⚠" : "🛠", title: f.title,
      sub: `${t(`notice.cat.${f.status}` as StringKey)} · ${f.area_name ?? t("notice.everyone")}`, to: `/app/announcements/${f.id}` };
  }
  if (f.kind === "event") {
    const d = new Date(f.created_at);
    return { icon: "📅", title: f.title,
      sub: `${t("map.layer.events")} · ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${f.area_name ?? ""}`,
      to: `/app/events/${f.id}` };
  }
  return { icon: LEVEL_ICON[f.level], title: t(`cat.${f.title}` as StringKey),
    sub: `${t(`level.${f.level}` as StringKey)} · ${f.area_name ?? t("issue.nearby")}`, to: `/app/issues/${f.id}` };
}

/** The top of the ordered feed (emergencies first, then notices, then the rest). Short version for the Residence tab. */
export default function HappeningNow({ limit = 4 }: { limit?: number }) {
  const { t } = useI18n();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [sos, setSos] = useState<PublicEmergency[]>([]);
  useEffect(() => {
    const load = () => Promise.all([feedOrdered(limit), activeEmergencies()])
      .then(([f, e]) => { setItems(f); setSos(e); }).catch(() => setItems((x) => x ?? []));
    void load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [limit]);
  if (!items) return <div className="card muted">{t("common.loading")}</div>;
  if (items.length === 0) return <div className="card muted">{t("res.happeningEmpty")}</div>;
  return (
    <div className="list">
      {items.map((f) => {
        const r = feedRowParts(f, sos, t);
        return (
          <Link key={`${f.kind}-${f.id}`} to={r.to} className={`list-row feed-row tier-${f.tier} kind-${f.kind}`}>
            <span className={`feed-dot lvl-${f.level}`} aria-hidden="true">{r.icon}</span>
            <span className="grow">
              {r.title}
              <span className="small muted" style={{ display: "block", fontWeight: 600 }}>{r.sub}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
