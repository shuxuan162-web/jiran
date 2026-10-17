import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loadNotifications, markAllRead, type Notice } from "../../features/issues/api";
import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../components/ui/parts";
import Announcements from "./info/Announcements";

/** Notification centre: personal updates (bell) and official announcements, in two tabs. */
export default function Notifications() {
  const { t } = useI18n();
  useTitle(t("notif.title"));
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "announcements" ? "announcements" : "updates";
  const [list, setList] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadNotifications().then(setList).catch(() => { setFailed(true); setList([]); });
  }, []);

  async function readAll() {
    await markAllRead();
    setList((l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
  }

  const unread = list?.some((n) => !n.read_at);
  return (
    <main className="screen">
      <TopBar title={t("notif.title")} back
        right={tab === "updates" && unread ? <button className="link-btn" onClick={readAll}>{t("notif.markAll")}</button> : undefined} />
      <div className="tabs" role="tablist" aria-label={t("notif.title")}>
        {(["updates", "announcements"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k}
            onClick={() => setParams(k === "updates" ? {} : { tab: k }, { replace: true })}>
            {t(k === "updates" ? "notif.tabUpdates" : "notif.tabAnnouncements")}
          </button>
        ))}
      </div>
      {tab === "announcements" ? <Announcements embedded /> : (
        <>
          {failed && <Banner kind="error">{t("err.network")}</Banner>}
          {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("notif.empty")}</div> : (
            <div className="list">
              {list.map((n) => (
                <Link key={n.id} to={n.link ?? "#"} className={`notice-row${n.read_at ? " read" : ""}`}>
                  <span className="dot" aria-hidden="true" />
                  <span className="grow">
                    <strong style={{ display: "block" }}>{n.title}{!n.read_at && <span className="sr-only"> ({t("notif.unread")})</span>}</strong>
                    {n.body && <span style={{ display: "block" }}>{n.body}</span>}
                    <span className="small muted">{new Date(n.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
