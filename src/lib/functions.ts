import { supabase } from "./supabase";

/** Calls a Supabase Edge Function and returns either data or a short error code. */
export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let code = "generic";
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try { code = (await ctx.json())?.error ?? code; } catch { /* not json */ }
      } else if (String(error.message).toLowerCase().includes("fetch")) code = "network";
      return { error: code };
    }
    return { data: data as T };
  } catch {
    return { error: "network" };
  }
}
