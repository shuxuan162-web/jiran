// Property enquiries. Rules (consent, formats, rate limit, who can read) live in 0007_enquiries.sql.
import { supabase } from "../../lib/supabase";

export interface Enquiry {
  id: string; property_slug: string; kind: "enquiry" | "viewing"; full_name: string; phone: string; email: string;
  status: "new" | "contacted" | "closed"; staff_note: string | null; created_at: string; updated_at: string; user_id: string | null;
}

export async function submitEnquiry(e: { property: string; kind: "enquiry" | "viewing"; name: string; phone: string; email: string; consent: boolean }) {
  const { data, error } = await supabase.rpc("submit_enquiry", {
    p_property: e.property, p_kind: e.kind, p_name: e.name, p_phone: e.phone, p_email: e.email, p_consent: e.consent,
  });
  if (error) throw error;
  return data as { id: string; ref: string };
}

/** Residents get their own rows; management gets everything in the township (RLS decides). */
export async function listEnquiries(property?: string): Promise<Enquiry[]> {
  let q = supabase.from("property_enquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (property) q = q.eq("property_slug", property);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Enquiry[];
}

export async function updateEnquiry(id: string, status: Enquiry["status"], note: string) {
  const { error } = await supabase.rpc("update_enquiry", { p_id: id, p_status: status, p_note: note || null });
  if (error) throw error;
}

/** Malaysian mobile or landline, digits only with an optional leading + (same rule as the database). */
export const phoneOk = (s: string) => /^\+?[0-9]{9,13}$/.test(s.replace(/[\s-]/g, ""));
