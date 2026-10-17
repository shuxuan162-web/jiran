// Phase 4 data access: notices, area follows, community, events, newsletter, moderation, analytics.
// Every rule lives in the database functions (0005_info_community.sql); these are thin wrappers.
import { supabase } from "../../lib/supabase";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

// ---- Announcements ----
export type NoticeCategory = "safety" | "maintenance" | "general" | "event" | "community";
export const NOTICE_CATEGORIES: NoticeCategory[] = ["safety", "maintenance", "general", "event", "community"];

export interface Announcement {
  id: string; category: NoticeCategory; source_label: string; title: string; body: string; target_kind: "township" | "areas";
  area_names: string[]; lat: number | null; lng: number | null; pinned: boolean; publish_at: string;
  starts_at: string | null; ends_at: string | null; expired: boolean; is_read: boolean;
}
export interface AdminAnnouncement extends Omit<Announcement, "expired" | "is_read" | "lat" | "lng"> {
  withdrawn_at: string | null; state: "live" | "scheduled" | "ended" | "withdrawn"; audience: number; reads: number; created_at: string;
}

export const myAnnouncements = (limit = 50) => rpc<Announcement[]>("my_announcements", { p_id: null, p_limit: limit }).then((x) => x ?? []);
export const announcement = (id: string) =>
  rpc<Announcement[]>("my_announcements", { p_id: id, p_limit: 1 }).then((x) => (x ?? [])[0] ?? null);
export const markAnnouncementRead = (id: string) => rpc<void>("mark_announcement_read", { p_id: id });
export const adminAnnouncements = () => rpc<AdminAnnouncement[]>("admin_announcements").then((x) => x ?? []);
export const withdrawAnnouncement = (id: string) => rpc<void>("withdraw_announcement", { p_id: id });
export const publishAnnouncement = (a: {
  category: NoticeCategory; source: string; title: string; body: string; targetKind: "township" | "areas"; areaIds: string[];
  publishAt: string | null; startsAt: string | null; endsAt: string | null; pinned: boolean;
}) => rpc<{ id: string; audience: number; scheduled: boolean }>("publish_announcement", {
  p_category: a.category, p_source: a.source, p_title: a.title, p_body: a.body, p_target_kind: a.targetKind,
  p_area_ids: a.targetKind === "areas" ? a.areaIds : [], p_publish_at: a.publishAt, p_starts_at: a.startsAt,
  p_ends_at: a.endsAt, p_pinned: a.pinned, p_lat: null, p_lng: null,
});

// ---- Area follows (RLS: own rows only, max 4 by trigger) ----
export async function myFollows(): Promise<string[]> {
  const { data, error } = await supabase.from("area_follows").select("area_id");
  if (error) throw error;
  return (data ?? []).map((r: { area_id: string }) => r.area_id);
}
export async function setFollow(userId: string, areaId: string, on: boolean) {
  const q = on
    ? supabase.from("area_follows").insert({ user_id: userId, area_id: areaId })
    : supabase.from("area_follows").delete().eq("user_id", userId).eq("area_id", areaId);
  const { error } = await q;
  if (error) throw error;
}
export interface AreaRow { id: string; name: string; kind: string; parent_id: string | null; residential: boolean; center_lat: number | null; center_lng: number | null }
let areaCache: AreaRow[] | null = null;
export async function loadAreas(): Promise<AreaRow[]> {
  if (areaCache) return areaCache;
  const { data, error } = await supabase.from("areas").select("id, name, kind, parent_id, residential, center_lat, center_lng").order("sort_order");
  if (error) throw error;
  areaCache = data as AreaRow[];
  return areaCache;
}

// ---- Community ----
export type PostType = "general" | "question" | "lost_found" | "recommendation" | "safety_tip";
export const POST_TYPES: PostType[] = ["general", "question", "lost_found", "recommendation", "safety_tip"];
export interface Post {
  id: string; type: PostType; body: string; photo_path: string | null; area_id: string | null; area_name: string | null;
  lat: number | null; lng: number | null; nickname: string | null; avatar: Record<string, unknown> | null; is_mine: boolean;
  anonymous: boolean; state: "visible" | "held" | "hidden"; held_reason: string | null; helpful_count: number;
  reply_count: number; i_helpful: boolean; bubble_active: boolean; created_at: string;
}
export interface Reply { id: string; body: string; nickname: string | null; avatar: Record<string, unknown> | null; is_mine: boolean; is_staff: boolean; created_at: string }
export interface Bubble { id: string; type: PostType; snippet: string; nickname: string | null; avatar: Record<string, unknown> | null; lat: number; lng: number; is_mine: boolean; created_at: string }

export const communityFeed = (filter: "all" | "neighbours" | "mine" = "all", limit = 50) =>
  rpc<Post[]>("community_feed", { p_filter: filter, p_limit: limit, p_id: null }).then((x) => x ?? []);
export const postById = (id: string) => rpc<Post[]>("community_feed", { p_filter: "all", p_limit: 1, p_id: id }).then((x) => (x ?? [])[0] ?? null);
export const repliesFor = (id: string) => rpc<Reply[]>("post_replies_for", { p_post: id }).then((x) => x ?? []);
export const replyPost = (id: string, body: string) => rpc<string>("reply_post", { p_post: id, p_body: body });
export const toggleHelpful = (id: string) => rpc<{ helpful: boolean; count: number }>("toggle_helpful", { p_post: id });
export const deleteOwnPost = (id: string) => rpc<void>("delete_own_post", { p_post: id });
export const reportContent = (kind: "post" | "reply", id: string, reason: string, note: string) =>
  rpc<{ held: boolean }>("report_content", { p_kind: kind, p_id: id, p_reason: reason, p_note: note || null });
export const mapBubbles = () => rpc<Bubble[]>("map_bubbles").then((x) => x ?? []);
export const createPost = (p: {
  type: PostType; body: string; photoPath: string | null; areaId: string | null; lat: number | null; lng: number | null; anonymous: boolean; bubble: boolean;
}) => rpc<{ id: string; state: "visible" | "held"; held_reason: string | null }>("create_post", {
  p_type: p.type, p_body: p.body, p_photo_path: p.photoPath, p_area_id: p.areaId, p_lat: p.lat, p_lng: p.lng,
  p_anonymous: p.anonymous, p_bubble: p.bubble,
});

// ---- Moderation (management) ----
export interface ModItem {
  kind: "post" | "reply"; id: string; post_id: string; body: string; author_id: string | null; author_nickname: string | null;
  anonymous: boolean; state: string; held_reason: string | null; open_reports: number; reasons: string[]; notes: string[];
  author_warned: boolean; created_at: string;
}
export const moderationQueue = () => rpc<ModItem[]>("moderation_queue").then((x) => x ?? []);
export const moderate = (kind: "post" | "reply", id: string, action: "hide" | "release" | "dismiss", note: string) =>
  rpc<void>("moderate_content", { p_kind: kind, p_id: id, p_action: action, p_note: note || null });
export const warnUser = (userId: string, reason: string) => rpc<void>("warn_user", { p_user: userId, p_reason: reason });

// ---- Events ----
export interface EventRow {
  id: string; title: string; description: string; kind: "community" | "official"; starts_at: string; ends_at: string;
  location_name: string; lat: number; lng: number; area_name: string | null; capacity: number | null;
  going_count: number; interested_count: number; checked_in_count: number; my_rsvp: "going" | "interested" | null;
  checked_in: boolean; host_nickname: string | null; host_avatar: Record<string, unknown> | null; is_host: boolean;
  approval_state: "pending" | "approved" | "rejected" | "cancelled"; reject_reason: string | null; is_full: boolean;
}
export const eventsList = (scope: "upcoming" | "past" | "mine" | "pending" | "all") =>
  rpc<EventRow[]>("events_list", { p_scope: scope, p_id: null }).then((x) => x ?? []);
export const eventById = (id: string) => rpc<EventRow[]>("events_list", { p_scope: "all", p_id: id }).then((x) => (x ?? [])[0] ?? null);
export const createEvent = (e: { title: string; description: string; startsAt: string; endsAt: string; locationName: string; lat: number; lng: number; capacity: number | null }) =>
  rpc<{ id: string; approval_state: "pending" | "approved" }>("create_event", {
    p_title: e.title, p_description: e.description, p_starts_at: e.startsAt, p_ends_at: e.endsAt,
    p_location_name: e.locationName, p_lat: e.lat, p_lng: e.lng, p_capacity: e.capacity,
  });
export const rsvpEvent = (id: string, status: "going" | "interested" | null) =>
  rpc<{ my_rsvp: string | null; going_count: number }>("rsvp_event", { p_id: id, p_status: status });
export const checkInEvent = (id: string, at: { lat: number; lng: number } | null, code: string | null) =>
  rpc<{ method: "distance" | "code" | "already" }>("check_in_event", { p_id: id, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null, p_code: code });
export const eventCode = (id: string) => rpc<string | null>("event_code", { p_id: id });
export const decideEvent = (id: string, approve: boolean, reason: string) => rpc<void>("decide_event", { p_id: id, p_approve: approve, p_reason: reason || null });
export const cancelEvent = (id: string, reason: string) => rpc<void>("cancel_event", { p_id: id, p_reason: reason || null });

// ---- Newsletter ----
export interface NewsletterSections {
  announcements: { id: string; title: string; source: string; category: string }[];
  maintenance: { id: string; title: string; source: string; starts_at: string | null; ends_at: string | null }[];
  events: { id: string; title: string; starts_at: string; location: string }[];
  resolved: { count: number; items: { id: string; ref_no: string; category: string; area: string | null; resolved_at: string }[] };
  top_posts: { id: string; snippet: string; helpful: number; replies: number; nickname: string | null }[];
  from?: string; to?: string;
}
export interface Newsletter {
  id: string; week_start: string; title: string; intro: string | null; sections: NewsletterSections; status: "draft" | "published";
  published_at: string | null; is_read: boolean; readers: number | null; audience: number | null;
}
export const newsletters = () => rpc<Newsletter[]>("newsletters_for_me").then((x) => x ?? []);
export const markNewsletterRead = (id: string) => rpc<void>("mark_newsletter_read", { p_id: id });
export const draftNewsletter = () => rpc<string>("draft_newsletter");
export const updateNewsletter = (id: string, title: string, intro: string) => rpc<void>("update_newsletter", { p_id: id, p_title: title, p_intro: intro });
export const publishNewsletter = (id: string) => rpc<number>("publish_newsletter", { p_id: id });

// ---- Analytics ----
export interface Analytics {
  days: number;
  issues: { reported: number; resolved: number; open: number; median_ack_hours: number | null; median_resolve_days: number | null;
    followups_per_issue: number; reopened: number; avg_rating: number | null; confirmed_fixed: number; not_fixed: number };
  by_category: { category: string; reported: number; resolved: number; median_resolve_days: number | null }[];
  weekly: { week: string; reported: number; resolved: number }[];
  sos: { total: number; false_alarms: number; cancelled: number; median_minutes_to_staff: number | null };
  community: { posts: number; replies: number; held: number; events: number; rsvps: number; checkins: number; active_residents: number; residents: number };
  newsletter: { title: string; published_at: string; reads: number } | null;
  baseline: { ack_hours: number | null; resolve_days: number | null; followups: number | null; source: string };
  demo_share: number;
}
export const analyticsSummary = (days: number) => rpc<Analytics>("analytics_summary", { p_days: days });
export const setBaseline = (b: { ack_hours: number | null; resolve_days: number | null; followups: number | null; source: string }) =>
  rpc<void>("set_analytics_baseline", { p: b });
