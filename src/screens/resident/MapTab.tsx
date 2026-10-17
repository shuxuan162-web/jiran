import { useEffect, useState } from "react";
import { useAuth } from "../../features/auth/AuthProvider";
import { loadAreas, type AreaRow } from "../../features/auth/onboarding";
import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { Avatar, Banner, Spinner } from "../../components/ui/parts";
import { IconBell, IconPin } from "../../components/ui/Icons";

const KIND_TINT: Record<string, string> = {
  precinct: "var(--color-tint-orange)", estate: "var(--color-tint-amber)", park: "var(--color-tint-green)",
  commercial: "var(--color-tint-blue)", business: "var(--color-tint-purple)",
};

/** Map tab (home). Phase 1: a list twin of the map; the live HERE map lands in phase 3. */
export default function MapTab() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("nav.map"));
  const [areas, setAreas] = useState<AreaRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { loadAreas().then(setAreas).catch(() => setFailed(true)); }, []);

  return (
    <main className="screen">
      <header className="topbar">
        {profile && <Avatar name={profile.nickname} config={profile.avatar_config} size={44} />}
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{profile?.nickname}</div>
          <div className="muted small">{t("map.title")}</div>
        </div>
        <button className="icon-btn" aria-label="Notifications"><IconBell /></button>
      </header>

      <div className="card" style={{ background: "linear-gradient(160deg, var(--color-map-green), var(--color-lake))", marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>{t("map.soonTitle")}</h2>
        <p style={{ marginBottom: 0 }}>{t("map.soonBody")}</p>
      </div>

      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {!areas && !failed && <Spinner />}
      {areas && (
        <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {areas.map((a) => (
            <li key={a.id} className="list-row" style={{ cursor: "default" }}>
              <span className="ico" style={{ background: KIND_TINT[a.kind] ?? "var(--color-tint-amber)" }}><IconPin /></span>
              <span className="grow">
                {a.name}
                <span className="muted small" style={{ display: "block", fontWeight: 600 }}>
                  {a.id === profile?.home_area_id ? t("map.yourArea") + " · " : ""}
                  {a.center_lat === null ? t("map.unverified") : a.kind}
                </span>
              </span>
              {a.id === profile?.home_area_id && <span className="chip green">{t("map.yourArea")}</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
