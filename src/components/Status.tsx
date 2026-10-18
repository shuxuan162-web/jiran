// Status labels are always icon + text (never colour alone), and load failures say whether the phone is offline.
import { useEffect, useState } from "react";
import { useI18n, type StringKey } from "../i18n";
import type { BillState } from "../lib/billing";
import type { SrStatus } from "../lib/serviceFlow";
import { Banner } from "./ui/parts";
import { IconAlert, IconCalendar, IconCheck, IconClipboard, IconInfo, IconPerson, IconWrench, IconX } from "./ui/Icons";

const BILL: Record<BillState, { Icon: typeof IconCheck; cls: string }> = {
  paid: { Icon: IconCheck, cls: "green" }, overdue: { Icon: IconAlert, cls: "red" }, due_soon: { Icon: IconCalendar, cls: "lvl-medium" },
  upcoming: { Icon: IconCalendar, cls: "lvl-low" }, void: { Icon: IconX, cls: "" },
};
export function BillStatus({ state }: { state: BillState }) {
  const { t } = useI18n();
  const { Icon, cls } = BILL[state];
  return <span className={`chip ${cls}`}><Icon width={16} height={16} aria-hidden="true" />{t(`bill.state.${state}` as StringKey)}</span>;
}

const SR: Record<SrStatus, { Icon: typeof IconCheck; cls: string }> = {
  submitted: { Icon: IconClipboard, cls: "lvl-low" }, acknowledged: { Icon: IconInfo, cls: "blue" }, assigned: { Icon: IconPerson, cls: "blue" },
  in_progress: { Icon: IconWrench, cls: "lvl-medium" }, completed: { Icon: IconCheck, cls: "green" }, cancelled: { Icon: IconX, cls: "" },
};
export function SrStatusLabel({ status }: { status: SrStatus }) {
  const { t } = useI18n();
  const { Icon, cls } = SR[status];
  return <span className={`chip ${cls}`}><Icon width={16} height={16} aria-hidden="true" />{t(`sr.status.${status}` as StringKey)}</span>;
}

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true); const down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

/** Shown when a list fails to load: offline message when the phone is offline, otherwise the error, with a retry. */
export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useI18n();
  const online = useOnline();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Banner kind={online ? "error" : "warn"}>{online ? text : t("common.offlineList")}</Banner>
      <button className="btn btn-ghost btn-small" onClick={onRetry}>{t("common.retry")}</button>
    </div>
  );
}
