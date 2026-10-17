// SOS, urgent queue, map presence and the ordered feed. Rules live in the database RPCs (0004_map_sos.sql).
import type { Polygon } from "geojson";
import { supabase } from "../../lib/supabase";
import type { AreaShape } from "../../lib/map/LeafletMap";

export type EmergencyType = "fire" | "medical" | "crime" | "flood" | "accident" | "other" | "unspecified";
export type EmergencyStatus = "unconfirmed" | "community_confirmed" | "mgmt_confirmed" | "responding" | "resolved" | "false_alarm" | "cancelled";
export const EMERGENCY_TYPES: Exclude<EmergencyType, "unspecified">[] = ["fire", "medical", "crime", "flood", "accident", "other"];
export const ACTIVE_SOS: EmergencyStatus[] = ["unconfirmed", "community_confirmed", "mgmt_confirmed", "responding"];

export interface PublicEmergency {
  id: string; ref_no: string; type: EmergencyType; status: EmergencyStatus; lat: number; lng: number;
  approximate: boolean; area_name: string | null; confirm_count: number; i_confirmed: boolean; is_mine: boolean;
  created_at: string; updated_at: string;
}
export interface SosEvent { status: EmergencyStatus; note: string | null; by_staff: boolean; at: string }
export interface SosDetail {
  id: string; ref_no: string; type: EmergencyType; status: EmergencyStatus; lat: number; lng: number; approximate: boolean;
  area_name: string | null; description: string | null; photo_path: string | null; cancel_until: string; confirm_count: number;
  created_at: string; events: SosEvent[];
}
export interface UrgentRow {
  id: string; ref_no: string; type: EmergencyType; status: EmergencyStatus; lat: number; lng: number; approximate: boolean;
  area_name: string | null; description: string | null; photo_path: string | null; confirm_count: number;
  reporter_id: string; reporter_nickname: string | null; reporter_name: string | null; reporter_phone: string | null;
  reporter_email: string | null; reporter_warnings: number; staff_note: string | null; handled_by_nickname: string | null;
  created_at: string; updated_at: string; cancel_until: string;
}
export interface FeedItem {
  kind: "emergency" | "issue" | "notice"; id: string; tier: 1 | 2 | 3; ref_no: string; title: string; area_name: string | null;
  lat: number; lng: number; level: "low" | "medium" | "high" | "urgent"; status: string; score: number | null;
  created_at: string; rank_no: number;
}
export interface Presence {
  areas: { area_id: string; name: string; lat: number; lng: number; count: number;
    avatars: { nickname: string; avatar: Record<string, unknown>; lat: number; lng: number; is_me: boolean }[] | null }[];
  checkins: { nickname: string; avatar: Record<string, unknown>; lat: number; lng: number; is_me: boolean; minutes_left: number }[];
  me: { map_visibility: "unset" | "precinct" | "hidden"; ghost_mode: boolean; checked_in_until: string | null } | null;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const triggerSos = (clientId: string, lat: number | null = null, lng: number | null = null, type: EmergencyType = "unspecified") =>
  rpc<{ id: string; ref_no: string; cancel_until: string; approximate: boolean; duplicate: boolean }>(
    "trigger_sos", { p_lat: lat, p_lng: lng, p_type: type, p_client_id: clientId });

export const sosUpdate = (id: string, u: { lat?: number; lng?: number; type?: EmergencyType; description?: string; photoPath?: string }) =>
  rpc<void>("sos_update", { p_id: id, p_lat: u.lat ?? null, p_lng: u.lng ?? null, p_type: u.type ?? null,
    p_description: u.description ?? null, p_photo_path: u.photoPath ?? null });

export const cancelSos = (id: string) => rpc<void>("cancel_sos", { p_id: id });
export const confirmSos = (id: string, lat?: number, lng?: number) =>
  rpc<number>("confirm_sos", { p_id: id, p_lat: lat ?? null, p_lng: lng ?? null });
export const sosStatus = (id: string) => rpc<SosDetail | null>("sos_status", { p_id: id });
export const activeEmergencies = () => rpc<PublicEmergency[]>("active_emergencies").then((x) => x ?? []);
export const feedOrdered = (limit = 50) => rpc<FeedItem[]>("feed_ordered", { p_limit: limit }).then((x) => x ?? []);

export const urgentQueue = (includeClosed = false) => rpc<UrgentRow[]>("urgent_queue", { p_include_closed: includeClosed }).then((x) => x ?? []);
export const staffSosAction = (id: string, status: "mgmt_confirmed" | "responding" | "resolved" | "false_alarm", note: string) =>
  rpc<void>("staff_sos_action", { p_id: id, p_status: status, p_note: note || null });

export const mapPresence = () => rpc<Presence>("map_presence");
export const checkIn = (lat: number, lng: number) => rpc<{ expires_at: string }>("check_in", { p_lat: lat, p_lng: lng });
export const checkOut = () => rpc<void>("check_out");

export async function setPrivacy(userId: string, p: { map_visibility?: "precinct" | "hidden"; ghost_mode?: boolean }) {
  const { error } = await supabase.from("profiles").update(p).eq("id", userId);
  if (error) throw error;
}

let shapeCache: AreaShape[] | null = null;
/** The drawn layout of City of Elmina: every section that has an outline. */
export async function loadAreaShapes(): Promise<AreaShape[]> {
  if (shapeCache) return shapeCache;
  const { data, error } = await supabase.from("areas").select("id, slug, name, kind, boundary").not("boundary", "is", null).order("sort_order");
  if (error) throw error;
  shapeCache = (data as { id: string; slug: string; name: string; kind: string; boundary: Polygon }[]).map((a) => ({ ...a }));
  return shapeCache;
}
