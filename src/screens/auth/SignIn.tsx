import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useShouldLeaveGuestPage } from "../../features/auth/useRedirectIfSignedIn";
import { supabase } from "../../lib/supabase";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { isValidEmail } from "../../lib/validation";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, TopBar } from "../../components/ui/parts";

type Mode = "owner" | "sub_owner" | "staff";

/** Shared email + password sign-in. Checks that the account matches the door used. */
export default function SignIn({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [primeNote, setPrimeNote] = useState(false);

  const title = mode === "owner" ? t("login.ownerTitle") : mode === "sub_owner" ? t("login.subOwnerTitle") : t("admin.login");
  useTitle(title);
  const valid = isValidEmail(email) && password.length > 0;
  const leave = useShouldLeaveGuestPage(busy);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      setErr(error?.status === 429 ? "err.rate_limited" : errorKey(error));
      return;
    }
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const role = prof?.role as string | undefined;
    const staff = role === "management" || role === "security";
    let wrong: StringKey | null = null;
    if (mode === "staff" && !staff) wrong = "admin.notStaff";
    if (mode === "owner" && role === "sub_owner") wrong = "login.wrongTypeOwner";
    if (mode === "sub_owner" && role === "owner") wrong = "login.wrongTypeSub";
    if (mode !== "staff" && staff) wrong = "login.staffHere";
    if (wrong) {
      await supabase.auth.signOut();
      setBusy(false);
      setErr(wrong);
      return;
    }
    nav(mode === "staff" ? "/admin" : "/", { replace: true });
  }

  if (leave) return <Navigate to={mode === "staff" ? "/admin" : "/"} replace />;

  return (
    <main className="screen no-nav">
      <TopBar title={title} back={mode === "staff" ? "/login" : "/login"} />
      {mode === "sub_owner" && <div style={{ marginBottom: 16 }}><Banner kind="info">{t("login.subOwnerHint")}</Banner></div>}
      {mode === "staff" && <p className="muted">{t("admin.loginHint")}</p>}
      <form onSubmit={submit} noValidate>
        <Field label={t("login.email")} type="email" autoComplete="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required />
        <Field label={t("login.password")} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}
        <button className="btn btn-primary" type="submit" disabled={!valid || busy}>
          {busy ? t("common.loading") : t("login.signIn")}
        </button>
      </form>

      {mode === "owner" && (
        <>
          <button className="btn btn-secondary" style={{ marginTop: 12 }} type="button" onClick={() => setPrimeNote(true)}>
            {t("login.prime")}
          </button>
          {primeNote && <div style={{ marginTop: 12 }}><Banner kind="info">{t("login.primeSoon")}</Banner></div>}
          <p className="center" style={{ marginTop: 24 }}><Link to="/signup">{t("login.create")}</Link></p>
        </>
      )}
    </main>
  );
}
