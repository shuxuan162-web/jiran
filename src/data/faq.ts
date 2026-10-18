// FAQ: how Jiran works, plus contact details verified on the official site (docs/elmina-facts.md).
// Nothing here states township rules, fees or schedules we haven't been given.

export interface Faq { id: string; cat: "reporting" | "emergency" | "community" | "account" | "services" | "contact"; q: string; a: string; link?: { to: string; label: string }; keys: string[] }

export const FAQS: Faq[] = [
  { id: "report", cat: "reporting", q: "How do I report a problem like a pothole or a broken street light?",
    a: "Tap the + button on the Map or Residence tab, drop a pin, pick a category and describe it. You get a reference number and can follow every step in Profile > My activity.",
    link: { to: "/app/report", label: "Report an issue" }, keys: ["report", "pothole", "lamp", "light", "drain", "complaint", "aduan"] },
  { id: "priority", cat: "reporting", q: "Why is my report not at the top of the list?",
    a: "Reports are ordered by a published formula: how serious it is, how many neighbours upvoted, how many homes are affected and how long it has waited. Emergencies always come first. Upvote reports that affect you too.",
    link: { to: "/app/issues", label: "See the queue" }, keys: ["priority", "queue", "order", "slow", "upvote", "rank"] },
  { id: "duplicate", cat: "reporting", q: "Someone already reported the same thing. What should I do?",
    a: "Upvote their report instead of sending a new one. When you report, Jiran shows similar reports nearby so you can upvote with one tap.",
    keys: ["duplicate", "same", "already", "upvote"] },
  { id: "fixed", cat: "reporting", q: "It says fixed, but it isn't. What now?",
    a: "Open the report and answer \"No, not fixed\". It reopens with a higher priority and township management is told.",
    keys: ["fixed", "not fixed", "reopen", "still broken"] },
  { id: "sos", cat: "emergency", q: "What happens when I press SOS?",
    a: "Township management and the security desk are alerted at once with your location, and your phone offers to call 999. In demo mode no real call is made. Use SOS only for real danger; false alarms can pause SOS on your account.",
    link: { to: "/app/emergency", label: "Emergency screen" }, keys: ["sos", "emergency", "999", "danger", "kecemasan", "help"] },
  { id: "privacy-map", cat: "account", q: "Can neighbours see where I live?",
    a: "No. Neighbours see your nickname and character only. On the map you appear at your precinct level (and only when at least 5 residents there are visible), never at your unit. You can hide yourself or use ghost mode in Settings.",
    link: { to: "/app/profile/settings", label: "Settings" }, keys: ["privacy", "location", "address", "hide", "ghost", "map"] },
  { id: "subowner", cat: "account", q: "How do I add my family or tenant?",
    a: "Owners can invite up to 6 sub-owners from Profile > Register sub-owner. They get an invite link and set their own password.",
    link: { to: "/app/profile/sub-owners", label: "Sub-owners" }, keys: ["family", "tenant", "sub-owner", "invite", "add"] },
  { id: "visitor", cat: "services", q: "How do I register a visitor?",
    a: "Go to Services > Visitor passes, enter your visitor's name, car plate and date, then share the QR code with them. The guard scans it at the entrance and you get a notification when they arrive.",
    link: { to: "/app/services/visitors", label: "Visitor passes" }, keys: ["visitor", "guest", "pass", "qr", "guard", "pelawat"] },
  { id: "service", cat: "services", q: "How do I request help inside my home or for an access card?",
    a: "Use Services > Service requests. Pick a category, describe what you need and a preferred time. Everyone in your household can follow the request.",
    link: { to: "/app/services/requests", label: "Service requests" }, keys: ["aircond", "plumbing", "access card", "repair", "service", "renovation"] },
  { id: "billing", cat: "services", q: "Can I pay my bills in Jiran?",
    a: "Not yet. Owners can see reminders and due dates under Billing, but payment is made through the usual official channels.",
    link: { to: "/app/billing", label: "Billing" }, keys: ["bill", "pay", "payment", "fee", "maintenance fee", "bil"] },
  { id: "xp", cat: "community", q: "What are XP and levels for?",
    a: "XP thanks you for helping the neighbourhood: accepted reports, confirming fixes, joining events. It only unlocks looks for your character. It never changes how fast a report is fixed.",
    link: { to: "/app/rewards", label: "Rewards" }, keys: ["xp", "level", "points", "badge", "quest", "reward"] },
  { id: "event", cat: "community", q: "How do I check in at an event?",
    a: "On the day, open the event and tap Check in when you are there, or scan the host's QR code with Scan QR.",
    link: { to: "/app/scan", label: "Scan QR" }, keys: ["event", "check in", "qr", "scan", "acara"] },
  { id: "contact", cat: "contact", q: "How do I contact Sime Darby Property?",
    a: "Toll-free line 1-800-88-1118, Monday to Friday 8.30am to 5.30pm (excluding public holidays). From outside Malaysia call +603-7849 5000. The City of Elmina page also lists +603-7849 5700.",
    keys: ["contact", "phone", "call", "number", "hotline", "sime darby", "hubungi"] },
  { id: "mall", cat: "contact", q: "When is Elmina Lakeside Mall open?",
    a: "Monday to Sunday, 10.00am to 10.00pm, as listed on the official mall page. The Mall tab has the shop directory.",
    link: { to: "/app/mall", label: "Mall" }, keys: ["mall", "lakeside", "shop", "open", "hours"] },
];

/** Simple rule-based helper: scores questions by keyword hits in what the resident typed. */
export function searchFaq(query: string): Faq[] {
  const q = query.toLowerCase().trim();
  if (!q) return FAQS;
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return FAQS.map((f) => {
    const hay = `${f.q} ${f.a}`.toLowerCase();
    let score = 0;
    for (const k of f.keys) if (q.includes(k)) score += 3;
    for (const w of words) if (hay.includes(w)) score += 1;
    return { f, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.f);
}
