// Small stroke icons (24px grid, currentColor). Decorative by default (aria-hidden);
// every icon is paired with visible text wherever it carries meaning.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props,
});

export const IconBack = (p: P) => <svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>;
export const IconChevron = (p: P) => <svg {...base(p)}><path d="M9 18l6-6-6-6" /></svg>;
export const IconBell = (p: P) => <svg {...base(p)}><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></svg>;
export const IconMegaphone = (p: P) => <svg {...base(p)}><path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M15.5 8.5a5 5 0 010 7" /><path d="M18.5 5.5a9 9 0 010 13" /></svg>;
export const IconBag = (p: P) => <svg {...base(p)}><path d="M6 7h12l1 13H5L6 7z" /><path d="M9 10V6a3 3 0 016 0v4" /></svg>;
export const IconPin = (p: P) => <svg {...base(p)}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
export const IconHouse = (p: P) => <svg {...base(p)}><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>;
export const IconPerson = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>;
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" /><path d="M16 4.5a3.5 3.5 0 010 7" /><path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7" /></svg>;
export const IconAlert = (p: P) => <svg {...base(p)}><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
export const IconSOS = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 16.5h.01" /></svg>;
export const IconChat = (p: P) => <svg {...base(p)}><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>;
export const IconWrench = (p: P) => <svg {...base(p)}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" /></svg>;
export const IconClipboard = (p: P) => <svg {...base(p)}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 11h6" /><path d="M9 15h4" /></svg>;
export const IconStar = (p: P) => <svg {...base(p)}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" /></svg>;
export const IconHelp = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.5" /><path d="M12 17h.01" /></svg>;
export const IconCalendar = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>;
export const IconReceipt = (p: P) => <svg {...base(p)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6" /><path d="M9 12h6" /></svg>;
export const IconQR = (p: P) => <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3z" /><path d="M20 14v.01" /><path d="M14 20h.01" /><path d="M17 20h4v-3" /></svg>;
export const IconMail = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
export const IconSettings = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
export const IconLogout = (p: P) => <svg {...base(p)}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>;
export const IconShield = (p: P) => <svg {...base(p)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>;
export const IconCar = (p: P) => <svg {...base(p)}><path d="M5 17h14v-5l-2-5H7l-2 5v5z" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /><path d="M5 12h14" /></svg>;
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>;
export const IconX = (p: P) => <svg {...base(p)}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>;
export const IconUpload = (p: P) => <svg {...base(p)}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>;
export const IconInfo = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>;
export const IconChart = (p: P) => <svg {...base(p)}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>;
export const IconList = (p: P) => <svg {...base(p)}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
export const IconHeart = (p: P) => <svg {...base(p)}><path d="M12 20s-7-4.4-9-9a5 5 0 019-3.3A5 5 0 0121 11c-2 4.6-9 9-9 9z" /></svg>;
export const IconPlay = (p: P) => <svg {...base(p)}><path d="M6 4l14 8-14 8V4z" /></svg>;
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></svg>;
export const IconTrophy = (p: P) => <svg {...base(p)}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M17 5h3v2a3 3 0 01-3 3" /><path d="M7 5H4v2a3 3 0 003 3" /></svg>;
