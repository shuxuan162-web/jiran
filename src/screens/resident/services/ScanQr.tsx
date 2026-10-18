import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { checkInEvent, eventById } from "../../../features/info/api";
import { useI18n } from "../../../i18n";
import { errorKey } from "../../../lib/errors";
import { isTrustedUrl, parseQr } from "../../../lib/qr";
import { useTitle } from "../../../lib/useTitle";
import QrScanner from "../../../components/QrScanner";
import { Banner, TopBar } from "../../../components/ui/parts";

type Result = { kind: "success" | "error" | "info" | "warn"; text: string; link?: { to: string; label: string; external?: boolean } };

/** Scan QR: check in at events by scanning the host's code. Visitor passes are for the guardhouse. */
export default function ScanQr() {
  const { t } = useI18n();
  useTitle(t("qr.title"));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const handle = useCallback(async (raw: string) => {
    if (busy) return;
    const p = parseQr(raw);
    setBusy(true); setResult(null);
    try {
      if (p.kind === "event") {
        const e = await eventById(p.eventId);
        if (!e) { setResult({ kind: "error", text: t("err.not_found") }); return; }
        const r = await checkInEvent(p.eventId, null, p.code);
        setResult({ kind: "success", text: t(r.method === "already" ? "qr.eventAlready" : "qr.eventDone", { title: e.title }), link: { to: `/app/events/${e.id}`, label: t("qr.openEvent") } });
      } else if (p.kind === "pass") {
        setResult({ kind: "info", text: t("qr.passForGuard") });
      } else if (p.kind === "url") {
        const trusted = isTrustedUrl(p.url, window.location.origin);
        setResult(trusted
          ? { kind: "info", text: t("qr.linkTrusted"), link: { to: p.url, label: t("qr.openLink"), external: true } }
          : { kind: "warn", text: t("qr.linkUntrusted", { url: p.url.slice(0, 80) }) });
      } else {
        setResult({ kind: "warn", text: t("qr.unknown") });
      }
    } catch (e) { setResult({ kind: "error", text: t(errorKey(e)) }); }
    finally { setBusy(false); }
  }, [busy, t]);

  return (
    <main className="screen">
      <TopBar title={t("qr.title")} back />
      <p className="muted" style={{ marginTop: 0 }}>{t("qr.lead")}</p>
      <QrScanner onResult={handle} paused={busy || !!result} manualLabel={t("qr.manualResident")} />
      {result && (
        <div style={{ marginTop: 12 }} aria-live="assertive">
          <Banner kind={result.kind}>{result.text}</Banner>
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {result.link && (result.link.external
              ? <a className="btn btn-primary btn-small" href={result.link.to} target="_blank" rel="noreferrer">{result.link.label}</a>
              : <Link className="btn btn-primary btn-small" to={result.link.to}>{result.link.label}</Link>)}
            <button className="btn btn-ghost btn-small" onClick={() => setResult(null)}>{t("qr.scanAgain")}</button>
          </div>
        </div>
      )}
      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t("qr.whatTitle")}</h3>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>{t("qr.what1")}</li>
          <li>{t("qr.what2")} <Link to="/app/services/visitors">{t("svc.visitors")}</Link></li>
          <li>{t("qr.what3")}</li>
        </ul>
      </section>
    </main>
  );
}
