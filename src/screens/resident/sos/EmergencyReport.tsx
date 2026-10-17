import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSos } from "../../../features/sos/SosProvider";
import { EMERGENCY_TYPES, loadAreaShapes, type EmergencyType } from "../../../features/sos/api";
import { useI18n, type StringKey } from "../../../i18n";
import { fileProblem } from "../../../lib/validation";
import { useTitle } from "../../../lib/useTitle";
import { insideElmina } from "../../../lib/map/elmina";
import MapView from "../../../lib/map/MapView";
import { type AreaShape } from "../../../lib/map/LeafletMap";
import { Banner, TopBar } from "../../../components/ui/parts";
import { IconPin, IconUpload } from "../../../components/ui/Icons";

/** Detailed emergency report: type, pin, details, photo. Goes into the urgent queue above every routine item. */
export default function EmergencyReport() {
  const { t } = useI18n();
  const { fire, dial } = useSos();
  useTitle(t("sos.detailedTitle"));
  const [type, setType] = useState<EmergencyType | null>(null);
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);
  const [desc, setDesc] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoErr, setPhotoErr] = useState<StringKey | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState(false);
  const [touched, setTouched] = useState(false);
  const [areas, setAreas] = useState<AreaShape[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAreaShapes().then(setAreas).catch(() => {}); }, []);

  function locate() {
    if (!("geolocation" in navigator)) { setLocErr(true); return; }
    setLocating(true); setLocErr(false);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setPick({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setLocating(false); setLocErr(true); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!type) return;
    if (photo && fileProblem(photo)) { setPhotoErr(`err.${fileProblem(photo)}` as StringKey); return; }
    const inside = pick && insideElmina(pick.lat, pick.lng);
    // A detailed report doesn't open the dialer by itself: the banner above offers the call.
    fire({ type, lat: inside ? pick!.lat : undefined, lng: inside ? pick!.lng : undefined, description: desc.trim() || undefined, photo, dial: false });
  }

  return (
    <main className="screen">
      <TopBar title={t("sos.detailedTitle")} back="/app/emergency" />
      <div className="banner error" role="note" style={{ marginBottom: 16 }}>
        <div className="grow"><strong>{t("sos.immediate")}</strong></div>
        <button type="button" className="btn btn-danger btn-small" onClick={dial}>{t("sos.call999Short")}</button>
      </div>

      <form onSubmit={submit} noValidate>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
          <legend className="label" style={{ fontWeight: 800, marginBottom: 8 }}>{t("sos.whatKind")}</legend>
          <div className="chip-row">
            {EMERGENCY_TYPES.map((x) => (
              <button key={x} type="button" className="chip-btn" aria-pressed={type === x} onClick={() => setType(x)}>{t(`sosType.${x}` as StringKey)}</button>
            ))}
          </div>
          {touched && !type && <span className="error" style={{ display: "block", color: "var(--color-urgent)", fontWeight: 700, marginTop: 6 }}>{t("err.required")}</span>}
        </fieldset>

        <span className="label" style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>{t("sos.where")}</span>
        <MapView label={t("sos.where")} height={260} areas={areas} pick={pick} onPick={(lat, lng) => setPick({ lat, lng })} />
        <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={locate} disabled={locating}>
          <IconPin width={20} /> {locating ? t("report.locating") : t("report.useLocation")}
        </button>
        {pick && !insideElmina(pick.lat, pick.lng) && <div style={{ marginTop: 12 }}><Banner kind="warn">{t("sos.outsideUsesHome")}</Banner></div>}
        {locErr && <div style={{ marginTop: 12 }}><Banner kind="warn">{t("report.locationDenied")}</Banner></div>}
        {!pick && <p className="small muted" style={{ marginTop: 8 }}>{t("sos.noPinHome")}</p>}

        <label className="field" style={{ marginTop: 16 }}>
          <span className="label">{t("sos.addDetails")}</span>
          <textarea className="textarea" value={desc} maxLength={500} placeholder={t("sos.detailsPh")} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <div className="field">
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            <IconUpload width={20} /> {photo ? photo.name.slice(0, 24) : t("issue.addPhoto")}
          </button>
          <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment"
            onChange={(e) => { setPhotoErr(null); setPhoto(e.target.files?.[0] ?? null); }} />
          {photoErr && <span className="error">{t(photoErr)}</span>}
        </div>
        <button className="btn btn-danger" type="submit">{t("sos.sendReport")}</button>
      </form>
    </main>
  );
}
