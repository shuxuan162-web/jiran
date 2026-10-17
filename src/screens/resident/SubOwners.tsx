import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { useI18n, type StringKey } from "../../i18n";
import { errorKey } from "../../lib/errors";
import { isValidEmail } from "../../lib/validation";
import { useTitle } from "../../lib/useTitle";
import { Banner, Field, Spinner, TopBar } from "../../components/ui/parts";
import { IconCopy } from "../../components/ui/Icons";

interface Invite { id: string; name: string; email: string; status: "invited" | "active" | "revoked"; expires_at: string; created_at: string; }

export default function SubOwners() {
  const { t } = useI18n();
  const { profile } = useAuth();
  useTitle(t("sub.title"));
  const [list, setList] = useState<Invite[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("sub_owner_invites")
      .select("id,name,email,status,expires_at,created_at").order("created_at", { ascending: false });
    if (error) setErr("err.network");
    setList((data as Invite[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (profile?.role !== "owner") {
    return <main className="screen"><TopBar title={t("sub.title")} back /><Banner kind="info">{t("sub.ownerOnly")}</Banner></main>;
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim().length < 2 || !isValidEmail(email)) return;
    setBusy(true);
    setErr(null);
    setLink(null);
    const { data, error } = await supabase.rpc("create_sub_owner_invite", {
      p_name: name.trim(), p_email: email.trim(), p_origin: window.location.origin,
    });
    setBusy(false);
    if (error) { setErr(errorKey(error)); return; }
    setLink(String(data));
    setName(""); setEmail(""); setTouched(false); setCopied(false);
    void load();
  }

  async function revoke(inv: Invite) {
    if (!window.confirm(t("sub.revokeConfirm", { name: inv.name }))) return;
    const { error } = await supabase.rpc("revoke_sub_owner", { p_invite_id: inv.id });
    if (error) setErr(errorKey(error));
    void load();
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* clipboard blocked: link is visible to copy by hand */ }
  }

  const expired = (i: Invite) => i.status === "invited" && new Date(i.expires_at) < new Date();

  return (
    <main className="screen">
      <TopBar title={t("sub.title")} back="/app/profile" />
      <p>{t("sub.lead")}</p>
      <form onSubmit={send} noValidate className="card">
        <Field label={t("sub.name")} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)}
          error={touched && name.trim().length < 2 ? t("err.required") : null} />
        <Field label={t("sub.email")} type="email" inputMode="email" autoComplete="off" value={email}
          onChange={(e) => setEmail(e.target.value)} error={touched && !isValidEmail(email) ? t("err.bad_email") : null} />
        {err && <div style={{ marginBottom: 16 }}><Banner kind="error">{t(err)}</Banner></div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? t("common.loading") : t("sub.send")}</button>
        {link && (
          <div style={{ marginTop: 16 }} className="stack">
            <Banner kind="success">{t("sub.sent")} <span className="chip blue">{t("common.simulated")}</span></Banner>
            <code style={{ display: "block", wordBreak: "break-all", fontSize: 14, background: "var(--color-cream)", padding: 12, borderRadius: 12 }}>{link}</code>
            <button type="button" className="btn btn-secondary" onClick={copy}><IconCopy width={20} /> {copied ? t("sub.copied") : t("sub.copy")}</button>
          </div>
        )}
      </form>

      <h2 className="section">{t("sub.list")}</h2>
      {!list ? <Spinner /> : list.length === 0 ? <div className="card muted">{t("sub.empty")}</div> : (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map((i) => (
            <li key={i.id} className="list-row" style={{ cursor: "default" }}>
              <span className="grow">
                {i.name}
                <span className="muted small" style={{ display: "block", fontWeight: 600 }}>{i.email}</span>
              </span>
              <span className={`chip ${i.status === "active" ? "green" : i.status === "revoked" || expired(i) ? "red" : ""}`}>
                {expired(i) ? t("sub.status.expired") : t(`sub.status.${i.status}` as StringKey)}
              </span>
              {i.status !== "revoked" && (
                <button className="btn btn-ghost btn-small" onClick={() => revoke(i)}>{t("sub.revoke")}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
