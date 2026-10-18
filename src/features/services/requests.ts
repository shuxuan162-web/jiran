// Service requests and enquiries (0011_service_requests.sql). Private to the requester, the unit owner and management.
import { supabase } from "../../lib/supabase";
import { rpc } from "./api";
import type { SrStatus } from "../../lib/serviceFlow";

export interface SrCategory { id: string; name: string; active: boolean; proposed: boolean; sort_order: number }
export async function srCategories(includeInactive = false): Promise<SrCategory[]> {
  let q = supabase.from("service_categories").select("id, name, active, proposed, sort_order").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SrCategory[];
}
export const saveSrCategory = (id: string | null, name: string, active: boolean, sort: number) =>
  rpc<string>("save_service_category", { p_id: id, p_name: name, p_active: active, p_sort: sort });

export type SrKind = "enquiry" | "service";
export type SrWindow = "morning" | "afternoon" | "evening" | "any";
export type SrContact = "app" | "phone" | "email";
export interface SrListRow { id: string; ref_no: string; kind: SrKind; category: string; description: string; status: SrStatus; created_at: string; updated_at: string; mine: boolean; requester: string | null }
export const myServiceRequests = () => rpc<SrListRow[]>("my_service_requests").then((r) => r ?? []);
export const createServiceRequest = (x: { kind: SrKind; category: string; description: string; date: string | null; window: SrWindow | null; contact: SrContact; photos: string[] }) =>
  rpc<{ id: string; ref_no: string }>("create_service_request", {
    p_kind: x.kind, p_category: x.category, p_description: x.description, p_preferred_date: x.date, p_preferred_window: x.window, p_contact: x.contact, p_photo_paths: x.photos,
  });

export interface SrHistory { status: SrStatus; note: string | null; at: string; handler: string | null }
export interface SrDetail {
  id: string; ref_no: string; kind: SrKind; category_id: string; category: string; description: string; status: SrStatus; photo_paths: string[];
  preferred_date: string | null; preferred_window: SrWindow | null; contact_pref: SrContact; created_at: string; updated_at: string;
  rating: number | null; rating_comment: string | null; mine: boolean; requester: string | null;
  handler: { id: string; nickname: string; role: "management" | "security" } | null;
  can_cancel: boolean; can_rate: boolean; history: SrHistory[];
  // management only
  unit?: string | null; area?: string | null; requester_contact?: string | null; notes?: { body: string; at: string; author: string | null }[];
}
export const serviceRequestDetail = (id: string) => rpc<SrDetail>("service_request_detail", { p_id: id });
export const cancelServiceRequest = (id: string) => rpc<void>("cancel_service_request", { p_id: id });
export const rateServiceRequest = (id: string, rating: number, comment: string) => rpc<void>("rate_service_request", { p_id: id, p_rating: rating, p_comment: comment });

// Management
export interface SrQueueRow { id: string; ref_no: string; kind: SrKind; category: string; description: string; status: SrStatus; created_at: string; updated_at: string; unit: string | null; area: string | null; handler: string | null; rating: number | null; photos: number }
export const serviceQueue = (status: string, category: string | null, area: string | null) =>
  rpc<SrQueueRow[]>("service_queue", { p_status: status, p_category: category, p_area: area }).then((r) => r ?? []);
export interface Staff { id: string; nickname: string; role: "management" | "security" }
export const serviceStaff = () => rpc<Staff[]>("service_staff").then((r) => r ?? []);
export const updateServiceRequest = (id: string, status: SrStatus, note: string, assignee: string | null) =>
  rpc<void>("update_service_request", { p_id: id, p_status: status, p_note: note || null, p_assignee: assignee });
export const addServiceNote = (id: string, body: string) => rpc<void>("add_service_note", { p_id: id, p_body: body });
