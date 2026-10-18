import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../features/auth/AuthProvider";
import { useI18n, type StringKey } from "../i18n";

/** Shows "+N XP" when the database credits the signed-in resident (live, own ledger rows only by RLS). */
export default function XpToaster() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [toast, setToast] = useState<{ amount: number; reason: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel(`xp-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_ledger", filter: `user_id=eq.${profile.id}` },
        (p) => { const r = p.new as { amount: number; reason: string }; if (r.amount > 0) setToast({ amount: r.amount, reason: r.reason }); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [profile]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(id); }, [toast]);

  if (!toast) return null;
  return (
    <div className="toast xp-toast pop-in" role="status" aria-live="polite">
      <strong>+{toast.amount} XP</strong> · {t(`rw.r.${toast.reason}` as StringKey)}
    </div>
  );
}
