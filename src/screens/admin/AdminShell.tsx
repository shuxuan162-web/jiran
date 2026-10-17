import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type StringKey } from "../../i18n";
import { DemoBanner } from "../../components/ui/parts";
import {
  IconAlert, IconCalendar, IconChart, IconClipboard, IconHelp, IconList, IconLogout, IconMegaphone, IconPin,
  IconPlay, IconReceipt, IconShield, IconStar, IconWrench, IconHeart,
} from "../../components/ui/Icons";

type Item = { to: string; key: StringKey; Icon: typeof IconAlert; staff?: boolean };
// staff: true = also visible to the security desk. Everything else is management only.
const ITEMS: Item[] = [
  { to: "/admin/urgent", key: "admin.nav.urgent", Icon: IconAlert, staff: true },
  { to: "/admin/issues", key: "admin.nav.issues", Icon: IconList },
  { to: "/admin/map", key: "admin.nav.map", Icon: IconPin, staff: true },
  { to: "/admin/publish", key: "admin.nav.publish", Icon: IconMegaphone },
  { to: "/admin/events", key: "admin.nav.events", Icon: IconCalendar },
  { to: "/admin/moderation", key: "admin.nav.moderation", Icon: IconShield },
  { to: "/admin/analytics", key: "admin.nav.analytics", Icon: IconChart },
  { to: "/admin/verifications", key: "admin.nav.verifications", Icon: IconClipboard },
  { to: "/admin/services", key: "admin.nav.services", Icon: IconWrench },
  { to: "/admin/billing", key: "admin.nav.billing", Icon: IconReceipt },
  { to: "/admin/surveys", key: "admin.nav.surveys", Icon: IconHelp },
  { to: "/admin/content", key: "admin.nav.content", Icon: IconStar },
  { to: "/admin/health", key: "admin.nav.health", Icon: IconHeart, staff: true },
  { to: "/admin/demo", key: "admin.nav.demo", Icon: IconPlay },
];

export default function AdminShell() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();
  const isMgmt = profile?.role === "management";
  return (
    <>
      <DemoBanner />
      <div className="admin">
        <aside className="admin-side">
          <div className="brand"><img src="/favicon.svg" width={32} height={32} alt="" /> Jiran Admin</div>
          <nav aria-label="Admin">
            {ITEMS.filter((i) => isMgmt || i.staff).map(({ to, key, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "active" : "")}><Icon />{t(key)}</NavLink>
            ))}
          </nav>
          <div className="who">
            {profile?.nickname} · {profile?.role === "security" ? "Security desk" : "Management"}
            <button className="btn btn-ghost btn-small" style={{ marginTop: 12, color: "#fff", borderColor: "#5E524C", width: "100%" }}
              onClick={() => signOut()}><IconLogout width={18} /> {t("admin.signOut")}</button>
          </div>
        </aside>
        <main className="admin-main"><Outlet /></main>
      </div>
    </>
  );
}
