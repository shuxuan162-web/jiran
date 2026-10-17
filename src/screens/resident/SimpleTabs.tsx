import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { TopBar } from "../../components/ui/parts";
import { SoonBody } from "./SoonScreen";

export function MallTab() {
  const { t } = useI18n();
  useTitle(t("mall.title"));
  return <main className="screen"><TopBar title={t("mall.title")} /><SoonBody slug="mall" /></main>;
}

export function PropertiesTab() {
  const { t } = useI18n();
  useTitle(t("props.title"));
  return <main className="screen"><TopBar title={t("props.title")} /><SoonBody slug="properties" /></main>;
}
