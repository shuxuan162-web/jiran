import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type Lang } from "../../i18n";
import { applyDisplayPrefs, readPref, writePref, type TextScale } from "../../lib/prefs";
import { useTitle } from "../../lib/useTitle";
import { Banner, TopBar } from "../../components/ui/parts";
import { setPrivacy } from "../../features/sos/api";
import { errorKey } from "../../lib/errors";
import AreaFollows from "./info/AreaFollows";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { profile, refresh } = useAuth();
  const [privErr, setPrivErr] = useState<string | null>(null);
  useTitle(t("settings.title"));
  const [scale, setScale] = useState<TextScale>(((readPref("textScale") as TextScale) || "normal"));
  const [motion, setMotion] = useState(readPref("reduceMotion") === "1");

  function chooseLang(l: Lang) {
    setLang(l);
    if (profile) void supabase.from("profiles").update({ language: l }).eq("id", profile.id);
  }
  async function changePrivacy(p: { map_visibility?: "precinct" | "hidden"; ghost_mode?: boolean }) {
    if (!profile) return;
    setPrivErr(null);
    try { await setPrivacy(profile.id, p); await refresh(); } catch (e) { setPrivErr(t(errorKey(e))); }
  }
  function chooseScale(s: TextScale) { setScale(s); writePref("textScale", s); applyDisplayPrefs(); }
  function toggleMotion(v: boolean) { setMotion(v); writePref("reduceMotion", v ? "1" : "0"); applyDisplayPrefs(); }

  return (
    <main className="screen">
      <TopBar title={t("settings.title")} back="/app/profile" />
      <section className="card">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("settings.language")}</legend>
          <div className="segmented">
            {(["en", "bm"] as const).map((l) => (
              <label key={l}><input type="radio" name="lang" checked={lang === l} onChange={() => chooseLang(l)} />
                <span>{l === "en" ? "English" : "Bahasa Melayu"}</span></label>
            ))}
          </div>
        </fieldset>
        {lang === "bm" && <div style={{ marginTop: 12 }}><Banner kind="warn">{t("settings.bmNote")}</Banner></div>}
      </section>

      <section className="card">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 800, marginBottom: 4 }}>{t("settings.mapPrivacy")}</legend>
          <p className="muted" style={{ fontSize: "1rem", marginTop: 0 }}>{t("settings.mapPrivacyLead")}</p>
          <div className="segmented">
            {(["precinct", "hidden"] as const).map((v) => (
              <label key={v}><input type="radio" name="vis" checked={profile?.map_visibility === v} onChange={() => changePrivacy({ map_visibility: v })} />
                <span>{t(v === "precinct" ? "settings.visPrecinct" : "settings.visHidden")}</span></label>
            ))}
          </div>
        </fieldset>
        <label className="row" style={{ cursor: "pointer", minHeight: 48, marginTop: 12 }}>
          <span className="grow"><strong>{t("settings.ghost")}</strong><span className="muted" style={{ display: "block" }}>{t("settings.ghostHint")}</span></span>
          <input type="checkbox" checked={!!profile?.ghost_mode} onChange={(e) => changePrivacy({ ghost_mode: e.target.checked })} style={{ width: 28, height: 28 }} />
        </label>
        {privErr && <Banner kind="error">{privErr}</Banner>}
      </section>

      <AreaFollows />

      <section className="card">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 800, marginBottom: 8 }}>{t("settings.textSize")}</legend>
          <div className="segmented" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            {([["normal", "settings.textNormal", 16], ["large", "settings.textLarge", 19], ["larger", "settings.textLarger", 22]] as const).map(([k, key, px]) => (
              <label key={k}><input type="radio" name="scale" checked={scale === k} onChange={() => chooseScale(k)} />
                <span style={{ fontSize: px }}>{t(key)}</span></label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card">
        <label className="row" style={{ cursor: "pointer", minHeight: 48 }}>
          <span className="grow"><strong>{t("settings.motion")}</strong><span className="muted" style={{ display: "block" }}>{t("settings.motionHint")}</span></span>
          <input type="checkbox" checked={motion} onChange={(e) => toggleMotion(e.target.checked)} style={{ width: 28, height: 28 }} />
        </label>
      </section>
    </main>
  );
}
