import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useI18n } from "../i18n";
import { Banner } from "./ui/parts";

type CamState = "idle" | "starting" | "on" | "denied" | "nocamera" | "insecure" | "error";

/**
 * Camera QR scanner. The camera starts only when the person taps "Turn on camera" (browsers require a tap,
 * and iPhones block auto-start). Frames are read on the phone with jsQR; nothing is uploaded.
 * Always offers typing the code instead, for denied cameras and laptops without one.
 */
export default function QrScanner({ onResult, paused = false, manualLabel }: {
  onResult: (text: string) => void; paused?: boolean; manualLabel: string;
}) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  const [state, setState] = useState<CamState>("idle");
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) { stop(); setState((s) => (s === "on" ? "idle" : s)); } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  const tick = useCallback(() => {
    const v = video.current, c = canvas.current;
    if (v && c && v.readyState >= 2 && !paused) {
      const w = v.videoWidth, h = v.videoHeight;
      const scale = Math.min(1, 640 / Math.max(w, h));
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          const now = Date.now();
          // ignore the same code for 3 s so one scan doesn't fire twice
          if (!last.current || last.current.text !== code.data || now - last.current.at > 3000) {
            last.current = { text: code.data, at: now };
            if (navigator.vibrate) navigator.vibrate(60);
            onResult(code.data);
          }
        }
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, [onResult, paused]);

  async function start() {
    if (!window.isSecureContext) { setState("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState("nocamera"); return; }
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        video.current.setAttribute("playsinline", "true");
        await video.current.play();
      }
      setState("on");
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "error");
      stop();
    }
  }
  // restart the frame loop when the callback changes
  useEffect(() => {
    if (state !== "on") return;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, [tick, state]);

  return (
    <div className="qr-scanner">
      <div className={`qr-viewport${state === "on" ? " live" : ""}`}>
        <video ref={video} muted playsInline aria-label={t("qr.cameraView")} />
        <canvas ref={canvas} hidden />
        {state === "on" && <span className="qr-frame" aria-hidden="true" />}
        {state !== "on" && (
          <div className="qr-overlay">
            <span className="qr-icon" aria-hidden="true">▣</span>
            <button type="button" className="btn btn-primary btn-small" onClick={start} disabled={state === "starting"}>
              {state === "starting" ? t("qr.starting") : t("qr.turnOn")}
            </button>
            <span className="small">{t("qr.privacy")}</span>
          </div>
        )}
      </div>
      {state === "on" && (
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <span className="small muted" aria-live="polite">{paused ? t("qr.paused") : t("qr.pointAt")}</span>
          <button type="button" className="link-btn" onClick={() => { stop(); setState("idle"); }}>{t("qr.turnOff")}</button>
        </div>
      )}
      {state === "denied" && <div style={{ marginTop: 10 }}><Banner kind="warn">{t("qr.denied")}</Banner></div>}
      {state === "nocamera" && <div style={{ marginTop: 10 }}><Banner kind="info">{t("qr.noCamera")}</Banner></div>}
      {state === "insecure" && <div style={{ marginTop: 10 }}><Banner kind="warn">{t("qr.insecure")}</Banner></div>}
      {state === "error" && <div style={{ marginTop: 10 }}><Banner kind="error">{t("qr.error")}</Banner></div>}

      <form className="row qr-manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onResult(manual.trim()); }}>
        <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={manualLabel} aria-label={manualLabel}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button className="btn btn-secondary btn-small" type="submit" disabled={!manual.trim()}>{t("qr.go")}</button>
      </form>
    </div>
  );
}
