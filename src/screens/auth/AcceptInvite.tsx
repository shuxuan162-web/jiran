import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useShouldLeaveGuestPage } from "../../features/auth/useRedirectIfSignedIn";
import { supabase } from "../../lib/supabase";
import { callFunction } from "../../lib/functions";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { isInviteToken, isValidNickname, passwordProblem } from "../../lib/validation";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, Spinner, TopBar } from "../../components/ui/parts";

interface Invite { name: string; email: string; state: "invited" | "active" | "revoked" | "expired"; owner_nickname: string; }

export default function AcceptInvite() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { token = "" } = useParams();
  useTitle(t("invite.title"));
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);

  useEffect(() => {
    if (!isInviteToken(token)) { setInv(null); return; }
    supabase.rpc("lookup_invite", { p_token: token }).then(({ data, error }) => {
      if (error) { setErr("err.network"); setInv(null); return; }
      setInv(((data as Invite[]) ?? [])[0] ?? null);
    });
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!inv || !isValidNickname(nickname) || passwordProblem(password)) return;
    setBusy(true);
    setErr(null);
    const res = await callFunction<{ email: string }>("accept-invite", { token, password, nickname: nickname.trim() });
    if (res.error || !res.data) { setBusy(false); setErr(errorKey(res.error)); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: res.data.email, password });
    if (error) { nav("/login/sub-owner"); return; }
    nav("/", { replace: true });
  }

  const leave = useShouldLeaveGuestPage(busy);
  if (leave) return <Navigate to="/" replace />;

  const blocked: StringKey | null = inv === null ? "invite.invalid"
    : inv?.state === "expired" ? "invite.expired"
    : inv?.state === "active" ? "invite.used"
    : inv?.state === "revoked" ? "invite.revoked" : null;

  return (
    <main className="screen no-nav">
      <TopBar title={t("invite.title")} back="/login" />
      {inv === undefined && <Spinner />}
      {blocked && (
        <div className="stack">
          <Banner kind="error">{t(blocked)}</Banner>
          <Link to="/login/sub-owner" className="btn btn-secondary">{t("login.subOwner")}</Link>
        </div>
      )}
      {inv && !blocked && (
        <form onSubmit={submit} noValidate>
          <p style={{ fontWeight: 700 }}>{t("invite.lead", { owner: inv.owner_nickname })}</p>
          <p className="muted">{t("invite.for", { name: inv.name, email: inv.email })}</p>
          <Field label={t("signup.nickname")} value={nickname} onChange={(e) => setNickname(e.target.value)}
            hint={t("signup.nicknameHint")} spellCheck={false}
            error={touched && !isValidNickname(nickname) ? t("err.bad_nickname") : null} />
          <Field label={t("invite.setPassword")} type="password" autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)} hint={t("signup.passwordHint")}
            error={touched && passwordProblem(password) ? t("err.weak_password") : null} />
          {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t("common.loading") : t("invite.join")}</button>
        </form>
      )}
    </main>
  );
}
