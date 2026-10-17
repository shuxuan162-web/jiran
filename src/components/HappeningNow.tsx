import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { activeEmergencies, feedOrdered, type FeedItem, type PublicEmergency } from "../features/sos/api";
import { useI18n, type StringKey } from "../i18n";
import { LEVEL_ICON } from "../lib/scoring/labels";

/** The top of the ordered feed (emergencies always first). Short version for the Residence tab. */
export default function HappeningNow({ limit = 3 }: { limit?: number }) {
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
        const e = f.kind === "emergency" ? sos.find((x) => x.id === f.id) : undefined;
        const to = f.kind === "emergency" ? (e?.is_mine ? `/app/sos/${f.id}` : "/app/map") : `/app/issues/${f.id}`;
        return (
          <Link key={f.id} to={to} className={`list-row feed-row tier-${f.tier}`}>
            <span className={`feed-dot lvl-${f.level}`} aria-hidden="true">{f.kind === "emergency" ? "!" : LEVEL_ICON[f.level]}</span>
            <span className="grow">
              {f.kind === "emergency" ? t(`sosType.${e?.type ?? "unspecified"}` as StringKey) : t(`cat.${f.title}` as StringKey)}
              <span className="small muted" style={{ display: "block", fontWeight: 600 }}>
                {f.kind === "emergency" ? t("map.tierEmergency") : t(`level.${f.level}` as StringKey)} · {f.area_name ?? t("issue.nearby")}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
