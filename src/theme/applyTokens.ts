import { tokens } from "./tokens";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

/** Writes every token to :root as a CSS custom property, e.g. --color-red, --radius-md. */
export function applyTokens(root: HTMLElement = document.documentElement) {
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  for (const [k, v] of Object.entries(tokens.color)) set(`--color-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(tokens.gradient)) set(`--gradient-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(tokens.font)) set(`--font-${k}`, v);
  for (const [k, v] of Object.entries(tokens.size)) set(`--size-${k}`, `${v / 16}rem`);
  for (const [k, v] of Object.entries(tokens.radius)) set(`--radius-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(tokens.space)) set(`--space-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(tokens.tap)) set(`--tap-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(tokens.shadow)) set(`--shadow-${k}`, v);
}
