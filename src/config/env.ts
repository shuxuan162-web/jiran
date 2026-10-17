// Build-time configuration. Only VITE_ variables reach the browser, so only
// public values belong here (never the Supabase service-role key).
const v = import.meta.env;

export const env = {
  supabaseUrl: (v.VITE_SUPABASE_URL as string) || "",
  supabaseAnonKey: (v.VITE_SUPABASE_ANON_KEY as string) || "",
  // Safe default: demo mode is ON unless explicitly set to "false".
  demoMode: String(v.VITE_DEMO_MODE ?? "true").toLowerCase() !== "false",
  mapProvider: ((v.VITE_MAP_PROVIDER as string) || "here") as "here" | "leaflet",
  hereApiKey: (v.VITE_HERE_API_KEY as string) || "",
};

export const configMissing = !env.supabaseUrl || !env.supabaseAnonKey;
