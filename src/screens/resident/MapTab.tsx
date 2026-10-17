import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { issueFeed, type IssueRow } from "../../features/issues/api";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { priorityLevel } from "../../lib/scoring/labels";
import LeafletMap, { type MapPin } from "../../lib/map/LeafletMap";
import { Avatar, Banner, Spinner } from "../../components/ui/parts";
import { IssueCard, NotificationBell, issuePinHtml } from "../../components/issues";

/** Map tab (home). Phase 2: open issues on a live map with a list twin. Layers, SOS and the
 *  social layer arrive in phase 3 on top of this. */
export default function MapTab() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { profile } = useAuth();
  useTitle(t("nav.map"));
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try { setIssues(await issueFeed("open", 100)); setFailed(false); setUpdated(new Date()); }
    catch { setFailed(true); setIssues((x) => x ?? []); }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [load]);

  const pins: MapPin[] = useMemo(() => (issues ?? []).map((i) => {
    const lvl = priorityLevel(i.p);
    return {
      id: i.id, lat: i.lat, lng: i.lng, html: issuePinHtml(lvl), z: Math.round((i.p ?? 0) * 10),
      label: `${i.ref_no}: ${t(`level.${lvl}` as StringKey)}`, onClick: () => nav(`/app/issues/${i.id}`),
    };
  }), [issues, nav, t]);

  return (
    <main className="screen">
      <header className="topbar">
        {profile && <Avatar name={profile.nickname} config={profile.avatar_config} size={44} />}
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{profile?.nickname}</div>
          <div className="muted small">{t("map.title")}</div>
        </div>
        <NotificationBell />
      </header>

      <LeafletMap label={t("map.title")} height="52vh" pins={pins} />
      <p className="small muted" style={{ margin: "6px 0 0" }} aria-live="polite">
        {updated ? t("map.updated", { time: updated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) }) : t("common.loading")}
      </p>

      <h2 className="section">{t("map.topIssues")}</h2>
      {failed && <div style={{ marginBottom: 12 }}><Banner kind="error">{t("err.network")}</Banner></div>}
      {!issues ? <Spinner /> : issues.length === 0 ? <div className="card muted">{t("issues.emptyOpen")}</div> : (
        <>
          {issues.slice(0, 5).map((i) => <IssueCard key={i.id} issue={i} />)}
          <Link to="/app/issues" className="btn btn-ghost" style={{ marginTop: 12 }}>{t("map.seeAll", { n: issues.length })}</Link>
        </>
      )}
      <Link to="/app/report" className="fab">+ {t("issues.report")}</Link>
    </main>
  );
}
