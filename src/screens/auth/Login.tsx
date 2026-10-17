import { Link, Navigate } from "react-router-dom";
import { useShouldLeaveGuestPage } from "../../features/auth/useRedirectIfSignedIn";
import { useI18n } from "../../i18n";
import { useTitle } from "../../lib/useTitle";
import { IconHouse, IconUsers } from "../../components/ui/Icons";

export default function Login() {
  const { t } = useI18n();
  useTitle(t("login.signIn"));
  const leave = useShouldLeaveGuestPage(false);
  if (leave) return <Navigate to="/" replace />;
  return (
    <main className="screen no-nav">
      <section className="hero">
        <div className="row" style={{ marginBottom: 16 }}>
          <img src="/favicon.svg" width={52} height={52} alt="" />
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 26 }}>{t("app.name")}</div>
            <div style={{ fontWeight: 700 }}>{t("app.township")}</div>
          </div>
        </div>
        <h1>{t("login.title")}</h1>
        <p style={{ marginTop: 8 }}>{t("login.subtitle")}</p>
      </section>

      <div className="stack">
        <Link to="/login/owner" className="btn btn-role">
          <span className="role-icon" style={{ background: "var(--color-tint-red)", color: "var(--color-red)" }}><IconHouse /></span>
          <span><strong>{t("login.owner")}</strong><span className="sub">{t("login.ownerSub")}</span></span>
        </Link>
        <Link to="/login/sub-owner" className="btn btn-role">
          <span className="role-icon" style={{ background: "var(--color-tint-amber)", color: "#9A5B00" }}><IconUsers /></span>
          <span><strong>{t("login.subOwner")}</strong><span className="sub">{t("login.subOwnerSub")}</span></span>
        </Link>
      </div>

      <p className="center" style={{ marginTop: 24 }}>
        <Link to="/signup">{t("login.create")}</Link>
      </p>
      <p className="center small muted" style={{ marginTop: 32 }}>
        <Link to="/admin/login" style={{ color: "var(--color-muted)", fontWeight: 600 }}>{t("login.staff")}</Link>
      </p>
    </main>
  );
}
