import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../components/ui/parts";

interface Mail { id: string; created_at: string; kind: string; to_email: string; subject: string; body: string; link: string | null; }

/** Simulated email log: everything Jiran would have emailed to (or on behalf of) this user. */
export default function EmailLog() {
  const { t } = useI18n();
  useTitle(t("emails.title"));
  const [mails, setMails] = useState<Mail[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase.from("email_outbox").select("id,created_at,kind,to_email,subject,body,link")
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data, error }) => { if (error) setFailed(true); setMails((data as Mail[]) ?? []); });
  }, []);

  return (
    <main className="screen no-nav">
      <TopBar title={t("emails.title")} back />
      <Banner kind="info">{t("emails.lead")}</Banner>
      <div style={{ height: 16 }} />
      {failed && <Banner kind="error">{t("err.network")}</Banner>}
      {!mails ? <Spinner /> : mails.length === 0 ? <div className="card muted">{t("emails.empty")}</div> : (
        mails.map((m) => (
          <article key={m.id} className="card">
            <div className="row small muted" style={{ marginBottom: 6 }}>
              <span className="chip blue">{t("common.simulated")}</span>
              <span className="grow">To {m.to_email}</span>
              <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString()}</time>
            </div>
            <h3>{m.subject}</h3>
            <p style={{ marginBottom: m.link ? 12 : 0 }}>{m.body}</p>
            {m.link && <a href={m.link} className="btn btn-secondary btn-small">{t("emails.open")}</a>}
          </article>
        ))
      )}
    </main>
  );
}
