// Phase 7: visitor passes, service requests, car plates, billing reminders, feedback. Rules live in 0008_services.sql.
import { supabase } from "../../lib/supabase";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
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

export type ServiceCategory = "aircond" | "plumbing" | "electrical" | "pest" | "landscape" | "renovation" | "access_card" | "other";
export const SERVICE_CATEGORIES: ServiceCategory[] = ["aircond", "plumbing", "electrical", "pest", "landscape", "renovation", "access_card", "other"];
export interface ServiceRequest {
  id: string; ref_no: string; requester_id: string | null; category: ServiceCategory; description: string; preferred_time: string | null;
  photo_paths: string[]; status: "submitted" | "scheduled" | "in_progress" | "done" | "cancelled"; scheduled_for: string | null;
  staff_note: string | null; created_at: string; updated_at: string;
}
export async function serviceRequests(): Promise<ServiceRequest[]> {
  const { data, error } = await supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as ServiceRequest[];
}
export const createServiceRequest = (category: ServiceCategory, description: string, preferred: string, photos: string[]) =>
  rpc<{ id: string; ref_no: string }>("create_service_request", { p_category: category, p_description: description, p_preferred: preferred, p_photo_paths: photos });
export const updateServiceRequest = (id: string, status: ServiceRequest["status"], note: string, scheduled: string | null = null) =>
  rpc<void>("update_service_request", { p_id: id, p_status: status, p_note: note || null, p_scheduled: scheduled });

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

export interface Bill { id: string; kind: "maintenance_fee" | "sinking_fund" | "quit_rent" | "assessment" | "water"; period: string; amount: number; due_date: string; paid_at: string | null; is_demo: boolean }
export async function myBills(): Promise<Bill[]> {
  const { data, error } = await supabase.from("billing_reminders").select("id, kind, period, amount, due_date, paid_at, is_demo").order("due_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({ ...(b as Bill), amount: Number((b as Bill).amount) }));
}
export function billState(b: Pick<Bill, "due_date" | "paid_at">, today = new Date()): "paid" | "overdue" | "due_soon" | "upcoming" {
  if (b.paid_at) return "paid";
  const due = new Date(`${b.due_date}T23:59:59+08:00`).getTime();
  const days = (due - today.getTime()) / 86400000;
  if (days < 0) return "overdue";
  return days <= 14 ? "due_soon" : "upcoming";
}

export type FeedbackTopic = "app" | "township" | "security" | "cleanliness" | "facilities" | "other";
export const FEEDBACK_TOPICS: FeedbackTopic[] = ["township", "security", "cleanliness", "facilities", "app", "other"];
export const sendFeedback = (topic: FeedbackTopic, rating: number, message: string, anonymous: boolean) =>
  rpc<void>("send_feedback", { p_topic: topic, p_rating: rating, p_message: message, p_anonymous: anonymous });
export interface FeedbackRow { id: string; topic: FeedbackTopic; rating: number; message: string | null; nickname: string | null; created_at: string }
export const feedbackList = (days = 90) => rpc<FeedbackRow[]>("feedback_list", { p_days: days }).then((x) => x ?? []);
