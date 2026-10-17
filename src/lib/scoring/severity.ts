// Twin of public.issue_severity(): category base + keyword boosts (+15 per reopen), capped at 100.
// Keyword patterns are the same strings stored in public.severity_keywords (Postgres \m \M = word boundary).

export const CATEGORY_BASE: Record<string, number> = {
  drain_flood: 70, road: 55, streetlight: 50, water: 65, electrical: 85, tree: 60,
  waste: 40, park: 35, security: 60, pest: 50, noise: 25, other: 30,
};

export const KEYWORDS: [string, number][] = [
  ["\\m(spark\\w*|exposed|live wire|wayar|electrocut\\w*|renjatan)\\M", 20],
  ["\\m(fire|smoke|api|asap|burn\\w*)\\M", 20],
  ["\\m(flood\\w*|banjir|overflow\\w*|melimpah|rising water)\\M", 15],
  ["\\m(child|children|kids?|kanak|budak|school|sekolah)\\M", 10],
  ["\\m(injur\\w*|hurt|accident\\w*|cedera|kemalangan|fell|jatuh|tripped)\\M", 15],
  ["\\m(danger\\w*|bahaya|urgent|segera)\\M", 10],
  ["\\m(aedes|dengue|denggi|stagnant|bertakung)\\M", 15],
  ["\\m(dark|gelap|no light)\\M", 5],
  ["\\m(elderly|warga emas|wheelchair|kerusi roda|oku)\\M", 10],
];

const toJs = (pg: string) => new RegExp(pg.replace(/\\[mM]/g, "\\b"), "i");
const COMPILED = KEYWORDS.map(([p, b]) => [toJs(p), b] as const);

export function severityFor(category: string, text: string, reopened = 0): number {
  const base = CATEGORY_BASE[category] ?? 30;
  const boost = COMPILED.reduce((sum, [re, b]) => (re.test(text ?? "") ? sum + b : sum), 0);
  return Math.min(100, base + boost + 15 * Math.max(0, reopened));
}
