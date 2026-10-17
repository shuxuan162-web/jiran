import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { uploadAndSubmitCertificate } from "../../features/auth/onboarding";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { fileProblem } from "../../lib/validation";
import { useTitle } from "../../lib/useTitle";
import { Banner, Spinner, TopBar } from "../../components/ui/parts";
import { FilePicker } from "../../components/ui/FilePicker";
import { IconCheck, IconX } from "../../components/ui/Icons";

interface Ver { id: string; status: "submitted" | "under_review" | "verified" | "rejected"; doc_paths: string[]; reason: string | null; submitted_at: string; }

export default function Verification() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { session, priv, refresh, signOut } = useAuth();
  useTitle(t("verify.title"));
  const [ver, setVer] = useState<Ver | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("ownership_verifications").select("id,status,doc_paths,reason,submitted_at")
      .order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    if (error) setErr("err.network");
    setVer((data as Ver) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 15000); // management may decide at any moment
    return () => window.clearInterval(id);
  }, [load]);

  if (!session) return <Navigate to="/login" replace />;

  async function upload() {
    if (!file || !session) return;
    const p = fileProblem(file);
    if (p) { setErr(`err.${p}` as StringKey); return; }
    setBusy(true);
    setErr(null);
    try {
      await uploadAndSubmitCertificate(session.user.id, file);
      setFile(null);
      setFixing(false);
      await load();
    } catch (e) {
      setErr(errorKey(e));
    }
    setBusy(false);
  }

  async function enter() {
    await refresh();
    nav("/app", { replace: true });
  }

  const status = ver?.status ?? "submitted";
  const hasDoc = (ver?.doc_paths?.length ?? 0) > 0;
  const steps: { key: StringKey; sub: StringKey; state: "done" | "current" | "todo" | "failed" }[] = [
    { key: "verify.submitted", sub: "verify.submittedSub", state: "done" },
    { key: status === "rejected" ? "verify.rejected" : "verify.review", sub: "verify.reviewSub",
      state: status === "verified" ? "done" : status === "rejected" ? "failed" : hasDoc ? "current" : "todo" },
    { key: "verify.verified", sub: "verify.verifiedSub", state: status === "verified" ? "done" : "todo" },
  ];

  return (
    <main className="screen no-nav">
      <TopBar title={t("verify.title")} right={<button className="link-btn" onClick={() => signOut()}>{t("profile.logout")}</button>} />
      <p>{t("verify.lead")}</p>
      {priv && <p className="muted small">{priv.full_name} · {priv.email}</p>}

      {loading ? <Spinner /> : (
        <div className="card" aria-live="polite">
          <ol className="stepper">
            {steps.map((s, i) => (
              <li key={i} className={s.state}>
                <span className="dot">{s.state === "done" ? <IconCheck width={18} /> : s.state === "failed" ? <IconX width={18} /> : i + 1}</span>
                <div>
                  <strong>{t(s.key)}</strong>
                  <span className="muted">{s.state === "failed" && ver?.reason ? t("verify.reason", { reason: ver.reason }) : t(s.sub)}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div style={{ marginTop: 16 }} className="stack">
        {status === "verified" && (
          <button className="btn btn-success" onClick={enter}>{t("verify.enter")}</button>
        )}

        {status !== "verified" && !loading && (!hasDoc || fixing) && (
          <div className="card">
            {!hasDoc && <p style={{ fontWeight: 700 }}>{t("verify.needDoc")}</p>}
            <FilePicker file={file} onPick={setFile} />
            <button className="btn btn-primary" disabled={!file || busy} onClick={upload}>
              {busy ? t("signup.uploading") : status === "rejected" ? t("verify.fix") : t("verify.upload")}
            </button>
          </div>
        )}

        {status === "rejected" && !fixing && hasDoc && (
          <button className="btn btn-primary" onClick={() => setFixing(true)}>{t("verify.fix")}</button>
        )}

        {hasDoc && status === "submitted" && <Banner kind="success">{t("verify.docSent")} {t("verify.checking")}</Banner>}
        {err && <Banner kind="error">{t(err)}</Banner>}

        <Link to="/emails" className="btn btn-ghost">{t("verify.emails")}</Link>
      </div>
    </main>
  );
}
