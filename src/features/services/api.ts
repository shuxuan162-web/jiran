// Visitor passes, car plates, feedback (0008_services.sql). Service requests: requests.ts. Billing: features/billing.
import { supabase } from "../../lib/supabase";

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export interface VisitorPass {
  id: string; visitor_name: string; plate: string | null; visit_date: string; token: string;
  status: "active" | "arrived" | "cancelled"; arrived_at: string | null; created_at: string;
}
export async function myPasses(): Promise<VisitorPass[]> {
  const { data, error } = await supabase.from("visitor_passes").select("id, visitor_name, plate, visit_date, token, status, arrived_at, created_at")
    .order("visit_date", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as VisitorPass[];
}
export const createPass = (name: string, plate: string, date: string) =>
  rpc<{ id: string; token: string }>("create_visitor_pass", { p_name: name, p_plate: plate || null, p_date: date });
export const cancelPass = (id: string) => rpc<void>("cancel_visitor_pass", { p_id: id });
export interface PassCheck {
  valid: boolean; state: "ok" | "arrived_now" | "already_arrived" | "expired" | "not_yet" | "cancelled" | "unknown";
  reason?: string; visitor?: string; plate?: string | null; visit_date?: string; unit?: string | null; host?: string | null; arrived_at?: string | null;
}
export const verifyPass = (token: string, markArrived: boolean) =>
  rpc<PassCheck>("verify_visitor_pass", { p_token: token, p_mark_arrived: markArrived }).then((r) => ({ ...r, state: r.state ?? (r.reason as PassCheck["state"]) ?? "unknown" }));

export interface CarPlate { id: string; plate: string; label: string | null }
export async function myPlates(): Promise<CarPlate[]> {
  const { data, error } = await supabase.from("car_plates").select("id, plate, label").order("created_at");
  if (error) throw error;
  return (data ?? []) as CarPlate[];
}
export async function addPlate(userId: string, plate: string, label: string) {
  const { error } = await supabase.from("car_plates").insert({ user_id: userId, plate: normalizePlate(plate), label: label.trim() || null });
  if (error) throw error;
}
export async function removePlate(id: string) {
  const { error } = await supabase.from("car_plates").delete().eq("id", id);
  if (error) throw error;
}
/** "wxy 1234" -> "WXY 1234" (letters, digits and single spaces only; same rule as the database). */
export function normalizePlate(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
export const plateOk = (s: string) => /^[A-Z0-9 ]{2,12}$/.test(normalizePlate(s)) && /\d/.test(s);

export type FeedbackTopic = "app" | "township" | "security" | "cleanliness" | "facilities" | "other";
export const FEEDBACK_TOPICS: FeedbackTopic[] = ["township", "security", "cleanliness", "facilities", "app", "other"];
export const sendFeedback = (topic: FeedbackTopic, rating: number, message: string, anonymous: boolean) =>
  rpc<void>("send_feedback", { p_topic: topic, p_rating: rating, p_message: message, p_anonymous: anonymous });
export interface FeedbackRow { id: string; topic: FeedbackTopic; rating: number; message: string | null; nickname: string | null; created_at: string }
export const feedbackList = (days = 90) => rpc<FeedbackRow[]>("feedback_list", { p_days: days }).then((x) => x ?? []);
