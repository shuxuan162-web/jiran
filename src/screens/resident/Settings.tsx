import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type Lang } from "../../i18n";
import { applyDisplayPrefs, readPref, writePref, type TextScale } from "../../lib/prefs";
import { useTitle } from "../../lib/useTitle";
import { Banner, TopBar } from "../../components/ui/parts";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { profile } = useAuth();
  useTitle(t("settings.title"));
  const [scale, setScale] = useState<TextScale>(((readPref("textScale") as TextScale) || "normal"));
  const [motion, setMotion] = useState(readPref("reduceMotion") === "1");

  function chooseLang(l: Lang) {
    setLang(l);
    if (profile) void supabase.from("profiles").update({ language: l }).eq("id", profile.id);
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
