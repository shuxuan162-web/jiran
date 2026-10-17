// Thin presentational building blocks. No data access here: pass props in.
import { useId, type ReactNode, type InputHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { env } from "../../config/env";
import { useI18n, type StringKey } from "../../i18n";
import { IconAlert, IconBack, IconCheck, IconInfo, IconPlay } from "./Icons";

export function DemoBanner() {
  const { t } = useI18n();
  if (!env.demoMode) return null;
  return <div className="demo-banner" role="note">{t("demo.banner")}</div>;
}

export function TopBar({ title, back, right }: { title: string; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" aria-label={t("common.back")}
          onClick={() => (typeof back === "string" ? nav(back) : nav(-1))}>
          <IconBack />
        </button>
      )}
      <h1 className="grow">{title}</h1>
      {right}
    </header>
  );
}

export function Banner({ kind = "info", children }: { kind?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const Icon = kind === "success" ? IconCheck : kind === "info" ? IconInfo : IconAlert;
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
};
export function Field({ label, hint, error, optional, ...input }: FieldProps) {
  const id = useId();
  const { t } = useI18n();
  return (
    <label className="field" htmlFor={id}>
      <span className="label">{label}{optional && <span className="muted"> ({t("common.optional")})</span>}</span>
      <input id={id} className="input" aria-invalid={!!error} aria-describedby={`${id}-h ${id}-e`} {...input} />
      {hint && <span className="hint" id={`${id}-h`}>{hint}</span>}
      {error && <span className="error" id={`${id}-e`}>{error}</span>}
    </label>
  );
}

export function SelectField({ label, value, onChange, children, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void; children: ReactNode; hint?: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="label">{label}</span>
      <select id={id} className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div role="status" aria-live="polite"><div className="spinner" /><span className="sr-only">{label ?? t("common.loading")}</span></div>;
}

export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading Jiran">
      <div className="center">
        <img src="/favicon.svg" width={72} height={72} alt="" />
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 28, marginTop: 8 }}>Jiran</div>
        <div className="spinner" />
      </div>
    </div>
  );
}

const RING: Record<string, string> = {
  red: "var(--color-red)", orange: "var(--color-orange)", amber: "var(--color-amber)",
  green: "var(--color-success)", blue: "#2F6FB3",
};

/** Placeholder avatar (initial on a coloured ring). The character editor replaces it in phase 5. */
export function Avatar({ name, config, size = 48 }: { name: string; config?: Record<string, unknown>; size?: number }) {
  const ring = RING[String(config?.ring ?? "orange")] ?? RING.orange;
  return (
    <span className="avatar" aria-hidden="true"
      style={{ width: size, height: size, background: ring, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ComingSoon({ feature, extra }: { feature: string; extra?: StringKey }) {
  const { t } = useI18n();
  return (
    <div className="card soon pop-in">
      <div className="art"><IconPlay /></div>
      <h2 style={{ fontSize: "1.25rem", marginBottom: 8 }}>{t("soon.title", { feature })}</h2>
      <p className="muted">{t("soon.body")}</p>
      {extra && <Banner kind="warn">{t(extra)}</Banner>}
    </div>
  );
}

export function ProgressSteps({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress-steps" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < step ? "on" : ""} />)}
    </div>
  );
}
