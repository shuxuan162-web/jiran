import { useEffect, useState } from "react";
import { useAuth } from "../../../features/auth/AuthProvider";
import { loadAreas, myFollows, setFollow, type AreaRow } from "../../../features/info/api";
import { useI18n } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { Banner } from "../../../components/ui/parts";

const MAX = 4;

/** Settings card: extra areas to get notices for (home area is always included). */
export default function AreaFollows() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [on, setOn] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadAreas(), myFollows()]).then(([a, f]) => { setAreas(a); setOn(f); }).catch((e) => { setErr(t(errorKey(e))); setOn([]); });
  }, [t]);

  async function toggle(id: string) {
    if (!profile || !on) return;
    const next = !on.includes(id);
    if (next && on.length >= MAX) { setErr(t("err.follow_limit")); return; }
    setErr(null);
    setOn(next ? [...on, id] : on.filter((x) => x !== id));
    try { await setFollow(profile.id, id, next); }
    catch (e) { setOn(on); setErr(t(errorKey(e))); }
  }

  const home = areas.find((a) => a.id === profile?.home_area_id);
  const choices = areas.filter((a) => a.id !== profile?.home_area_id && a.center_lat != null);
  return (
    <section className="card">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 800, marginBottom: 4 }}>{t("settings.follows")}</legend>
        <p className="muted" style={{ fontSize: "1rem", marginTop: 0 }}>
          {t("settings.followsLead", { home: home?.name ?? "—", n: MAX })}
        </p>
        {on === null ? <p className="muted">{t("common.loading")}</p> : (
          <div className="chip-row">
            {choices.map((a) => (
              <button key={a.id} type="button" className="chip-btn" aria-pressed={on.includes(a.id)} onClick={() => toggle(a.id)}>{a.name}</button>
            ))}
          </div>
        )}
        <p className="small muted" style={{ marginBottom: 0 }}>{t("settings.followsCount", { n: on?.length ?? 0, max: MAX })}</p>
      </fieldset>
      {err && <div style={{ marginTop: 8 }}><Banner kind="error">{err}</Banner></div>}
    </section>
  );
}
