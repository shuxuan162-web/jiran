// Jiran · accept-invite
// A sub-owner sets a password from the owner's invite link. Sub-owners cannot self-register:
// the account is only created when a valid, unexpired, unused invite token is presented.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const token = String(b.token ?? "");
  const password = String(b.password ?? "");
  const nickname = String(b.nickname ?? "").trim();

  if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: "invite_unknown" }, 400);
  if (password.length < 8) return json({ error: "weak_password" }, 400);
  if (!/^[A-Za-z0-9_]{3,24}$/.test(nickname)) return json({ error: "bad_nickname" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: inv } = await admin.from("sub_owner_invites")
    .select("id, email, status, expires_at").eq("token_hash", await sha256(token)).maybeSingle();
  if (!inv) return json({ error: "invite_unknown" }, 400);
  if (inv.status !== "invited") return json({ error: "invite_used" }, 400);
  if (new Date(inv.expires_at) < new Date()) return json({ error: "invite_expired" }, 400);

  const { data: taken } = await admin.from("profiles").select("id").ilike("nickname", nickname).maybeSingle();
  if (taken) return json({ error: "nickname_taken" }, 400);

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: inv.email, password, email_confirm: true,
  });
  if (authErr || !created.user) return json({ error: "auth_error", detail: authErr?.message }, 400);

  const { error: profErr } = await admin.rpc("accept_invite_profile", {
    p_token: token, p_user_id: created.user.id, p_nickname: nickname,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profErr.message, detail: profErr.message }, 400);
  }
  return json({ ok: true, email: inv.email });
});
