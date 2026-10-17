// Jiran design tokens: the ONE place for colours, type, spacing and radii.
// A designer restyles the whole app by editing this file. Components read these
// values through CSS custom properties (see applyTokens), never hard-coded hex.

export const tokens = {
  color: {
    red: "#D71920",        // primary buttons, active tab, key actions
    orange: "#F26522",     // gradients, High priority
    amber: "#FDB515",      // gradients, Medium priority, XP and badges
    cream: "#FBF4EA",      // app background
    ink: "#2B2220",        // main text
    muted: "#5E524C",      // secondary text
    success: "#1F7A5C",    // confirmed, resolved, verified
    urgent: "#A60F15",     // SOS, emergencies
    white: "#FFFFFF",
    line: "#EADFD1",       // hairlines and borders
    tintRed: "#FBE4E3",
    tintOrange: "#FDE9DD",
    tintAmber: "#FEF2D2",
    tintGreen: "#E0F1E9",
    tintBlue: "#E2EEF8",
    tintPurple: "#EEE7F7",
    mapGreen: "#CFE8C9",
    lake: "#9FD3EA",
    focus: "#1D4ED8",
  },
  gradient: {
    brand: "linear-gradient(135deg, #D71920 0%, #E8411F 45%, #F26522 75%, #FDB515 130%)",
    sos: "linear-gradient(135deg, #A60F15 0%, #D71920 100%)",
    warm: "linear-gradient(180deg, #FFF8EE 0%, #FBF4EA 100%)",
  },
  font: {
    heading: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
    body: "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  // px at text size 100%; the A+ setting scales all of them
  size: { title: 28, section: 18, body: 18, small: 14, button: 18 },
  radius: { sm: 12, md: 16, lg: 22, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  tap: { min: 48, main: 56 },
  shadow: {
    card: "0 2px 10px rgba(43, 34, 32, 0.07)",
    raised: "0 8px 24px rgba(43, 34, 32, 0.14)",
  },
} as const;

export type Tokens = typeof tokens;
