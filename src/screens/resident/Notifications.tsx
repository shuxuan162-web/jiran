import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadNotifications, markAllRead, type Notice } from "../../features/issues/api";
import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../components/ui/parts";

export default function Notifications() {
  const { t } = useI18n();
  useTitle(t("notif.title"));
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
        right={unread ? <button className="link-btn" onClick={readAll}>{t("notif.markAll")}</button> : undefined} />
      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("notif.empty")}</div> : (
        <div className="list">
          {list.map((n) => (
            <Link key={n.id} to={n.link ?? "#"} className={`notice-row${n.read_at ? " read" : ""}`}>
              <span className="dot" aria-hidden="true" />
              <span className="grow">
                <strong style={{ display: "block" }}>{n.title}{!n.read_at && <span className="sr-only"> (unread)</span>}</strong>
                {n.body && <span style={{ display: "block" }}>{n.body}</span>}
                <span className="small muted">{new Date(n.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
