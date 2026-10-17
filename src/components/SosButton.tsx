import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../i18n";
import { useSos } from "../features/sos/SosProvider";
import { IconSOS } from "./ui/Icons";

export const HOLD_MS = 1500;

/**
 * SOS trigger, mixed mode:
 * - "big" (Residence, Emergency screen): one tap fires instantly, no dialog.
 * - "small" (Map, next to the report button): press and hold 1.5 s with a filling ring, so a stray tap does nothing.
 * Keyboard: Enter/Space works the same way (tap or hold).
 */
export default function SosButton({ variant }: { variant: "big" | "small" }) {
  const { t } = useI18n();
  const { fire } = useSos();
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stop = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };
  useEffect(() => stop, []);

  const tick = () => {
    if (start.current == null) return;
    const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) { stop(); if (navigator.vibrate) navigator.vibrate(200); fire(); return; }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (start.current != null) return;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  if (variant === "big") {
    return (
      <button type="button" className="sos-big" onClick={() => fire()}>
        <IconSOS /> {t("res.sos")}
      </button>
    );
  }

  const onKeyDown = (e: KeyboardEvent) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); begin(); } };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") stop(); };
  const deg = Math.round(progress * 360);
  return (
    <button type="button" className="sos-small" aria-label={t("sos.holdLabel")}
      style={{ background: `conic-gradient(var(--color-white) ${deg}deg, transparent ${deg}deg)` }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); begin(); }}
      onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <span className="sos-small-core">SOS</span>
      <span className="sr-only" aria-live="polite">{progress > 0 ? t("sos.holding") : ""}</span>
    </button>
  );
}
