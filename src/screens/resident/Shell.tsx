import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../../i18n";
import { IconBag, IconHouse, IconMegaphone, IconPerson, IconPin } from "../../components/ui/Icons";

/** Resident app frame: content + the fixed 5-tab bottom bar (Map in the centre). */
export default function Shell() {
  const { t } = useI18n();
  const tab = (to: string, label: string, Icon: typeof IconHouse) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")}>
      <Icon /><span>{label}</span>
    </NavLink>
  );
  return (
    <>
      <Outlet />
      <nav className="bottom-nav" aria-label="Main">
        {tab("/app/residence", t("nav.residence"), IconMegaphone)}
        {tab("/app/mall", t("nav.mall"), IconBag)}
        <NavLink to="/app/map" className={({ isActive }) => `map-tab${isActive ? " active" : ""}`}>
          <span className="map-pin"><IconPin /></span><span>{t("nav.map")}</span>
        </NavLink>
        {tab("/app/properties", t("nav.properties"), IconHouse)}
        {tab("/app/profile", t("nav.profile"), IconPerson)}
      </nav>
    </>
  );
}
