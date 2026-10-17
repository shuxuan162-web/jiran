import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { markNewsletterRead, newsletters, type Newsletter } from "../../../features/info/api";
import { useI18n, type StringKey } from "../../../i18n";
import { useTitle } from "../../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { IconCheck } from "../../../components/ui/Icons";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
const dayTime = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The five sections, shared by the resident reader and the management preview. */
export function NewsletterBody({ n, linkBase = "/app" }: { n: Newsletter; linkBase?: string }) {
  const { t } = useI18n();
  const s = n.sections;
  const Section = ({ title, empty, children, count }: { title: StringKey; empty: StringKey; children: React.ReactNode; count: number }) => (
    <section className="nl-section">
      <h2>{t(title)}</h2>
      {count === 0 ? <p className="muted">{t(empty)}</p> : children}
    </section>
  );
  return (
    <>
      {n.intro && <p style={{ fontSize: "1.0625rem" }}>{n.intro}</p>}
      <Section title="nl.announcements" empty="nl.noAnnouncements" count={s.announcements?.length ?? 0}>
        <ul className="nl-list">{s.announcements.map((a) => (
          <li key={a.id}><Link to={`${linkBase}/announcements/${a.id}`}>{a.title}</Link> <span className="small muted">· {a.source}</span></li>))}</ul>
      </Section>
      <Section title="nl.maintenance" empty="nl.noMaintenance" count={s.maintenance?.length ?? 0}>
        <ul className="nl-list">{s.maintenance.map((a) => (
          <li key={a.id}><Link to={`${linkBase}/announcements/${a.id}`}>{a.title}</Link>
            {a.starts_at && <span className="small muted"> · {dayTime(a.starts_at)}</span>}</li>))}</ul>
      </Section>
      <Section title="nl.events" empty="nl.noEvents" count={s.events?.length ?? 0}>
        <ul className="nl-list">{s.events.map((e) => (
          <li key={e.id}><Link to={`${linkBase}/events/${e.id}`}>{e.title}</Link> <span className="small muted">· {day(e.starts_at)} · {e.location}</span></li>))}</ul>
      </Section>
      <Section title="nl.resolved" empty="nl.noResolved" count={s.resolved?.count ?? 0}>
        <p style={{ margin: "0 0 6px", fontWeight: 800 }}>{t("nl.resolvedN", { n: s.resolved.count })}</p>
        <ul className="nl-list">{s.resolved.items.map((i) => (
          <li key={i.id}><Link to={`${linkBase}/issues/${i.id}`}>{t(`cat.${i.category}` as StringKey)}</Link>
            <span className="small muted"> · {i.area ?? ""} · {i.ref_no}</span></li>))}</ul>
      </Section>
      <Section title="nl.topPosts" empty="nl.noPosts" count={s.top_posts?.length ?? 0}>
        <ul className="nl-list">{s.top_posts.map((p) => (
          <li key={p.id}><Link to={`${linkBase}/community/${p.id}`}>“{p.snippet}”</Link>
            <span className="small muted"> · {p.nickname ?? t("post.aNeighbour")} · {t("nl.helpfulN", { n: p.helpful })}</span></li>))}</ul>
      </Section>
    </>
  );
}

/** Newsletter reader: latest issue (or a given one); marks itself read when you reach the end. */
export default function NewsletterReader() {
  const { id } = useParams();
  const { t } = useI18n();
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [read, setRead] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const n = list ? (id ? list.find((x) => x.id === id) : list[0]) ?? null : undefined;
  useTitle(n?.title ?? t("nl.title"));

  useEffect(() => { newsletters().then(setList).catch(() => { setFailed(true); setList([]); }); }, []);
  useEffect(() => { setRead(!!n?.is_read); }, [n?.id, n?.is_read]);
  useEffect(() => {
    if (!n || n.is_read || !end.current) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { void markNewsletterRead(n.id).then(() => setRead(true)); io.disconnect(); }
    }, { threshold: 1 });
    io.observe(end.current);
    return () => io.disconnect();
  }, [n]);

  return (
    <main className="screen">
      <TopBar title={t("nl.title")} back="/app/residence" />
      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {n === undefined ? <Spinner /> : !n ? <div className="card muted">{t("nl.none")}</div> : (
        <article className="card newsletter">
          <p className="small muted" style={{ margin: 0 }}>{t("nl.week", { date: day(n.week_start) })}</p>
          <h1 style={{ fontSize: "1.5rem", margin: "6px 0 10px" }}>{n.title}</h1>
          <NewsletterBody n={n} />
          <div ref={end} className="nl-end">
            {read ? <span className="row" style={{ gap: 6, fontWeight: 800 }}><IconCheck width={20} /> {t("nl.read")}</span> : <span className="muted">{t("nl.endHint")}</span>}
          </div>
        </article>
      )}
      {list && list.length > 1 && (
        <>
          <h2 className="section">{t("nl.past")}</h2>
          <div className="list">
            {list.filter((x) => x.id !== n?.id).map((x) => (
              <Link key={x.id} to={`/app/newsletter/${x.id}`} className={`notice-row${x.is_read ? " read" : ""}`}>
                <span className="dot" aria-hidden="true" />
                <span className="grow"><strong style={{ display: "block" }}>{x.title}</strong><span className="small muted">{t("nl.week", { date: day(x.week_start) })}</span></span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
