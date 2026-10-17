// Jiran · register-owner
// Creates a confirmed owner account + private profile + pending verification.
// Runs with the service role; every rule (rate limit, duplicates) is checked in SQL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BLOCKED = ["admin", "management", "security", "sime", "official", "moderator", "babi", "bodoh", "fuck", "shit"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const fullName = String(b.full_name ?? "").trim();
  const idType = String(b.id_type ?? "");
  const idNumber = String(b.id_number ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const unitId = String(b.unit_id ?? "");
  const nickname = String(b.nickname ?? "").trim();
  const phone = String(b.phone ?? "").trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
  if (password.length < 8) return json({ error: "weak_password" }, 400);
  if (fullName.length < 3) return json({ error: "bad_name" }, 400);
  if (!["nric", "passport"].includes(idType)) return json({ error: "bad_id_type" }, 400);
  if (idType === "nric" && !/^\d{12}$/.test(idNumber)) return json({ error: "bad_nric" }, 400);
  if (idType === "passport" && !/^[A-Z0-9]{6,12}$/.test(idNumber)) return json({ error: "bad_passport" }, 400);
  if (!UUID.test(unitId)) return json({ error: "unit_unknown" }, 400);
  if (!/^[A-Za-z0-9_]{3,24}$/.test(nickname)) return json({ error: "bad_nickname" }, 400);
  if (BLOCKED.some((w) => nickname.toLowerCase().includes(w))) return json({ error: "nickname_not_allowed" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const { data: reason, error: checkErr } = await admin.rpc("check_signup_allowed", {
    p_ip: ip, p_email: email, p_id_type: idType, p_id_number: idNumber, p_nickname: nickname, p_unit_id: unitId,
  });
  if (checkErr) return json({ error: "server", detail: checkErr.message }, 500);
  if (reason) return json({ error: reason }, 400);

  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authErr || !created.user) return json({ error: "auth_error", detail: authErr?.message }, 400);

  const { error: profErr } = await admin.rpc("register_owner_profile", {
    p_user_id: created.user.id, p_email: email, p_full_name: fullName, p_id_type: idType,
    p_id_number: idNumber, p_unit_id: unitId, p_nickname: nickname, p_phone: phone,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: profErr.message.includes("nickname") ? "nickname_taken" : "server", detail: profErr.message }, 400);
  }
  return json({ ok: true });
});
