import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../features/auth/AuthProvider";
import { communityFeed, eventsList, newsletters, type EventRow, type Newsletter, type Post } from "../../features/info/api";
import { myRewards, type Rewards } from "../../features/rewards/api";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { NotificationBell } from "../../components/issues";
import SosButton from "../../components/SosButton";
import HappeningNow from "../../components/HappeningNow";
import { PostCard } from "./community/Community";
import { EventCard } from "./events/Events";
import {
  IconAlert, IconBell, IconCalendar, IconChat, IconClipboard, IconHelp, IconMail, IconMegaphone, IconQR, IconReceipt, IconSOS, IconTrophy, IconWrench,
} from "../../components/ui/Icons";

const TILES: { key: StringKey; to: string; Icon: typeof IconBell; tint: string; ink: string; ownerOnly?: boolean }[] = [
  { key: "res.tile.announcements", to: "/app/announcements", Icon: IconMegaphone, tint: "var(--color-tint-red)", ink: "var(--color-red)" },
  { key: "res.tile.services", to: "/app/services", Icon: IconWrench, tint: "var(--color-tint-blue)", ink: "#1F5A93" },
  { key: "res.tile.complaint", to: "/app/issues", Icon: IconAlert, tint: "var(--color-tint-orange)", ink: "#B5400C" },
  { key: "res.tile.feedback", to: "/app/feedback", Icon: IconChat, tint: "var(--color-tint-purple)", ink: "#5B3B8C" },
  { key: "res.tile.emergency", to: "/app/emergency", Icon: IconSOS, tint: "var(--color-tint-red)", ink: "var(--color-urgent)" },
  { key: "res.tile.faq", to: "/app/faq", Icon: IconHelp, tint: "var(--color-tint-green)", ink: "var(--color-success)" },
  { key: "res.tile.events", to: "/app/events", Icon: IconCalendar, tint: "var(--color-tint-amber)", ink: "#8A5300" },
  { key: "res.tile.billing", to: "/app/billing", Icon: IconReceipt, tint: "var(--color-tint-blue)", ink: "#1F5A93", ownerOnly: true },
  { key: "res.tile.qr", to: "/app/scan", Icon: IconQR, tint: "var(--color-tint-orange)", ink: "#B5400C" },
];

export default function ResidenceTab() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("nav.residence"));
  const tiles = TILES.filter((x) => !x.ownerOnly || profile?.role === "owner");
  const [nl, setNl] = useState<Newsletter | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [rw, setRw] = useState<Rewards | null>(null);

  useEffect(() => {
    newsletters().then((l) => setNl(l[0] ?? null)).catch(() => setNl(null));
    communityFeed("all", 3).then(setPosts).catch(() => setPosts([]));
    eventsList("upcoming").then((e) => setEvents(e.slice(0, 2))).catch(() => setEvents([]));
    myRewards().then(setRw).catch(() => setRw(null));
  }, []);

  return (
    <main className="screen">
      <header className="topbar">
        <h1 className="grow">{t("res.greeting", { name: profile?.nickname ?? "" })}</h1>
        <NotificationBell />
      </header>

      <SosButton variant="big" />
      <p className="small muted" style={{ margin: "6px 0 0" }}>{t("sos.bigHint")}</p>

      <h2 className="section">{t("res.happening")}</h2>
      <HappeningNow />

      <h2 className="section">{t("nav.residence")}</h2>
      <div className="tiles">
        {tiles.map(({ key, to, Icon, tint, ink }) => (
          <Link key={to} to={to} className="tile" style={{ background: tint, color: "var(--color-ink)" }}>
            <Icon style={{ color: ink }} />
            <span>{t(key)}</span>
          </Link>
        ))}
      </div>

      {nl !== undefined && (
        <Link to={nl ? `/app/newsletter/${nl.id}` : "/app/newsletter"} className="card row newsletter-card" style={{ textDecoration: "none", color: "inherit", marginTop: 16 }}>
          <IconMail style={{ width: 30, height: 30, color: "var(--color-red)", flex: "none" }} />
          <span className="grow">
            <strong style={{ display: "block" }}>{nl ? nl.title : t("nl.title")}</strong>
            <span className="small muted">{nl ? (nl.is_read ? t("nl.readAgain") : t("nl.newIssue")) : t("nl.none")}</span>
          </span>
          {nl && !nl.is_read && <span className="chip red">{t("nl.new")}</span>}
        </Link>
      )}

      <Link to="/app/rewards" className="card row" style={{ textDecoration: "none", color: "inherit", marginTop: 16 }}>
        <IconClipboard style={{ width: 28, height: 28, color: "var(--color-orange)", flex: "none" }} />
        <span className="grow">
          <strong style={{ display: "block" }}>{t("res.quests")}</strong>
          <span className="small muted">{rw
            ? t("res.questsLine", { done: rw.quests.filter((q) => q.progress >= q.target).length, total: rw.quests.length, level: rw.level, xp: rw.xp })
            : t("common.loading")}</span>
        </span>
        <IconTrophy style={{ width: 24, height: 24, color: "var(--color-amber)", flex: "none" }} />
      </Link>

      <div className="row section-head">
        <h2 className="section grow">{t("res.feed")}</h2>
        <Link to="/app/community" className="link-btn">{t("res.seeAll")}</Link>
      </div>
      {!posts ? <div className="card muted">{t("common.loading")}</div> : posts.length === 0 ? (
        <div className="card muted">{t("community.empty")}</div>
      ) : posts.map((p) => <PostCard key={p.id} p={p} />)}

      <div className="row section-head">
        <h2 className="section grow">{t("res.events")}</h2>
        <Link to="/app/events" className="link-btn">{t("res.seeAll")}</Link>
      </div>
      {!events ? <div className="card muted">{t("common.loading")}</div> : events.length === 0 ? (
        <div className="card muted">{t("event.empty.upcoming")}</div>
      ) : events.map((e) => <EventCard key={e.id} e={e} />)}

      <section className="support-card" aria-labelledby="support-h">
        <h2 id="support-h">{t("support.title")}</h2>
        <div className="support-grid">
          <div>
            <span className="support-label">{t("support.tollFree")}</span>
            <a className="support-number" href="tel:+1800881118">1-800-88-1118</a>
            <span className="small">{t("support.hours")}</span>
          </div>
          <div>
            <span className="support-label">{t("support.outside")}</span>
            <a className="support-number" href="tel:+60378495000">+603-7849 5000</a>
          </div>
        </div>
        <p className="small" style={{ margin: "10px 0 0", opacity: 0.9 }}>{t("support.note")}</p>
      </section>

      <Link to="/app/report" className="fab">+ {t("issues.report")}</Link>
    </main>
  );
}
