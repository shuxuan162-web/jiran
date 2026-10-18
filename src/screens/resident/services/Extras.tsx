import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import {
  FEEDBACK_TOPICS, addPlate, billState, myBills, myPlates, normalizePlate, plateOk, removePlate, sendFeedback,
  type Bill, type CarPlate, type FeedbackTopic,
} from "../../../features/services/api";
import { FAQS, searchFaq } from "../../../data/faq";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { readPref, writePref } from "../../../lib/prefs";
import { useTitle } from "../../../lib/useTitle";
import { Banner, Field, Spinner, TopBar } from "../../../components/ui/parts";
import { IconCar, IconX } from "../../../components/ui/Icons";

/** FAQ with a simple keyword helper; no match points to the contact numbers. */
export function Faq() {
  const { t } = useI18n();
  useTitle(t("faq.title"));
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const results = useMemo(() => searchFaq(q), [q]);
  return (
    <main className="screen">
      <TopBar title={t("faq.title")} back />
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("faq.search")} aria-label={t("faq.search")} />
      {q && results.length > 0 && <p className="small muted">{t("faq.best", { n: results.length })}</p>}
      {results.length === 0 ? (
        <section className="card" style={{ marginTop: 12 }}>
          <strong>{t("faq.noMatch")}</strong>
          <p className="small">{t("faq.noMatchLead")}</p>
          <a className="btn btn-primary btn-small" href="tel:+1800881118">1-800-88-1118</a>
        </section>
      ) : (
        <div className="list faq-list" style={{ marginTop: 12 }}>
          {results.map((f) => (
            <div key={f.id} className="faq-item">
              <button className="faq-q" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                <span className="grow">{f.q}</span><span aria-hidden="true">{open === f.id ? "−" : "+"}</span>
              </button>
              {open === f.id && (
                <div className="faq-a">
                  <p>{f.a}</p>
                  {f.link && <Link to={f.link.to} className="btn btn-ghost btn-small">{f.link.label}</Link>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>{t("faq.count", { n: FAQS.length })}</p>
    </main>
  );
}

/** Feedback to township management: topic, 1-5 stars, message, optional anonymity. */
export function Feedback() {
  const { t } = useI18n();
  useTitle(t("fb.title"));
  const [topic, setTopic] = useState<FeedbackTopic>("township");
  const [rating, setRating] = useState(0);
  const [msg, setMsg] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    if (!rating) { setErr(t("fb.needRating")); return; }
    setBusy(true); setErr(null);
    try { await sendFeedback(topic, rating, msg, anon); setDone(true); } catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }
  return (
    <main className="screen">
      <TopBar title={t("fb.title")} back />
      {done ? (
        <section className="card pop-in">
          <Banner kind="success">{t("fb.thanks")}</Banner>
          <p className="small">{t("fb.thanksLead")} <Link to="/app/report">{t("issues.report")}</Link></p>
          <button className="btn btn-ghost btn-small" onClick={() => { setDone(false); setRating(0); setMsg(""); }}>{t("fb.another")}</button>
        </section>
      ) : (
        <section className="card">
          <p className="muted" style={{ marginTop: 0 }}>{t("fb.lead")}</p>
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("fb.topicQ")}</legend>
            <div className="chip-row">{FEEDBACK_TOPICS.map((k) => <button key={k} type="button" className="chip-btn" aria-pressed={topic === k} onClick={() => setTopic(k)}>{t(`fb.topic.${k}` as StringKey)}</button>)}</div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
            <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("fb.ratingQ")}</legend>
            <div className="stars" role="radiogroup" aria-label={t("fb.ratingQ")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t("fb.stars", { n })}
                  className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
              ))}
              {rating > 0 && <span className="small muted" style={{ marginLeft: 8 }}>{t(`fb.r${rating}` as StringKey)}</span>}
            </div>
          </fieldset>
          <label className="field">
            <span className="label">{t("fb.message")} <span className="muted">({t("common.optional")})</span></span>
            <textarea className="textarea" value={msg} maxLength={1000} onChange={(e) => setMsg(e.target.value)} />
          </label>
          <label className="row" style={{ cursor: "pointer", minHeight: 48 }}>
            <span className="grow"><strong>{t("fb.anon")}</strong><span className="small muted" style={{ display: "block" }}>{t("fb.anonHint")}</span></span>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} style={{ width: 28, height: 28 }} />
          </label>
          {err && <Banner kind="error">{err}</Banner>}
          <button className="btn btn-primary" disabled={busy} onClick={send}>{busy ? t("common.loading") : t("fb.send")}</button>
        </section>
      )}
    </main>
  );
}

const BILL_ICON = { paid: "✓", overdue: "!", due_soon: "⏰", upcoming: "•" } as const;

/** Billing reminders: owners only (the database returns nothing to sub-owners), view only, no payment. */
export function Billing() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("bill.title"));
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [remind, setRemind] = useState(readPref("billRemind") !== "0");
  useEffect(() => { myBills().then(setBills).catch(() => setBills([])); }, []);
  if (profile?.role !== "owner") return <main className="screen"><TopBar title={t("bill.title")} back /><Banner kind="info">{t("bill.ownerOnly")}</Banner></main>;
  const open = (bills ?? []).filter((b) => !b.paid_at);
  const total = open.reduce((s, b) => s + b.amount, 0);
  const money = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <main className="screen">
      <TopBar title={t("bill.title")} back />
      {bills?.some((b) => b.is_demo) && <Banner kind="warn">{t("bill.demo")}</Banner>}
      {!bills ? <Spinner /> : (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <span className="small muted">{t("bill.outstanding")}</span>
            <div className="stat-value" style={{ fontSize: "2rem" }}>{money(total)}</div>
            <span className="small">{t("bill.openN", { n: open.length })}</span>
          </section>
          {bills.length === 0 ? <div className="card muted">{t("bill.none")}</div> : bills.map((b) => {
            const s = billState(b);
            return (
              <section key={b.id} className={`card bill bill-${s}`}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="bill-icon" aria-hidden="true">{BILL_ICON[s]}</span>
                  <span className="grow"><strong style={{ display: "block" }}>{t(`bill.kind.${b.kind}` as StringKey)}</strong><span className="small muted">{b.period}</span></span>
                  <strong>{money(b.amount)}</strong>
                </div>
                <p className="small" style={{ margin: "8px 0 0" }}>
                  <span className={`chip ${s === "paid" ? "green" : s === "overdue" ? "red" : s === "due_soon" ? "lvl-medium" : ""}`}>{t(`bill.state.${s}` as StringKey)}</span>{" "}
                  {b.paid_at ? t("bill.paidOn", { date: new Date(b.paid_at).toLocaleDateString() }) : t("bill.dueOn", { date: new Date(b.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) })}
                </p>
              </section>
            );
          })}
          <label className="row card" style={{ cursor: "pointer", minHeight: 48 }}>
            <span className="grow"><strong>{t("bill.remind")}</strong><span className="small muted" style={{ display: "block" }}>{t("bill.remindHint")}</span></span>
            <input type="checkbox" checked={remind} onChange={(e) => { setRemind(e.target.checked); writePref("billRemind", e.target.checked ? "1" : "0"); }} style={{ width: 28, height: 28 }} />
          </label>
          <p className="small muted">{t("bill.noPay")}</p>
        </>
      )}
    </main>
  );
}

/** Car plates: up to 5, own rows only. */
export function CarPlates() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("plates.title"));
  const [list, setList] = useState<CarPlate[] | null>(null);
  const [plate, setPlate] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = () => myPlates().then(setList).catch(() => setList([]));
  useEffect(() => { void load(); }, []);
  async function add() {
    if (!profile) return;
    if (!plateOk(plate)) { setErr(t("svc.errPlate")); return; }
    if ((list?.length ?? 0) >= 5) { setErr(t("plates.max")); return; }
    setErr(null);
    try { await addPlate(profile.id, plate, label); setPlate(""); setLabel(""); await load(); }
    catch (e) { const m = String((e as { message?: string }).message ?? ""); setErr(m.includes("duplicate") ? t("plates.dup") : t(errorKey(e))); }
  }
  return (
    <main className="screen">
      <TopBar title={t("plates.title")} back="/app/profile" />
      <p className="muted" style={{ marginTop: 0 }}>{t("plates.lead")}</p>
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("plates.none")}</div> : (
        <div className="list">
          {list.map((p) => (
            <div key={p.id} className="list-row">
              <span className="ico" style={{ background: "var(--color-tint-orange)" }}><IconCar /></span>
              <span className="grow"><span className="plate">{p.plate}</span>{p.label && <span className="small muted" style={{ display: "block" }}>{p.label}</span>}</span>
              <button className="icon-btn" aria-label={t("plates.remove", { plate: p.plate })} onClick={async () => { await removePlate(p.id).catch(() => {}); await load(); }}><IconX /></button>
            </div>
          ))}
        </div>
      )}
      <section className="card" style={{ marginTop: 12 }}>
        <Field label={t("svc.plate")} value={plate} maxLength={14} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="WXY 1234" />
        <Field label={t("plates.label")} optional value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder={t("plates.labelHint")} />
        {err && <Banner kind="error">{err}</Banner>}
        <button className="btn btn-primary btn-small" onClick={add} disabled={!normalizePlate(plate)}>{t("plates.add")}</button>
      </section>
    </main>
  );
}

/** Help, privacy and safety in one place. */
export function Help() {
  const { t } = useI18n();
  useTitle(t("help.title"));
  return (
    <main className="screen">
      <TopBar title={t("help.title")} back="/app/profile" />
      <div className="list">
        <Link to="/app/faq" className="list-row"><span className="grow"><strong>{t("faq.title")}</strong><span className="small muted" style={{ display: "block" }}>{t("help.faqSub")}</span></span></Link>
        <Link to="/app/feedback" className="list-row"><span className="grow"><strong>{t("fb.title")}</strong><span className="small muted" style={{ display: "block" }}>{t("help.fbSub")}</span></span></Link>
        <Link to="/app/profile/settings" className="list-row"><span className="grow"><strong>{t("help.privacy")}</strong><span className="small muted" style={{ display: "block" }}>{t("help.privacySub")}</span></span></Link>
        <Link to="/emails" className="list-row"><span className="grow"><strong>{t("profile.emails")}</strong><span className="small muted" style={{ display: "block" }}>{t("help.emailsSub")}</span></span></Link>
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("help.safetyTitle")}</h3>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>{t("help.s1")}</li><li>{t("help.s2")}</li><li>{t("help.s3")}</li><li>{t("help.s4")}</li>
        </ul>
      </section>
      <section className="card">
        <h3>{t("support.title")}</h3>
        <p style={{ margin: "0 0 4px" }}><a href="tel:+1800881118"><strong>1-800-88-1118</strong></a> · <span className="small">{t("support.hours")}</span></p>
        <p style={{ margin: 0 }}>{t("support.outside")}: <a href="tel:+60378495000"><strong>+603-7849 5000</strong></a></p>
      </section>
      <p className="small muted">{t("help.about")}</p>
    </main>
  );
}
