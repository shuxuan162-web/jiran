import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, isStaff, useAuth } from "../features/auth/AuthProvider";
import { I18nProvider, useI18n, type StringKey } from "../i18n";
import { configMissing } from "../config/env";
import { Banner, ComingSoon, DemoBanner, Splash } from "../components/ui/parts";
import Login from "../screens/auth/Login";
import SignIn from "../screens/auth/SignIn";
import CreateAccount from "../screens/auth/CreateAccount";
import Verification from "../screens/auth/Verification";
import AcceptInvite from "../screens/auth/AcceptInvite";
import Shell from "../screens/resident/Shell";
import MapTab from "../screens/resident/MapTab";
import ResidenceTab from "../screens/resident/ResidenceTab";
import { MallTab, PropertiesTab } from "../screens/resident/SimpleTabs";
import ProfileTab from "../screens/resident/ProfileTab";
import SubOwners from "../screens/resident/SubOwners";
import Settings from "../screens/resident/Settings";
import EmailLog from "../screens/resident/EmailLog";
import SoonScreen from "../screens/resident/SoonScreen";
import AdminShell from "../screens/admin/AdminShell";
import Verifications from "../screens/admin/Verifications";
import Health from "../screens/Health";
import IssuesHome from "../screens/resident/issues/IssuesHome";
import ReportIssue from "../screens/resident/issues/ReportIssue";
import IssueDetail from "../screens/resident/issues/IssueDetail";
import Notifications from "../screens/resident/Notifications";
import IssueQueue from "../screens/admin/IssueQueue";
import UrgentPanel from "../screens/admin/UrgentPanel";
import AdminMap from "../screens/admin/AdminMap";
import EmergencyScreen from "../screens/resident/sos/EmergencyScreen";
import EmergencyReport from "../screens/resident/sos/EmergencyReport";
import SosLive from "../screens/resident/sos/SosLive";
import { SosProvider } from "../features/sos/SosProvider";

/** Sends each person to the right place for who they are and where they are in onboarding. */
function Home() {
  const { loading, session, profile, priv } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  if (isStaff(profile?.role)) return <Navigate to="/admin" replace />;
  if (!profile || !priv) return <AccessEnded />;
  if (priv.status === "pending") return <Navigate to="/verification" replace />;
  if (priv.status !== "active") return <AccessEnded />;
  return <Navigate to="/app/map" replace />;
}

/** Residents only, verified and active. Enforced again by RLS in the database. */
function ResidentGate({ children }: { children: ReactNode }) {
  const { loading, session, profile, priv } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  if (isStaff(profile?.role)) return <Navigate to="/admin" replace />;
  if (priv?.status === "pending") return <Navigate to="/verification" replace />;
  if (!profile || priv?.status !== "active") return <AccessEnded />;
  return <>{children}</>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function StaffGate({ children, managementOnly = false }: { children: ReactNode; managementOnly?: boolean }) {
  const { loading, session, profile } = useAuth();
  const { t } = useI18n();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!isStaff(profile?.role) || (managementOnly && profile?.role !== "management")) {
    return <main className="screen no-nav"><Banner kind="error">{t("err.forbidden")}</Banner></main>;
  }
  return <>{children}</>;
}

function AccessEnded() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  return (
    <main className="screen no-nav">
      <h1 style={{ marginBottom: 12 }}>{t("ended.title")}</h1>
      <p>{t("ended.body")}</p>
      <button className="btn btn-primary" onClick={() => signOut()}>{t("profile.logout")}</button>
    </main>
  );
}

function AdminSoon() {
  const { section = "" } = useParams();
  const { t } = useI18n();
  const key = `admin.nav.${section}` as StringKey;
  return <div style={{ maxWidth: 560 }}><ComingSoon feature={t(key) === key ? section : t(key)} /></div>;
}

function ConfigMissing() {
  return (
    <main className="screen no-nav">
      <h1>Setup needed</h1>
      <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example and DEPLOY.md), then rebuild.</p>
    </main>
  );
}

function ResidentFrame({ children }: { children: ReactNode }) {
  return <><DemoBanner /><div className="app-frame">{children}</div></>;
}

export default function App() {
  if (configMissing) return <ConfigMissing />;
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ResidentFrame><Home /></ResidentFrame>} />
            <Route path="/login" element={<ResidentFrame><Login /></ResidentFrame>} />
            <Route path="/login/owner" element={<ResidentFrame><SignIn mode="owner" /></ResidentFrame>} />
            <Route path="/login/sub-owner" element={<ResidentFrame><SignIn mode="sub_owner" /></ResidentFrame>} />
            <Route path="/signup" element={<ResidentFrame><CreateAccount /></ResidentFrame>} />
            <Route path="/invite/:token" element={<ResidentFrame><AcceptInvite /></ResidentFrame>} />
            <Route path="/verification" element={<ResidentFrame><SignedIn><Verification /></SignedIn></ResidentFrame>} />
            <Route path="/emails" element={<ResidentFrame><SignedIn><EmailLog /></SignedIn></ResidentFrame>} />
            <Route path="/health" element={<ResidentFrame><Health /></ResidentFrame>} />

            <Route path="/app" element={<ResidentFrame><ResidentGate><SosProvider><Shell /></SosProvider></ResidentGate></ResidentFrame>}>
              <Route index element={<Navigate to="map" replace />} />
              <Route path="map" element={<MapTab />} />
              <Route path="residence" element={<ResidenceTab />} />
              <Route path="mall" element={<MallTab />} />
              <Route path="properties" element={<PropertiesTab />} />
              <Route path="profile" element={<ProfileTab />} />
              <Route path="profile/sub-owners" element={<SubOwners />} />
              <Route path="profile/settings" element={<Settings />} />
              <Route path="soon/:feature" element={<SoonScreen />} />
              <Route path="issues" element={<IssuesHome />} />
              <Route path="my-reports" element={<IssuesHome initialTab="mine" />} />
              <Route path="issues/:id" element={<IssueDetail />} />
              <Route path="report" element={<ReportIssue />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="emergency" element={<EmergencyScreen />} />
              <Route path="emergency/report" element={<EmergencyReport />} />
              <Route path="sos/:id" element={<SosLive />} />
            </Route>

            <Route path="/admin/login" element={<ResidentFrame><SignIn mode="staff" /></ResidentFrame>} />
            <Route path="/admin" element={<StaffGate><AdminShell /></StaffGate>}>
              <Route index element={<Navigate to="urgent" replace />} />
              <Route path="verifications" element={<StaffGate managementOnly><Verifications /></StaffGate>} />
              <Route path="health" element={<Health embedded />} />
              <Route path="urgent" element={<UrgentPanel />} />
              <Route path="map" element={<AdminMap />} />
              <Route path="issues" element={<StaffGate managementOnly><IssueQueue /></StaffGate>} />
              <Route path="issues/:id" element={<div className="app-frame" style={{ margin: 0 }}><IssueDetail /></div>} />
              <Route path=":section" element={<AdminSoon />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
