import { useParams } from "react-router-dom";
import { useI18n, type StringKey } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { ComingSoon, TopBar } from "../../components/ui/parts";

const NAMES: Record<string, StringKey> = {
  announcements: "res.tile.announcements", services: "res.tile.services", complaint: "res.tile.complaint",
  feedback: "res.tile.feedback", emergency: "res.tile.emergency", faq: "res.tile.faq", events: "res.tile.events",
  billing: "res.tile.billing", qr: "res.tile.qr", mall: "mall.title", properties: "props.title",
  rewards: "profile.rewards", facilities: "svc.facilities", activity: "profile.activity", carplates: "profile.carPlates", help: "profile.help",
};

/** Friendly placeholder so navigation never breaks while a module is being built. */
export function SoonBody({ slug }: { slug: string }) {
  const { t } = useI18n();
  const name = NAMES[slug] ? t(NAMES[slug]) : slug === "quests" ? t("res.quests") : slug;
  return <ComingSoon feature={name} extra={slug === "emergency" ? "soon.emergency" : undefined} />;
}

export default function SoonScreen() {
  const { feature = "" } = useParams();
  const { t } = useI18n();
  const title = NAMES[feature] ? t(NAMES[feature]) : t("common.comingSoon");
  useTitle(title);
  return (
    <main className="screen">
      <TopBar title={title} back />
      <SoonBody slug={feature} />
    </main>
  );
}
