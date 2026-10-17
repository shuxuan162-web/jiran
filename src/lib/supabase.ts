import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const supabase = createClient(env.supabaseUrl || "https://missing.supabase.co", env.supabaseAnonKey || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const OWNERSHIP_BUCKET = "ownership-docs";
