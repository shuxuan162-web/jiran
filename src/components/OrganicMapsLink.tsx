import { useI18n } from "../i18n";
import { ORGANIC_MAPS_SITE, omPlaceLink, omRouteLink, type OmRouteType } from "../lib/map/organicMaps";

/**
 * "Open in Organic Maps" (and directions when we know where you are). Organic Maps is a free,
 * offline OpenStreetMap app for Android and iOS; Jiran only hands it a place, nothing else is shared.
 */
export default function OrganicMapsLink({ lat, lng, name, from, type = "pedestrian", compact = false }: {
  lat: number; lng: number; name: string; from?: { lat: number; lng: number } | null; type?: OmRouteType; compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={compact ? "om-links compact" : "om-links"}>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <a className="btn btn-ghost btn-small om-btn" href={omPlaceLink(lat, lng, name)} target="_blank" rel="noreferrer">
          <span className="om-dot" aria-hidden="true" /> {t("om.open")}
        </a>
        {from && (
          <a className="btn btn-ghost btn-small om-btn" href={omRouteLink({ ...from, name: t("om.myLocation") }, { lat, lng, name }, type)}>
            {t("om.route")}
          </a>
        )}
      </div>
      {!compact && (
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {t("om.note")} <a href={ORGANIC_MAPS_SITE} target="_blank" rel="noreferrer">organicmaps.app</a>
        </p>
      )}
    </div>
  );
}
