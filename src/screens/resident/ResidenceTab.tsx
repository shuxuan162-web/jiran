import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { NotificationBell } from "../../components/issues";
import {
  IconAlert, IconBell, IconCalendar, IconChat, IconClipboard, IconHelp, IconMegaphone, IconQR, IconReceipt, IconSOS, IconWrench,
} from "../../components/ui/Icons";

const TILES: { key: StringKey; slug: string; Icon: typeof IconBell; tint: string; ink: string; ownerOnly?: boolean }[] = [
  { key: "res.tile.announcements", slug: "announcements", Icon: IconMegaphone, tint: "var(--color-tint-red)", ink: "var(--color-red)" },
  { key: "res.tile.services", slug: "services", Icon: IconWrench, tint: "var(--color-tint-blue)", ink: "#1F5A93" },
  { key: "res.tile.complaint", slug: "complaint", Icon: IconAlert, tint: "var(--color-tint-orange)", ink: "#B5400C" },
  { key: "res.tile.feedback", slug: "feedback", Icon: IconChat, tint: "var(--color-tint-purple)", ink: "#5B3B8C" },
  { key: "res.tile.emergency", slug: "emergency", Icon: IconSOS, tint: "var(--color-tint-red)", ink: "var(--color-urgent)" },
  { key: "res.tile.faq", slug: "faq", Icon: IconHelp, tint: "var(--color-tint-green)", ink: "var(--color-success)" },
  { key: "res.tile.events", slug: "events", Icon: IconCalendar, tint: "var(--color-tint-amber)", ink: "#8A5300" },
  { key: "res.tile.billing", slug: "billing", Icon: IconReceipt, tint: "var(--color-tint-blue)", ink: "#1F5A93", ownerOnly: true },
  { key: "res.tile.qr", slug: "qr", Icon: IconQR, tint: "var(--color-tint-orange)", ink: "#B5400C" },
];

export default function ResidenceTab() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("nav.residence"));
  const tiles = TILES.filter((x) => !x.ownerOnly || profile?.role === "owner");

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="grow">{t("res.greeting", { name: profile?.nickname ?? "" })}</h1>
        <NotificationBell />
      </header>

      <Link to="/app/soon/emergency" className="sos-big"><IconSOS /> {t("res.sos")}</Link>

      <h2 className="section">{t("res.happening")}</h2>
      <div className="card muted">{t("res.happeningEmpty")}</div>

      <h2 className="section">{t("nav.residence")}</h2>
      <div className="tiles">
        {tiles.map(({ key, slug, Icon, tint, ink }) => (
          <Link key={slug} to={slug === "complaint" ? "/app/issues" : `/app/soon/${slug}`} className="tile" style={{ background: tint, color: "var(--color-ink)" }}>
            <Icon style={{ color: ink }} />
            <span>{t(key)}</span>
          </Link>
        ))}
      </div>
      <div style={{ height: 8 }} />
      <Link to="/app/soon/quests" className="card row" style={{ textDecoration: "none", color: "inherit", marginTop: 16 }}>
        <IconClipboard style={{ width: 28, height: 28, color: "var(--color-orange)" }} />
        <span className="grow" style={{ fontWeight: 800 }}>{t("res.quests")}</span>
        <span className="chip">{t("common.comingSoon")}</span>
      </Link>
      <Link to="/app/report" className="fab">+ {t("issues.report")}</Link>
    </main>
  );
}
