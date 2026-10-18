import { useMemo, useState } from "react";
import { MALL, MALL_CATEGORIES, STORES, type MallCategory } from "../../../data/mall";
import { useI18n, type StringKey } from "../../../i18n";
import { useTitle } from "../../../lib/useTitle";
import { omPlaceLink } from "../../../lib/map/organicMaps";
import { TopBar } from "../../../components/ui/parts";
import { NotificationBell } from "../../../components/issues";
import { IconCalendar, IconMail, IconPin } from "../../../components/ui/Icons";

type Tab = "shops" | "plan" | "visit";

/** Elmina Lakeside Mall: hours, getting here, and the store directory (names and lots from the official page). */
export default function Mall() {
  const { t } = useI18n();
  useTitle(t("mall.title"));
  const [tab, setTab] = useState<Tab>("shops");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<MallCategory | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of STORES) c[s.cat] = (c[s.cat] ?? 0) + 1;
    return c;
  }, []);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return STORES.filter((s) => (cat === "all" || s.cat === cat) && (!term || s.name.toLowerCase().includes(term) || (s.lot ?? "").toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [q, cat]);
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${MALL.name}, ${MALL.address.join(", ")}`)}`;

  return (
    <main className="screen">
      <TopBar title={t("mall.title")} right={<NotificationBell />} />
      <section className="mall-hero">
        <h2>{MALL.name}</h2>
        <p>{MALL.blurb}</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="mall-pill"><IconCalendar width={16} /> {MALL.hours}</span>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label={t("mall.title")} style={{ marginTop: 12 }}>
        {(["shops", "plan", "visit"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{t(`mall.tab.${k}` as StringKey)}</button>
        ))}
      </div>

      {tab === "shops" && (
        <>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("mall.search")} aria-label={t("mall.search")} />
          <div className="chip-row scroll-row" role="group" aria-label={t("mall.categories")} style={{ margin: "10px 0" }}>
            <button className="chip-btn" aria-pressed={cat === "all"} onClick={() => setCat("all")}>{t("mall.cat.all")} <span className="count">{STORES.length}</span></button>
            {MALL_CATEGORIES.filter((c) => counts[c]).map((c) => (
              <button key={c} className="chip-btn" aria-pressed={cat === c} onClick={() => setCat(c)}>{t(`mall.cat.${c}` as StringKey)} <span className="count">{counts[c]}</span></button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>{t("mall.catNote")}</p>
          {shown.length === 0 ? <div className="card muted">{t("mall.none")}</div> : (
            <ul className="list store-list" aria-live="polite">
              {shown.map((s) => (
                <li key={s.name} className="list-row">
                  <span className="store-lot" aria-label={s.lot ? t("mall.lotAria", { lot: s.lot }) : undefined}>{s.lot ?? "—"}</span>
                  <span className="grow">
                    <strong style={{ display: "block" }}>{s.name}</strong>
                    <span className="small muted">{t(`mall.cat.${s.cat}` as StringKey)}{s.lot?.startsWith("GF") ? ` · ${t("mall.gf")}` : ""}</span>
                  </span>
                  {s.soon && <span className="chip">{t("common.comingSoon")}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>{t("mall.dirSource", { date: MALL.checked })} <a href={MALL.url} target="_blank" rel="noreferrer">{t("mall.official")}</a></p>
        </>
      )}

      {tab === "plan" && (
        <section className="card">
          <h3>{t("mall.planTitle")}</h3>
          <p>{t("mall.planBody")}</p>
          <ul className="small" style={{ paddingLeft: 18 }}>
            <li>{t("mall.planGF")}</li>
            <li>{t("mall.planOther")}</li>
          </ul>
          <a className="btn btn-secondary btn-small" href={MALL.url} target="_blank" rel="noreferrer">{t("mall.planOpen")}</a>
        </section>
      )}

      {tab === "visit" && (
        <section className="card">
          <h3>{t("mall.address")}</h3>
          <p style={{ margin: "0 0 8px" }}>{MALL.address.map((l) => <span key={l} style={{ display: "block" }}>{l}</span>)}</p>
          <p className="row" style={{ gap: 6 }}><IconCalendar width={18} /> {MALL.hours}</p>
          <p className="row" style={{ gap: 6 }}><IconMail width={18} /> <a href={`mailto:${MALL.email}`}>{MALL.email}</a></p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <a className="btn btn-primary btn-small" href={gmaps} target="_blank" rel="noreferrer"><IconPin width={18} /> {t("mall.googleMaps")}</a>
            <a className="btn btn-ghost btn-small" href={omPlaceLink(MALL.lat, MALL.lng, MALL.name)} target="_blank" rel="noreferrer">{t("om.open")}</a>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>{t("mall.noPhone")}</p>
        </section>
      )}
    </main>
  );
}
