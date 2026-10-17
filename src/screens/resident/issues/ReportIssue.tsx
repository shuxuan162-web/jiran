import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { loadAreas, type AreaRow } from "../../../features/auth/onboarding";
import {
  loadCategories, reportIssue, similarIssues, toggleUpvote, uploadPhoto, type Category, type Similar,
} from "../../../features/issues/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { readPref, writePref } from "../../../lib/prefs";
import { fileProblem } from "../../../lib/validation";
import { useTitle } from "../../../lib/useTitle";
import { insideElmina } from "../../../lib/map/elmina";
import LeafletMap from "../../../lib/map/LeafletMap";
import { Banner, ProgressSteps, Spinner, TopBar } from "../../../components/ui/parts";
import { CategoryName, StatusChip } from "../../../components/issues";
import { IconCheck, IconPin, IconUpload, IconX } from "../../../components/ui/Icons";

const TOTAL = 4;
const DRAFT_KEY = "issueDraft";

interface Draft { lat: number | null; lng: number | null; landmark: string; category: string; description: string; anonymous: boolean }
const EMPTY: Draft = { lat: null, lng: null, landmark: "", category: "", description: "", anonymous: false };

function loadDraft(): Draft {
  try { return { ...EMPTY, ...(JSON.parse(readPref(DRAFT_KEY) ?? "{}") as Partial<Draft>) }; } catch { return EMPTY; }
}

const dist = (a: number, b: number, c: number, d: number) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

export default function ReportIssue() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { session } = useAuth();
  useTitle(t("report.title"));

  const [step, setStep] = useState(1);
  const [d, setD] = useState<Draft>(loadDraft);
  const [cats, setCats] = useState<Category[]>([]);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoErr, setPhotoErr] = useState<StringKey | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<StringKey | null>(null);
  const [dups, setDups] = useState<Similar[] | null>(null);
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [done, setDone] = useState<{ id: string; ref_no: string; queue_rank: number | null; open_count: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCategories().then(setCats).catch(() => setErr("err.network")); loadAreas().then(setAreas).catch(() => {}); }, []);
  useEffect(() => { writePref(DRAFT_KEY, JSON.stringify(d)); }, [d]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const pick = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
  const outside = pick ? !insideElmina(pick.lat, pick.lng) : false;
  const nearArea = useMemo(() => {
    if (!pick) return null;
    let best: AreaRow | null = null; let bd = Infinity;
    for (const a of areas) {
      if (a.center_lat == null || a.center_lng == null) continue;
      const x = dist(pick.lat, pick.lng, a.center_lat, a.center_lng);
      if (x < bd) { bd = x; best = a; }
    }
    return best?.name ?? null;
  }, [pick?.lat, pick?.lng, areas]); // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    if (!("geolocation" in navigator)) { setLocErr("report.locationDenied"); return; }
    setLocating(true); setLocErr(null);
    // Read once, never watched
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setD((x) => ({ ...x, lat: pos.coords.latitude, lng: pos.coords.longitude })); },
      () => { setLocating(false); setLocErr("report.locationDenied"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = [...photos];
    for (const f of Array.from(list)) {
      const p = fileProblem(f);
      if (p || f.type === "application/pdf") { setPhotoErr(p ? (`err.${p}` as StringKey) : "err.file_type"); continue; }
      if (next.length < 3) next.push(f);
    }
    setPhotos(next);
  }

  const descOk = d.description.trim().length >= 10;
  const valid = step === 1 ? !!pick && !outside : step === 2 ? !!d.category : step === 3 ? descOk : true;

  async function next(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setTouched(false); setErr(null);
    if (step === 3 && pick) {
      setStep(4); setDups(null); setDupMsg(null);
      try { setDups(await similarIssues(d.category, pick.lat, pick.lng, d.description)); } catch { setDups([]); }
      return;
    }
    if (step < TOTAL) { setStep(step + 1); window.scrollTo(0, 0); return; }
    void send();
  }

  async function upvoteDup(s: Similar) {
    try {
      const r = await toggleUpvote(s.id);
      setDups((list) => list?.map((x) => (x.id === s.id ? { ...x, i_voted: r.voted, upvote_count: r.upvote_count } : x)) ?? null);
      if (r.voted) setDupMsg(t("report.dupUpvoted"));
    } catch (e2) { setErr(errorKey(e2)); }
  }

  async function send() {
    if (!pick || !session) return;
    setBusy(true); setErr(null);
    try {
      const paths: string[] = [];
      for (const f of photos) paths.push(await uploadPhoto(session.user.id, f, "issues"));
      const r = await reportIssue({
        category: d.category, description: d.description.trim(), lat: pick.lat, lng: pick.lng,
        photoPaths: paths, anonymous: d.anonymous, address: [d.landmark.trim(), nearArea].filter(Boolean).join(", ") || null,
      });
      writePref(DRAFT_KEY, JSON.stringify(EMPTY));
      setDone(r);
    } catch (e2) {
      const k = errorKey(e2);
      setErr(k === "err.generic" ? "report.draftKept" : k);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <main className="screen">
        <div className="card center pop-in" style={{ marginTop: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--color-tint-green)", color: "var(--color-success)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
            <IconCheck width={40} height={40} />
          </div>
          <h1 style={{ fontSize: "1.5rem" }}>{t("report.doneTitle")}</h1>
          <p className="muted" style={{ margin: "12px 0 4px" }}>{t("report.doneRef")}</p>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "0.04em" }}>{done.ref_no}</p>
          {done.queue_rank && <p style={{ fontWeight: 700 }}>{t("report.donePos", { rank: done.queue_rank, total: done.open_count })}</p>}
        </div>
        <div className="card"><p style={{ marginBottom: 0 }}>{t("report.doneNext")}</p></div>
        <div className="stack" style={{ marginTop: 16 }}>
          <Link to={`/app/issues/${done.id}`} className="btn btn-primary">{t("report.track")}</Link>
          <button className="btn btn-ghost" onClick={() => { setDone(null); setD(EMPTY); setPhotos([]); setStep(1); }}>{t("report.again")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar title={t("report.title")} back={step === 1 ? "/app/issues" : undefined}
        right={step > 1 ? <button className="link-btn" onClick={() => setStep(step - 1)}>{t("common.back")}</button> : undefined} />
      <p className="muted" style={{ marginBottom: 0 }}>{t("report.step", { n: step, total: TOTAL })}</p>
      <ProgressSteps step={step} total={TOTAL} />
      <h2 style={{ fontSize: "1.375rem", marginBottom: 12 }}>{t(`report.s${step}` as StringKey)}</h2>

      <form onSubmit={next} noValidate>
        {step === 1 && (
          <>
            <p className="muted" style={{ fontSize: "1rem" }}>{t("report.mapHint")}</p>
            <LeafletMap label={t("report.s1")} height={300} pick={pick} onPick={(lat, lng) => setD((x) => ({ ...x, lat, lng }))} />
            <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={locate} disabled={locating}>
              <IconPin width={20} /> {locating ? t("report.locating") : t("report.useLocation")}
            </button>
            {pick && !outside && nearArea && <p style={{ fontWeight: 700, marginTop: 12 }}>{t("report.near", { area: nearArea })}</p>}
            {outside && <div style={{ marginTop: 12 }}><Banner kind="error">{t("report.outside")}</Banner></div>}
            {locErr && <div style={{ marginTop: 12 }}><Banner kind="warn">{t(locErr)}</Banner></div>}
            {touched && !pick && <div style={{ marginTop: 12 }}><Banner kind="error">{t("report.pinNeeded")}</Banner></div>}
            <label className="field" style={{ marginTop: 16 }}>
              <span className="label">{t("report.landmark")}</span>
              <input className="input" value={d.landmark} placeholder={t("report.landmarkPh")} onChange={(e) => set("landmark", e.target.value)} maxLength={120} />
            </label>
          </>
        )}

        {step === 2 && (
          <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
            <legend className="sr-only">{t("report.s2")}</legend>
            {cats.length === 0 ? <Spinner /> : (
              <div className="cat-grid">
                {cats.map((c) => (
                  <label key={c.slug}>
                    <input type="radio" name="cat" checked={d.category === c.slug} onChange={() => set("category", c.slug)} />
                    <CategoryName slug={c.slug} />
                  </label>
                ))}
              </div>
            )}
            {touched && !d.category && <div style={{ marginTop: 12 }}><Banner kind="error">{t("err.required")}</Banner></div>}
          </fieldset>
        )}

        {step === 3 && (
          <>
            <label className="field">
              <span className="label">{t("report.describe")}</span>
              <textarea className="textarea" value={d.description} maxLength={1000} onChange={(e) => set("description", e.target.value)}
                aria-invalid={touched && !descOk} />
              <span className="hint">{t("report.describeHint")}</span>
              {touched && !descOk && <span className="error">{t("report.describeErr")}</span>}
            </label>
            <div className="field">
              <span className="label">{t("report.photo")}</span>
              {photos.length > 0 && (
                <div className="photos" style={{ marginBottom: 8 }}>
                  {photos.map((f, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={URL.createObjectURL(f)} alt="" />
                      <button type="button" className="icon-btn" aria-label={`Remove photo ${i + 1}`}
                        style={{ position: "absolute", top: 4, right: 4, width: 36, height: 36 }}
                        onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><IconX width={18} /></button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length < 3 && (
                <button type="button" className="file-drop" style={{ width: "100%", minHeight: 96 }} onClick={() => fileRef.current?.click()}>
                  <IconUpload width={28} /> {t("report.photoChoose")}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden multiple
                onChange={(e) => { setPhotoErr(null); addPhotos(e.target.files); e.target.value = ""; }} />
              {photoErr && <span className="error">{t(photoErr)}</span>}
            </div>
            <label className="row card" style={{ cursor: "pointer" }}>
              <span className="grow"><strong>{t("report.anon")}</strong><span className="muted small" style={{ display: "block" }}>{t("report.anonHint")}</span></span>
              <input type="checkbox" checked={d.anonymous} onChange={(e) => set("anonymous", e.target.checked)} style={{ width: 28, height: 28 }} />
            </label>
            <div style={{ height: 16 }} />
          </>
        )}

        {step === 4 && (
          <>
            <section aria-live="polite">
              <h3 style={{ fontSize: "1.125rem" }}>{t("report.dupTitle")}</h3>
              {dups === null ? <Spinner /> : dups.length === 0 ? <p className="muted">{t("report.dupNone")}</p> : (
                <>
                  <p className="muted" style={{ fontSize: "1rem" }}>{t("report.dupLead")}</p>
                  {dups.map((s) => (
                    <div key={s.id} className="card" style={{ marginBottom: 12 }}>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <StatusChip status={s.status} />
                        <span className="small muted">{t("report.dupAway", { m: s.distance_m })} · ▲ {s.upvote_count} · {s.ref_no}</span>
                      </div>
                      <strong><CategoryName slug={s.category} /></strong>
                      <p style={{ margin: "4px 0 10px" }}>{s.description}</p>
                      {s.is_mine ? <span className="chip">{t("report.dupMine")}</span> : (
                        <button type="button" className="upvote" aria-pressed={s.i_voted} onClick={() => upvoteDup(s)}>
                          ▲ {s.i_voted ? t("issue.upvoted") : t("issue.upvote")}
                        </button>
                      )}
                    </div>
                  ))}
                  {dupMsg && <Banner kind="success">{dupMsg}</Banner>}
                </>
              )}
            </section>
            <div className="card" style={{ margin: "16px 0" }}>
              <p style={{ fontWeight: 700, margin: 0 }}>{t("report.review", { cat: cats.find((c) => c.slug === d.category)?.name_en ?? d.category })}</p>
              <p className="muted small" style={{ margin: "4px 0 0" }}>{nearArea ? t("report.near", { area: nearArea }) : null}{d.landmark ? ` · ${d.landmark}` : ""}</p>
              <p style={{ margin: "8px 0 0" }}>{d.description}</p>
            </div>
          </>
        )}

        {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}
        <button className="btn btn-primary" type="submit" disabled={busy || (step === 4 && dups === null)}>
          {busy ? t("report.sending") : step < 4 ? t("common.continue") : dups && dups.length > 0 ? t("report.notDup") : t("report.send")}
        </button>
        {step === 4 && dupMsg && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { writePref(DRAFT_KEY, JSON.stringify(EMPTY)); nav("/app/issues"); }}>
            {t("common.close")}
          </button>
        )}
      </form>
    </main>
  );
}
