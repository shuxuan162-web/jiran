// Service request status flow, shared by the screens. The database enforces the same rules (update_service_request).

export type SrStatus = "submitted" | "acknowledged" | "assigned" | "in_progress" | "completed" | "cancelled";
export const SR_FLOW: SrStatus[] = ["submitted", "acknowledged", "assigned", "in_progress", "completed"];

/** Statuses management can move to next: forward only; cancelled any time before completion. */
export function nextStatuses(s: SrStatus): SrStatus[] {
  if (s === "completed" || s === "cancelled") return [];
  const i = SR_FLOW.indexOf(s);
  return [...SR_FLOW.slice(i + 1), "cancelled"];
}
/** "Assigned" and later need someone handling it. */
export const needsHandler = (s: SrStatus) => s === "assigned" || s === "in_progress" || s === "completed";
/** The requester can cancel until someone is assigned. */
export const residentCanCancel = (s: SrStatus, mine: boolean) => mine && (s === "submitted" || s === "acknowledged");
/** Rating once, by the requester, after completion. */
export const residentCanRate = (s: SrStatus, mine: boolean, rating: number | null) => mine && s === "completed" && rating == null;
/** Where a request sits on the five-step timeline (cancelled shows where it stopped). */
export function stepIndex(history: { status: string }[]): number {
  let best = 0;
  for (const h of history) { const i = SR_FLOW.indexOf(h.status as SrStatus); if (i > best) best = i; }
  return best;
}
