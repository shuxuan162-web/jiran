// Issue building blocks shared by resident and admin screens.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n, type StringKey } from "../i18n";
import { LEVEL_ICON, ageHours, priorityLevel, statusKey, whyParts, type IssueStatus, type Level } from "../lib/scoring/labels";
import { unreadCount, type IssueRow } from "../features/issues/api";
import { IconBell, IconChat, IconPin } from "./ui/Icons";

const LEVEL_CLASS: Record<Level, string> = { low: "lvl-low", medium: "lvl-medium", high: "lvl-high", urgent: "lvl-urgent" };

/** Priority as icon + word, never colour alone. */
export function PriorityLabel({ p }: { p: number | null | undefined }) {
  const { t } = useI18n();
  const lvl = priorityLevel(p);
  return (
    <span className={`chip ${LEVEL_CLASS[lvl]}`}>
      <span aria-hidden="true">{LEVEL_ICON[lvl]}</span> {t(`level.${lvl}` as StringKey)}
    </span>
  );
}

export function StatusChip({ status }: { status: IssueStatus }) {
  const { t } = useI18n();
  const cls = status === "resolved" ? "green" : status === "rejected" || status === "duplicate" ? "" : "blue";
  return <span className={`chip ${cls}`}>{t(statusKey(status))}</span>;
}

export function WhyLine({ issue }: { issue: Pick<IssueRow, "affected_units" | "upvote_count" | "created_at" | "severity"> }) {
  const { t } = useI18n();
  const parts = whyParts({ affected: issue.affected_units, votes: issue.upvote_count, ageHours: ageHours(issue.created_at), severity: issue.severity });
  return <span className="small muted">{parts.map((x) => t(x.key, { n: x.n })).join(" · ")}</span>;
}

export function CategoryName({ slug }: { slug: string }) {
  const { t } = useI18n();
  return <>{t(`cat.${slug}` as StringKey)}</>;
}

export function IssueCard({ issue, showRank = true }: { issue: IssueRow; showRank?: boolean }) {
  const { t } = useI18n();
  const open = issue.queue_rank != null;
  return (
    <Link to={`/app/issues/${issue.id}`} className="issue-card">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {open ? <PriorityLabel p={issue.p} /> : null}
        <StatusChip status={issue.status} />
        {showRank && open && <span className="small muted" style={{ marginLeft: "auto" }}>#{issue.queue_rank}</span>}
      </div>
      <strong className="issue-title"><CategoryName slug={issue.category} /></strong>
      <span className="issue-desc">{issue.description}</span>
      <div className="row small muted" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="row" style={{ gap: 4 }}><IconPin width={16} />{issue.area_name ?? t("issue.nearby")}</span>
        <span>▲ {issue.upvote_count}</span>
        <span>{issue.ref_no}</span>
      </div>
      {open && <WhyLine issue={issue} />}
    </Link>
  );
}

/** Bell with unread count. Updates live (realtime) with a 30 s polling fallback. */
export function NotificationBell() {
  const { t } = useI18n();
  const [n, setN] = useState(0);
  const refresh = useCallback(() => { unreadCount().then(setN); }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    const ch = supabase.channel(`bell-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh)
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(ch); };
  }, [refresh]);
  const label = n > 0 ? t("bell.labelUnread", { n }) : t("bell.label");
  return (
    <Link to="/app/notifications" className="icon-btn" aria-label={label}>
      <IconBell />
      {n > 0 && <span className="badge-dot" aria-hidden="true">{n > 9 ? "9+" : n}</span>}
    </Link>
  );
}

export function CommentCount({ n }: { n: number }) {
  return <span className="row small muted" style={{ gap: 4 }}><IconChat width={16} />{n}</span>;
}

/** Map pin HTML (text label inside, so colour is never the only signal). */
export function issuePinHtml(level: Level) {
  return `<div class="pin pin-${level}"><span>${LEVEL_ICON[level]}</span></div>`;
}
