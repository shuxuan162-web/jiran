import { Link } from "react-router-dom";
import { useSos } from "../../../features/sos/SosProvider";
import { useI18n } from "../../../i18n";
import { useTitle } from "../../../lib/useTitle";
import { TopBar } from "../../../components/ui/parts";
import SosButton from "../../../components/SosButton";

/** E1: Emergency. Big SOS (instant), call 999, numbers, detailed report. */
export default function EmergencyScreen() {
  const { t } = useI18n();
  const { dial } = useSos();
  useTitle(t("res.tile.emergency"));
  return (
    <main className="screen">
      <TopBar title={t("res.tile.emergency")} back="/app/residence" />
      <p style={{ fontWeight: 700 }}>{t("sos.lead")}</p>
      <SosButton variant="big" />
      <p className="small muted" style={{ margin: "8px 0 16px" }}>{t("sos.bigHint")}</p>
      <button className="btn btn-danger" onClick={dial}>{t("sos.call999")}</button>

      <h2 className="section">{t("sos.numbersTitle")}</h2>
      <div className="list">
        <div className="list-row" style={{ cursor: "default" }}>
          <span className="grow">{t("sos.num999")}<span className="small muted" style={{ display: "block", fontWeight: 600 }}>{t("sos.num999Sub")}</span></span>
          <strong>999</strong>
        </div>
        <div className="list-row" style={{ cursor: "default" }}>
          <span className="grow">{t("sos.num112")}<span className="small muted" style={{ display: "block", fontWeight: 600 }}>{t("sos.num112Sub")}</span></span>
          <strong>112</strong>
        </div>
        <div className="list-row" style={{ cursor: "default" }}>
          <span className="grow">{t("sos.numSecurity")}<span className="small muted" style={{ display: "block", fontWeight: 600 }}>{t("sos.numSecuritySub")}</span></span>
          <span className="chip">{t("sos.verify")}</span>
        </div>
      </div>

      <h2 className="section">{t("sos.detailedTitle")}</h2>
      <p className="muted">{t("sos.detailedLead")}</p>
      <Link to="/app/emergency/report" className="btn btn-secondary">{t("sos.detailed")}</Link>
    </main>
  );
}
