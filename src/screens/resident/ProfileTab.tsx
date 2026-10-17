import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { Avatar, TopBar } from "../../components/ui/parts";
import {
  IconCar, IconChevron, IconHelp, IconList, IconLogout, IconMail, IconSettings, IconTrophy, IconUsers,
} from "../../components/ui/Icons";

export default function ProfileTab() {
  const { t } = useI18n();
  const { profile, priv, signOut } = useAuth();
  useTitle(t("profile.title"));
  const [unitLabel, setUnitLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!priv?.unit_id) return;
    supabase.from("units").select("label").eq("id", priv.unit_id).maybeSingle()
      .then(({ data }) => setUnitLabel((data?.label as string) ?? null));
  }, [priv?.unit_id]);

  if (!profile || !priv) return null;
  const isOwner = profile.role === "owner";
  const since = new Date(priv.resident_since).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const row = (to: string, key: StringKey, Icon: typeof IconMail, tint: string) => (
    <Link to={to} className="list-row">
      <span className="ico" style={{ background: tint }}><Icon /></span>
      <span className="grow">{t(key)}</span>
      <IconChevron className="chev" width={20} />
    </Link>
  );

  return (
    <main className="screen">
      <TopBar title={t("profile.title")} />
      <section className="card row" style={{ marginBottom: 16 }}>
        <Avatar name={profile.nickname} config={profile.avatar_config} size={72} />
        <div className="grow">
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.375rem" }}>{profile.nickname}</div>
          <span className="chip" style={{ marginTop: 4 }}>{t(`profile.role.${profile.role}` as StringKey)}</span>
          {unitLabel && (
            <div className="small muted" style={{ marginTop: 6 }}>
              {unitLabel} <span className="sr-only">.</span>
              <span style={{ display: "block" }}>{t("profile.unitPrivate")}</span>
            </div>
          )}
          <div className="small muted">{t("profile.since", { date: since })}</div>
        </div>
      </section>

      <h2 className="section">{t("profile.activity")}</h2>
      <div className="list">{row("/app/my-reports", "profile.activity", IconList, "var(--color-tint-blue)")}</div>

      <h2 className="section">{t("profile.account")}</h2>
      <div className="list">
        {isOwner && row("/app/profile/sub-owners", "profile.subOwners", IconUsers, "var(--color-tint-amber)")}
        {row("/app/soon/carplates", "profile.carPlates", IconCar, "var(--color-tint-orange)")}
        {row("/app/soon/rewards", "profile.rewards", IconTrophy, "var(--color-tint-amber)")}
        {row("/emails", "profile.emails", IconMail, "var(--color-tint-purple)")}
      </div>

      <h2 className="section">{t("profile.settings")}</h2>
      <div className="list">
        {row("/app/profile/settings", "profile.settings", IconSettings, "var(--color-tint-green)")}
        {row("/app/soon/help", "profile.help", IconHelp, "var(--color-tint-blue)")}
      </div>

      <button className="btn btn-ghost" style={{ marginTop: 32 }} onClick={() => signOut()}>
        <IconLogout width={22} /> {t("profile.logout")}
      </button>
    </main>
  );
}
