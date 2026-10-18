import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { listEnquiries, phoneOk, submitEnquiry, type Enquiry } from "../../../features/showroom/api";
import { PROPERTIES, PROPERTY_SOURCE, propertyBySlug, type Property, type PropertyKind } from "../../../data/properties";
import { LANDMARKS, TOWNSHIP_FACTS, TOWNSHIP_SOURCE } from "../../../data/landmarks";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { useTitle } from "../../../lib/useTitle";
import { isValidEmail } from "../../../lib/validation";
import MapView from "../../../lib/map/MapView";
import { Banner, Field, TopBar } from "../../../components/ui/parts";
import { NotificationBell } from "../../../components/issues";
import OrganicMapsLink from "../../../components/OrganicMapsLink";
import { IconHouse, IconPin } from "../../../components/ui/Icons";

const KINDS: PropertyKind[] = ["residential", "commercial", "industrial"];
const KIND_ICON: Record<PropertyKind, string> = { residential: "🏡", commercial: "🏬", industrial: "🏭" };

function PropertyCover({ p, big = false }: { p: Property; big?: boolean }) {
  return (
    <div className={`prop-cover kind-${p.kind}${big ? " big" : ""}`}>
      <span className="prop-cover-icon" aria-hidden="true">{KIND_ICON[p.kind]}</span>
      <span className="prop-cover-name">{p.name}</span>
      <span className="prop-cover-lines">{p.lines.map((l) => <span key={l}>{l}</span>)}</span>
    </div>
  );
}

/** Properties tab: the official City of Elmina listings by Residential / Commercial / Industrial, plus township facts. */
export default function Properties() {
  const { t } = useI18n();
  useTitle(t("props.title"));
  const [params, setParams] = useSearchParams();
  const kind = (KINDS.includes(params.get("tab") as PropertyKind) ? params.get("tab") : "residential") as PropertyKind;
  const list = PROPERTIES.filter((p) => p.kind === kind);

  return (
    <main className="screen">
      <TopBar title={t("props.title")} right={<NotificationBell />} />
      <h2 className="props-heading">{t("props.explore")} <span>{t("app.township")}</span></h2>

      <div className="folder-tabs" role="tablist" aria-label={t("props.title")}>
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""}
            onClick={() => setParams(k === "residential" ? {} : { tab: k }, { replace: true })}>{t(`props.kind.${k}` as StringKey)}</button>
        ))}
      </div>
      <div className="prop-panel">
        {list.map((p) => (
          <Link key={p.slug} to={`/app/properties/${p.slug}`} className="prop-card" aria-label={`${p.name}: ${p.lines.join(", ")}`}>
            <PropertyCover p={p} />
            <span className="prop-card-foot"><IconPin width={16} /> {p.place}<span className="grow" /> {t("props.details")} ›</span>
          </Link>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {t("props.source")} <a href={PROPERTY_SOURCE} target="_blank" rel="noreferrer">simedarbyproperty.com</a>
      </p>

      <h2 className="section">{t("props.about")}</h2>
      <div className="fact-grid">
        {TOWNSHIP_FACTS.map((f) => (
          <div key={f.label} className="fact"><strong>{f.value}<span> {f.unit}</span></strong><span>{f.label}</span></div>
        ))}
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {LANDMARKS.map((l) => (
          <Link key={l.slug} to={`/app/map?place=${l.slug}`} className="list-row">
            <span className="ico" style={{ background: "var(--color-tint-green)" }}><IconPin /></span>
            <span className="grow"><strong style={{ display: "block" }}>{l.name}</strong><span className="small muted">{l.blurb}</span></span>
          </Link>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        {t("props.factsSource")} <a href={TOWNSHIP_SOURCE} target="_blank" rel="noreferrer">simedarbyproperty.com/city-of-elmina</a>
      </p>
    </main>
  );
}

/** Ask about a property or ask for a viewing: name, mobile, email and consent, like the official site. */
function EnquiryForm({ p }: { p: Property }) {
  const { t } = useI18n();
  const { priv } = useAuth();
  const [kind, setKind] = useState<"enquiry" | "viewing">("viewing");
  const [name, setName] = useState(priv?.full_name ?? "");
  const [phone, setPhone] = useState(priv?.phone ?? "");
  const [email, setEmail] = useState(priv?.email ?? "");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<Enquiry[]>([]);
  useEffect(() => { listEnquiries(p.slug).then(setMine).catch(() => {}); }, [p.slug, done]);

  const nameErr = name.trim().length < 2 ? t("err.bad_name") : null;
  const phoneErr = !phoneOk(phone) ? t("err.bad_phone") : null;
  const emailErr = !isValidEmail(email) ? t("err.bad_email") : null;
  const ok = !nameErr && !phoneErr && !emailErr && consent;

  async function send() {
    setTouched(true);
    if (!ok) return;
    setBusy(true); setErr(null);
    try { const r = await submitEnquiry({ property: p.slug, kind, name, phone, email, consent }); setDone(r.ref); }
    catch (e) { setErr(t(errorKey(e))); }
    setBusy(false);
  }

  if (done) return (
    <section className="card enquiry-card" aria-live="polite">
      <Banner kind="success">{t("enq.sent", { ref: done })}</Banner>
      <p className="small" style={{ marginBottom: 0 }}>{t("enq.next")}</p>
    </section>
  );

  return (
    <section className="card enquiry-card" aria-labelledby="enq-h">
      <h2 id="enq-h" style={{ fontSize: "1.25rem" }}>{t("enq.title")}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{t("enq.lead")}</p>
      <div className="segmented" role="group" aria-label={t("enq.kindQ")} style={{ marginBottom: 12 }}>
        {(["viewing", "enquiry"] as const).map((k) => (
          <button key={k} type="button" className={`seg-btn${kind === k ? " on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(k === "viewing" ? "enq.viewing" : "enq.enquiry")}
          </button>
        ))}
      </div>
      <Field label={t("enq.name")} autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={touched ? nameErr : null} />
      <Field label={t("enq.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={16} placeholder="012-345 6789"
        onChange={(e) => setPhone(e.target.value)} error={touched ? phoneErr : null} />
      <Field label={t("enq.email")} type="email" inputMode="email" autoComplete="email" value={email} maxLength={160}
        onChange={(e) => setEmail(e.target.value)} error={touched ? emailErr : null} />
      <label className="row consent" style={{ alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 24, height: 24, flex: "none", marginTop: 2 }} />
        <span className="small">{t("enq.consent")} <a href="https://www.simedarbyproperty.com/privacy-notice/" target="_blank" rel="noreferrer">{t("enq.privacy")}</a>.</span>
      </label>
      {touched && !consent && <p className="error small" style={{ color: "var(--color-urgent)", fontWeight: 700 }}>{t("err.consent_required")}</p>}
      {err && <Banner kind="error">{err}</Banner>}
      <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={send}>{busy ? t("common.loading") : t("enq.submit")}</button>
      <p className="small muted" style={{ margin: "10px 0 0" }}>{t("enq.demo")}</p>
      {mine.length > 0 && (
        <p className="small" style={{ margin: "10px 0 0" }}>
          {t("enq.previous", { n: mine.length, status: t(`enq.status.${mine[0].status}` as StringKey) })}
        </p>
      )}
    </section>
  );
}

export function PropertyDetail() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const p = propertyBySlug(slug);
  const center = useMemo<[number, number]>(() => [p?.lat ?? 0, p?.lng ?? 0], [p?.lat, p?.lng]);
  useTitle(p?.name ?? t("props.title"));
  if (!p) return <main className="screen"><TopBar title={t("props.title")} back="/app/properties" /><Banner kind="error">{t("err.not_found")}</Banner></main>;

  return (
    <main className="screen">
      <TopBar title={t("props.title")} back={p.kind === "residential" ? "/app/properties" : `/app/properties?tab=${p.kind}`} />
      <PropertyCover p={p} big />
      <section className="card" style={{ marginTop: 12 }}>
        <span className="chip"><IconHouse width={14} /> {t(`props.kind.${p.kind}` as StringKey)}</span>
        <h1 style={{ fontSize: "1.5rem", margin: "8px 0 4px" }}>{p.name}</h1>
        <p className="row small muted" style={{ gap: 4, margin: "0 0 8px" }}><IconPin width={16} /> {p.place}, {t("app.township")}</p>
        <ul className="prop-facts">{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        {p.priceNote && <p className="small muted">{p.priceNote}</p>}
        <a className="btn btn-ghost btn-small" href={p.url} target="_blank" rel="noreferrer">{t("props.official")}</a>
      </section>

      <EnquiryForm p={p} />

      <h2 className="section">{t("props.where")}</h2>
      <MapView label={p.name} height={240} pins={[{ id: p.slug, lat: p.lat, lng: p.lng, html: '<div class="pin pin-prop"><span>🏠</span></div>', label: p.name }]}
        center={center} zoom={15} />
      {p.approximate && <p className="small muted">{t("props.approx")}</p>}
      <OrganicMapsLink lat={p.lat} lng={p.lng} name={p.name} type="vehicle" />
      <p className="small muted">{t("props.photos")} <Link to="/app/properties">{t("props.backAll")}</Link></p>
    </main>
  );
}
