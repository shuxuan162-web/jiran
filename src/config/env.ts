// Build-time configuration. Only VITE_ variables reach the browser, so only
// public values belong here (never the Supabase service-role key).
const v = import.meta.env;

export const env = {
  supabaseUrl: (v.VITE_SUPABASE_URL as string) || "",
  supabaseAnonKey: (v.VITE_SUPABASE_ANON_KEY as string) || "",
  // Safe default: demo mode is ON unless explicitly set to "false". In demo mode SOS never dials 999.
  demoMode: String(v.VITE_DEMO_MODE ?? "true").toLowerCase() !== "false",
};

export const configMissing = !env.supabaseUrl || !env.supabaseAnonKey;
