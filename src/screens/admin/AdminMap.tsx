import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { issueFeed, type IssueRow } from "../../features/issues/api";
import { loadAreaShapes, urgentQueue, type UrgentRow } from "../../features/sos/api";
import { supabase } from "../../lib/supabase";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { priorityLevel } from "../../lib/scoring/labels";
import MapView from "../../lib/map/MapView";
import { type AreaShape, type MapPin } from "../../lib/map/LeafletMap";
import { issuePinHtml } from "../../components/issues";
import { Banner } from "../../components/ui/parts";

/** Staff map: exact SOS locations on top, open issues underneath, the township sections drawn. */
export default function AdminMap() {
  const { t } = useI18n();
  const nav = useNavigate();
  useTitle(t("admin.nav.map"));
  const [areas, setAreas] = useState<AreaShape[]>([]);
  const [sos, setSos] = useState<UrgentRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try { const [s, i] = await Promise.all([urgentQueue(false), issueFeed("open", 200)]); setSos(s); setIssues(i); setFailed(false); }
    catch { setFailed(true); }
  }, []);
  useEffect(() => {
    loadAreaShapes().then(setAreas).catch(() => {});
    void load();
    const poll = window.setInterval(load, 15000);
    const ch = supabase.channel(`amap-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emergencies" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "issues" }, () => void load())
      .subscribe();
    return () => { window.clearInterval(poll); void supabase.removeChannel(ch); };
  }, [load]);

  const pins: MapPin[] = useMemo(() => [
    ...issues.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, html: issuePinHtml(priorityLevel(i.p)), z: Math.round((i.p ?? 0) * 10),
      label: `${i.ref_no}: ${t(`cat.${i.category}` as StringKey)}`, onClick: () => nav(`/admin/issues/${i.id}`) })),
    ...sos.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, html: '<div class="pin pin-sos"><span>!</span></div>', size: [44, 52] as [number, number], z: 10000,
      label: `${s.ref_no}: ${t(`sosType.${s.type}` as StringKey)}`, onClick: () => nav("/admin/urgent") })),
  ], [issues, sos, nav, t]);

  return (
    <>
      <h1>{t("admin.nav.map")}</h1>
      <p className="muted" style={{ marginTop: -8 }}>{t("admin.map.lead", { sos: sos.length, issues: issues.length })}</p>
      {failed && <div style={{ marginBottom: 12 }}><Banner kind="error">{t("err.network")}</Banner></div>}
      <MapView label={t("admin.nav.map")} height="72vh" pins={pins} areas={areas} zoom={14} />
    </>
  );
}
