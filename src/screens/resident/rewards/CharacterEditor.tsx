import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { myRewards, saveAvatar } from "../../../features/rewards/api";
import { useI18n, type StringKey } from "../../../i18n";
import {
  ACCS, DEFAULT_AVATAR, HAIRS, HAIR_COLORS, RINGS, SCARF_COLORS, SKINS, TOPS, avatarSvg, isLocked, lockLevel, normalizeAvatar, randomAvatar,
  type Acc, type AvatarConfig, type Ring,
} from "../../../lib/avatar";
import { errorKey } from "../../../lib/errors";
import { useTitle } from "../../../lib/useTitle";
import { Banner, TopBar } from "../../../components/ui/parts";

type Tab = "skin" | "hair" | "top" | "acc" | "ring";

/** Character editor: live preview, category tabs, items with lock reasons, randomise, save. */
export default function CharacterEditor() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { profile, refresh } = useAuth();
  useTitle(t("ce.title"));
  const [cfg, setCfg] = useState<AvatarConfig>(() => normalizeAvatar(profile?.avatar_config) ?? DEFAULT_AVATAR);
  const [level, setLevel] = useState(1);
  const [tab, setTab] = useState<Tab>("skin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { myRewards().then((r) => setLevel(r.level)).catch(() => {}); }, []);
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function save() {
    if (!profile) return;
    setBusy(true); setErr(null);
    try { await saveAvatar(profile.id, cfg); await refresh(); nav(-1); }
    catch (e) { setErr(t(errorKey(e))); setBusy(false); }
  }

  const swatch = (colors: string[], value: number, onPick: (i: number) => void, label: StringKey) => (
    <div className="swatches" role="radiogroup" aria-label={t(label)}>
      {colors.map((c, i) => (
        <button key={c} type="button" role="radio" aria-checked={value === i} aria-label={`${t(label)} ${i + 1}`}
          className={`swatch${value === i ? " on" : ""}`} style={{ background: c }} onClick={() => onPick(i)} />
      ))}
    </div>
  );
  const preview = (patch: Partial<AvatarConfig>) => ({ __html: avatarSvg({ ...cfg, ...patch }, 56) });

  return (
    <main className="screen">
      <TopBar title={t("ce.title")} back />
      <div className="ce-preview" aria-label={t("ce.preview")} role="img" dangerouslySetInnerHTML={{ __html: avatarSvg(cfg, 168) }} />
      <p className="small muted" style={{ textAlign: "center", margin: "4px 0 12px" }}>{t("ce.levelNote", { n: level })}</p>

      <div className="tabs" role="tablist" aria-label={t("ce.title")}>
        {(["skin", "hair", "top", "acc", "ring"] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>{t(`ce.tab.${k}` as StringKey)}</button>
        ))}
      </div>

      <section className="card">
        {tab === "skin" && swatch(SKINS, cfg.skin, (i) => set("skin", i), "ce.tab.skin")}
        {tab === "hair" && (
          <>
            <div className="item-grid">
              {HAIRS.map((h) => (
                <button key={h} type="button" className={`item${cfg.hair === h ? " on" : ""}`} aria-pressed={cfg.hair === h} onClick={() => set("hair", h)}>
                  <span dangerouslySetInnerHTML={preview({ hair: h, acc: "none" })} />
                  <span className="small">{t(`ce.hair.${h}` as StringKey)}</span>
                </button>
              ))}
            </div>
            {cfg.hair !== "none" && (
              <>
                <p className="label" style={{ fontWeight: 800, margin: "14px 0 6px" }}>{t(cfg.hair === "tudung" ? "ce.scarfColour" : "ce.hairColour")}</p>
                {swatch(cfg.hair === "tudung" ? SCARF_COLORS : HAIR_COLORS, cfg.hairColor, (i) => set("hairColor", i), cfg.hair === "tudung" ? "ce.scarfColour" : "ce.hairColour")}
              </>
            )}
          </>
        )}
        {tab === "top" && swatch(TOPS, cfg.top, (i) => set("top", i), "ce.tab.top")}
        {tab === "acc" && (
          <div className="item-grid">
            {ACCS.map((a: Acc) => {
              const locked = isLocked("acc", a, level);
              return (
                <button key={a} type="button" className={`item${cfg.acc === a ? " on" : ""}${locked ? " locked" : ""}`} aria-pressed={cfg.acc === a}
                  disabled={locked} onClick={() => set("acc", a)} aria-label={locked ? `${t(`ce.acc.${a}` as StringKey)}, ${t("ce.lockedAt", { n: lockLevel("acc", a) })}` : undefined}>
                  <span dangerouslySetInnerHTML={preview({ acc: a })} />
                  <span className="small">{locked ? `🔒 ${t("ce.lockedAt", { n: lockLevel("acc", a) })}` : t(`ce.acc.${a}` as StringKey)}</span>
                </button>
              );
            })}
          </div>
        )}
        {tab === "ring" && (
          <div className="item-grid">
            {(Object.keys(RINGS) as Ring[]).map((r) => {
              const locked = isLocked("ring", r, level);
              return (
                <button key={r} type="button" className={`item${cfg.ring === r ? " on" : ""}${locked ? " locked" : ""}`} aria-pressed={cfg.ring === r}
                  disabled={locked} onClick={() => set("ring", r)}>
                  <span className="ring-dot" style={{ background: RINGS[r] }} aria-hidden="true" />
                  <span className="small">{locked ? `🔒 ${t("ce.lockedAt", { n: lockLevel("ring", r) })}` : t(`ce.ring.${r}` as StringKey)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {err && <div style={{ marginTop: 12 }}><Banner kind="error">{err}</Banner></div>}
      <div className="row" style={{ gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={() => setCfg(randomAvatar(level))}>{t("ce.randomise")}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? t("common.loading") : t("common.save")}</button>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>{t("ce.privacy")}</p>
    </main>
  );
}
