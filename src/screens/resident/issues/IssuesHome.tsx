import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { issueFeed, type IssueRow } from "../../../features/issues/api";
import { useI18n, type StringKey } from "../../../i18n";
import { useTitle } from "../../../lib/useTitle";
import { readPref, writePref } from "../../../lib/prefs";
import { Banner, Spinner, TopBar } from "../../../components/ui/parts";
import { IssueCard, NotificationBell } from "../../../components/issues";

type Tab = "open" | "mine" | "voted";
const TABS: { k: Tab; label: StringKey; empty: StringKey }[] = [
  { k: "open", label: "issues.tabOpen", empty: "issues.emptyOpen" },
  { k: "mine", label: "issues.tabMine", empty: "issues.emptyMine" },
  { k: "voted", label: "issues.tabVoted", empty: "issues.emptyVoted" },
];

/** Complaints hub: the ranked queue, my reports, what I upvoted. */
export default function IssuesHome({ initialTab }: { initialTab?: Tab }) {
  const { t } = useI18n();
  useTitle(t("issues.title"));
  const [tab, setTab] = useState<Tab>(initialTab ?? ((readPref("issuesTab") as Tab) || "open"));
  const [rows, setRows] = useState<IssueRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await issueFeed(tab, 100)); setFailed(false); } catch { setFailed(true); setRows((r) => r ?? []); }
  }, [tab]);

  useEffect(() => {
    setRows(null);
    void load();
    writePref("issuesTab", tab);
    const id = window.setInterval(load, 20000); // live enough; realtime arrives with the map in phase 3
    return () => window.clearInterval(id);
  }, [tab, load]);

  const current = TABS.find((x) => x.k === tab)!;
  return (
    <main className="screen">
      <TopBar title={t("issues.title")} back="/app/residence" right={<NotificationBell />} />
      <Link to="/app/report" className="btn btn-primary" style={{ marginBottom: 16 }}>+ {t("issues.report")}</Link>
      <div className="tabs" role="tablist" aria-label={t("issues.title")}>
        {TABS.map((x) => (
          <button key={x.k} role="tab" aria-selected={tab === x.k} aria-pressed={tab === x.k} onClick={() => setTab(x.k)}>{t(x.label)}</button>
        ))}
      </div>
      {tab === "open" && <p className="small muted">{t("issues.queueNote")}</p>}
      {failed && <div style={{ marginBottom: 12 }}><Banner kind="error">{t("err.network")}</Banner></div>}
      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card muted">{t(current.empty)}</div> : (
        <div role="list">
          {rows.map((r) => <div role="listitem" key={r.id}><IssueCard issue={r} showRank={tab === "open"} /></div>)}
        </div>
      )}
    </main>
  );
}
