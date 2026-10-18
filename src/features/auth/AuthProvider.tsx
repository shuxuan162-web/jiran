import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type Role = "owner" | "sub_owner" | "management" | "security";

export interface Profile {
  id: string;
  township_id: string;
  role: Role;
  nickname: string;
  avatar_config: Record<string, unknown>;
  home_area_id: string | null;
  map_visibility: "unset" | "precinct" | "hidden";
  ghost_mode: boolean;
  language: string; // always "en" now; older rows are treated as English
}

export interface PrivateProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  id_type: "nric" | "passport" | null;
  id_last4: string | null;
  unit_id: string | null;
  owner_id: string | null;
  status: "pending" | "active" | "suspended" | "revoked";
  resident_since: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  priv: PrivateProfile | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const isStaff = (r?: Role | null) => r === "management" || r === "security";
export const isResident = (r?: Role | null) => r === "owner" || r === "sub_owner";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [priv, setPriv] = useState<PrivateProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null);
      setPriv(null);
      setLoading(false);
      return;
    }
    const uid = s.user.id;
    const [p, pp] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("profiles_private").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    setPriv((pp.data as PrivateProfile) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Token refreshes don't change who is signed in; skip the reload.
      if (event === "TOKEN_REFRESHED") { setSession(s); return; }
      setLoading(true);
      // Defer so the Supabase auth lock is released before we query.
      setTimeout(() => { if (alive) load(s); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [load]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await load(data.session);
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ loading, session, profile, priv, refresh, signOut }), [loading, session, profile, priv, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
