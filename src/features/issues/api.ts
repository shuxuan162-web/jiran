// All issue data access. Screens call these; rules live in the database RPCs.
import { supabase } from "../../lib/supabase";
import { safeFileName } from "../../lib/validation";
import type { IssueStatus } from "../../lib/scoring/labels";

export const MEDIA_BUCKET = "public-media";

export interface Category { slug: string; name_en: string; name_bm: string; base_severity: number; icon: string; sort_order: number }

export interface IssueRow {
  id: string; ref_no: string; category: string; description: string; lat: number; lng: number;
  area_id: string | null; area_name: string | null; address_text: string | null; photo_paths: string[];
  status: IssueStatus; severity: number; upvote_count: number; affected_units: number;
  created_at: string; updated_at: string; resolved_at: string | null;
  reporter_nickname: string | null; is_mine: boolean; i_voted: boolean;
  s: number | null; u: number | null; a: number | null; t: number | null; p: number | null; queue_rank: number | null;
}

export interface HistoryRow { status: IssueStatus; note: string | null; team: string | null; at: string; by_staff: boolean }
export interface CommentRow { id: string; body: string; photo_path: string | null; at: string; nickname: string | null; avatar: Record<string, unknown> | null; staff: boolean; mine: boolean }
export interface IssueDetail {
  issue: IssueRow | null; history: HistoryRow[]; comments: CommentRow[];
  my_feedback: { fixed: boolean; rating: number | null; comment: string | null } | null;
  team: string | null; merged_into: string | null;
}
export interface Similar { id: string; ref_no: string; category: string; description: string; status: IssueStatus; upvote_count: number; distance_m: number; i_voted: boolean; is_mine: boolean }

let categoryCache: Category[] | null = null;
export async function loadCategories(): Promise<Category[]> {
  if (categoryCache) return categoryCache;
  const { data, error } = await supabase.from("issue_categories").select("*").order("sort_order");
  if (error) throw error;
  categoryCache = data as Category[];
  return categoryCache;
}

export async function issueFeed(scope: "open" | "mine" | "voted" | "closed" | "all", limit = 50): Promise<IssueRow[]> {
  const { data, error } = await supabase.rpc("issue_feed", { p_scope: scope, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as IssueRow[];
}

export async function issueDetail(id: string): Promise<IssueDetail | null> {
  const { data, error } = await supabase.rpc("issue_detail", { p_id: id });
  if (error) throw error;
  return (data as IssueDetail) ?? null;
}

export async function similarIssues(category: string, lat: number, lng: number, text: string): Promise<Similar[]> {
  const { data, error } = await supabase.rpc("similar_issues", { p_category: category, p_lat: lat, p_lng: lng, p_text: text });
  if (error) throw error;
  return (data ?? []) as Similar[];
}

export async function uploadPhoto(userId: string, file: File, folder: "issues" | "comments" | "posts"): Promise<string> {
  const path = `${userId}/${folder}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export const photoUrl = (path: string) => supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

export async function reportIssue(input: {
  category: string; description: string; lat: number; lng: number; photoPaths: string[]; anonymous: boolean; address: string | null;
}): Promise<{ id: string; ref_no: string; queue_rank: number | null; open_count: number }> {
  const { data, error } = await supabase.rpc("report_issue", {
    p_category: input.category, p_description: input.description, p_lat: input.lat, p_lng: input.lng,
    p_photo_paths: input.photoPaths, p_anonymous: input.anonymous, p_address: input.address,
  });
  if (error) throw error;
  return data as { id: string; ref_no: string; queue_rank: number | null; open_count: number };
}

export async function toggleUpvote(id: string): Promise<{ voted: boolean; rank_before: number | null; rank_after: number | null; upvote_count: number }> {
  const { data, error } = await supabase.rpc("toggle_upvote", { p_issue: id });
  if (error) throw error;
  return data as { voted: boolean; rank_before: number | null; rank_after: number | null; upvote_count: number };
}

export async function addComment(id: string, body: string, photoPath: string | null) {
  const { error } = await supabase.rpc("add_issue_comment", { p_issue: id, p_body: body, p_photo_path: photoPath });
  if (error) throw error;
}

export async function confirmResolution(id: string, fixed: boolean, rating: number | null, comment: string) {
  const { error } = await supabase.rpc("confirm_resolution", { p_issue: id, p_fixed: fixed, p_rating: rating, p_comment: comment });
  if (error) throw error;
}

export async function updateIssueStatus(ids: string[], status: IssueStatus, note: string, team: string, mergeInto?: string) {
  const { data, error } = await supabase.rpc("update_issue_status", {
    p_ids: ids, p_status: status, p_note: note || null, p_team: team || null, p_merge_into: mergeInto ?? null,
  });
  if (error) throw error;
  return data as number;
}

// ---- Notifications ----
export interface Notice { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

export async function loadNotifications(limit = 50): Promise<Notice[]> {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as Notice[];
}
export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
export async function markAllRead() {
  await supabase.rpc("mark_notifications_read", { p_ids: null });
}
