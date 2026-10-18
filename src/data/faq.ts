// FAQ search. The questions themselves live in the database (0012_surveys_faq.sql) so management can edit them.

export interface FaqItem { id: string; question: string; answer: string; keywords: string[] }

/** Simple rule-based helper: scores questions by keyword hits in what the resident typed. */
export function searchFaq<T extends FaqItem>(items: T[], query: string): T[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return items.map((f) => {
    const hay = `${f.question} ${f.answer}`.toLowerCase();
    let score = 0;
    for (const k of f.keywords) if (q.includes(k.toLowerCase())) score += 3;
    for (const w of words) if (hay.includes(w)) score += 1;
    return { f, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.f);
}
