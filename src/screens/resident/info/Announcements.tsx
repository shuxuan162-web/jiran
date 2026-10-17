import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { announcement, markAnnouncementRead, myAnnouncements, type Announcement, type NoticeCategory } from "../../../features/info/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { useTitle } from "../../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { NotificationBell } from "../../../components/issues";
import OrganicMapsLink from "../../../components/OrganicMapsLink";
import { IconMegaphone, IconPin } from "../../../components/ui/Icons";

const CAT_CLASS: Record<NoticeCategory, string> = {
  safety: "lvl-high", maintenance: "lvl-medium", general: "blue", event: "green", community: "",
};
const CAT_ICON: Record<NoticeCategory, string> = { safety: "⚠", maintenance: "🛠", general: "ℹ", event: "📅", community: "👥" };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CategoryChip({ c }: { c: NoticeCategory }) {
  const { t } = useI18n();
  return <span className={`chip ${CAT_CLASS[c]}`}><span aria-hidden="true">{CAT_ICON[c]}</span> {t(`notice.cat.${c}` as StringKey)}</span>;
}

export function AnnouncementRow({ a }: { a: Announcement }) {
  const { t } = useI18n();
  return (
    <Link to={`/app/announcements/${a.id}`} className={`notice-row${a.is_read ? " read" : ""}`}>
      <span className="dot" aria-hidden="true" />
      <span className="grow">
        <span className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
          <CategoryChip c={a.category} />
          {a.pinned && <span className="chip">{t("notice.pinned")}</span>}
        </span>
        <strong style={{ display: "block" }}>{a.title}{!a.is_read && <span className="sr-only"> ({t("notif.unread")})</span>}</strong>
        <span className="small muted" style={{ display: "block" }}>
          {a.source_label} · {a.target_kind === "township" ? t("notice.everyone") : a.area_names.join(", ")} · {when(a.publish_at)}
        </span>
      </span>
    </Link>
  );
}

/** List of live notices for the resident's areas (the Announcements tile). */
export default function Announcements({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  useTitle(t("notice.title"));
  const [list, setList] = useState<Announcement[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { myAnnouncements().then(setList).catch(() => { setFailed(true); setList([]); }); }, []);

  const body = (
    <>
      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("notice.empty")}</div> : (
        <div className="list">{list.map((a) => <AnnouncementRow key={a.id} a={a} />)}</div>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>{t("notice.followHint")} <Link to="/app/profile/settings">{t("profile.settings")}</Link></p>
    </>
  );
  if (embedded) return body;
  return (
    <main className="screen">
      <TopBar title={t("notice.title")} back right={<NotificationBell />} />
      {body}
    </main>
  );
}

export function AnnouncementDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const [a, setA] = useState<Announcement | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useTitle(a?.title ?? t("notice.title"));
  useEffect(() => {
    announcement(id).then((x) => { setA(x); if (x && !x.is_read) void markAnnouncementRead(id); })
      .catch((e) => { setErr(t(errorKey(e))); setA(null); });
  }, [id, t]);

  return (
    <main className="screen">
      <TopBar title={t("notice.title")} back />
      {a === undefined ? <Spinner /> : !a ? <Banner kind="error">{err ?? t("err.not_found")}</Banner> : (
        <article className="card pop-in">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <CategoryChip c={a.category} />
            <span className="chip blue"><IconMegaphone width={16} /> {a.source_label}</span>
            {a.expired && <span className="chip">{t("notice.expired")}</span>}
          </div>
          <h1 style={{ fontSize: "1.5rem", margin: "12px 0 6px" }}>{a.title}</h1>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t("notice.posted", { time: when(a.publish_at) })}
            {a.starts_at && <> · {t("notice.from", { time: when(a.starts_at) })}</>}
            {a.ends_at && <> · {t("notice.until", { time: when(a.ends_at) })}</>}
          </p>
          {a.expired && <Banner kind="info">{t("notice.expiredLead")}</Banner>}
          <p style={{ whiteSpace: "pre-wrap" }}>{a.body}</p>
          <p className="row small" style={{ gap: 6 }}>
            <IconPin width={18} /> {a.target_kind === "township" ? t("notice.everyone") : a.area_names.join(", ")}
          </p>
          {a.lat != null && a.lng != null && <OrganicMapsLink lat={a.lat} lng={a.lng} name={a.title} />}
        </article>
      )}
    </main>
  );
}
