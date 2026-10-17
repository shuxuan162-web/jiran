// Twin of public.priority_from() in supabase/migrations/0002_issues.sql.
// P = 0.40·S + 0.25·U + 0.20·A + 0.15·T, each component 0-100.
// The database is the source of truth; this copy explains a score in the UI
// and is pinned to the SQL by shared fixtures in priority.test.ts.

export interface Weights { severity: number; upvotes: number; affected: number; waiting: number }
export const DEFAULT_WEIGHTS: Weights = { severity: 0.4, upvotes: 0.25, affected: 0.2, waiting: 0.15 };
export const WAITING_CAP_DAYS = 14;

const clamp = (x: number) => Math.min(100, Math.max(0, x));
const round1 = (x: number) => Math.round(x * 10 + Number.EPSILON) / 10;

export interface PriorityInput {
  severity: number;
  votes: number; maxVotes: number;
  affected: number; maxAffected: number;
  ageHours: number;
}

export function components(i: PriorityInput, capDays = WAITING_CAP_DAYS) {
  return {
    s: clamp(i.severity),
    u: i.maxVotes <= 0 ? 0 : clamp((100 * i.votes) / i.maxVotes),
    a: i.maxAffected <= 0 ? 0 : clamp((100 * i.affected) / i.maxAffected),
    t: clamp((100 * Math.max(0, i.ageHours)) / (capDays * 24)),
  };
}

export function priorityFrom(i: PriorityInput, w: Weights = DEFAULT_WEIGHTS, capDays = WAITING_CAP_DAYS): number {
  const c = components(i, capDays);
  return round1(w.severity * c.s + w.upvotes * c.u + w.affected * c.a + w.waiting * c.t);
}
