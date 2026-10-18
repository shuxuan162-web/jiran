import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../features/auth/AuthProvider";
import { invoiceLink, myBills, setBillReminder, type MyBill } from "../../../features/billing/api";
import { useI18n, type StringKey } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { money } from "../../../lib/billing";
import { useTitle } from "../../../lib/useTitle";
import { BillStatus, LoadError } from "../../../components/Status";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Billing reminders for the owner's unit. Bills come from the management office; payments happen outside Jiran. */
export default function Billing() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("bill.title"));
  const [bills, setBills] = useState<MyBill[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const isOwner = profile?.role === "owner";

  const load = useCallback(() => {
    setErr(null); setBills(null);
    myBills().then(setBills).catch((e) => setErr(t(errorKey(e))));
  }, [t]);
  useEffect(() => { if (isOwner) load(); }, [isOwner, load]);

  async function toggle(b: MyBill, on: boolean) {
    setMsg(null);
    setBills((list) => list?.map((x) => (x.id === b.id ? { ...x, reminders_on: on } : x)) ?? null);
    try { await setBillReminder(b.id, on); }
    catch (e) { setMsg({ kind: "error", text: t(errorKey(e)) }); setBills((list) => list?.map((x) => (x.id === b.id ? { ...x, reminders_on: !on } : x)) ?? null); }
  }
  async function openInvoice(b: MyBill) {
    setMsg(null);
    const w = window.open("", "_blank", "noopener");
    try { const url = await invoiceLink(b.id); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { w?.close(); setMsg({ kind: "error", text: t(errorKey(e)) }); }
  }

  if (!isOwner) {
    return <main className="screen"><TopBar title={t("bill.title")} back /><Banner kind="info">{t("bill.ownerOnly")}</Banner></main>;
  }
  const open = (bills ?? []).filter((b) => b.state === "overdue" || b.state === "due_soon" || b.state === "upcoming");
  const total = open.reduce((s, b) => s + b.amount, 0);
  return (
    <main className="screen">
      <TopBar title={t("bill.title")} back />
      <Banner kind="info">{t("bill.remindersOnly")}</Banner>
      {msg && <div style={{ marginTop: 12 }}><Banner kind={msg.kind}>{msg.text}</Banner></div>}
      <div style={{ marginTop: 12 }} aria-live="polite">
        {err ? <LoadError text={err} onRetry={load} /> : !bills ? <Spinner label={t("common.loading")} /> : bills.length === 0 ? (
          <section className="card"><strong style={{ display: "block" }}>{t("bill.emptyTitle")}</strong><p className="muted" style={{ margin: "6px 0 0" }}>{t("bill.empty")}</p></section>
        ) : (
          <>
            <section className="card">
              <span className="small muted">{t("bill.outstanding")}</span>
              <div className="stat-value" style={{ fontSize: "2rem" }}>{money(total)}</div>
              <span className="small">{t("bill.openN", { n: open.length })}</span>
            </section>
            {bills.map((b) => (
              <section key={b.id} className={`card bill bill-${b.state}`} aria-label={`${t(`bill.kind.${b.kind}` as StringKey)}, ${b.period}`}>
                <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="grow">
                    <strong style={{ display: "block" }}>{t(`bill.kind.${b.kind}` as StringKey)}</strong>
                    <span className="small muted">{b.period}{b.reference ? ` · ${b.reference}` : ""}</span>
                  </span>
                  <strong style={{ fontSize: "1.125rem" }}>{money(b.amount)}</strong>
                </div>
                <p className="small" style={{ margin: "8px 0 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <BillStatus state={b.state} />
                  <span>{b.paid_at ? t("bill.paidOn", { date: fmtDate(b.paid_at) }) : t("bill.dueOn", { date: fmtDate(b.due_date) })}</span>
                </p>
                {b.note && <p className="small" style={{ margin: "6px 0 0" }}>{t("bill.fromOffice")}: {b.note}</p>}
                <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  {b.has_invoice && <button className="btn btn-ghost btn-small" onClick={() => openInvoice(b)}>{t("bill.viewInvoice")}</button>}
                  {!b.paid_at && (
                    <label className="row" style={{ gap: 8, cursor: "pointer", minHeight: 48 }}>
                      <input type="checkbox" checked={b.reminders_on} onChange={(e) => toggle(b, e.target.checked)} style={{ width: 28, height: 28 }} />
                      <span>{t("bill.remindThis", { n: b.soon_days })}</span>
                    </label>
                  )}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>{t("bill.prefsHint")} <Link to="/app/profile/settings">{t("settings.title")}</Link></p>
    </main>
  );
}
