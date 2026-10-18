// Phase 5: XP, badges, quests, leaderboard, avatar save. XP is only written by the database (0006_rewards.sql).
import { supabase } from "../../lib/supabase";
import type { AvatarConfig } from "../../lib/avatar";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type XpReason = "report_accepted" | "fix_confirmed" | "upvote" | "post_shared" | "helpful_received" | "reply"
  | "event_checkin" | "event_hosted" | "newsletter_read" | "quest_bonus" | "revoked";

export interface Rewards {
  xp: number; level: number; level_floor: number; next_at: number | null; week_xp: number;
  badges: { slug: string; target: number; progress: number }[];
  quests: { slug: string; target: number; bonus: number; progress: number; claimed: boolean }[];
  goal: { target: number; progress: number };
  history: { amount: number; reason: XpReason; at: string; note: string | null }[];
  opted_out: boolean; week_ends: string;
}
export interface LeaderRow { rank: number; nickname: string; avatar: Record<string, unknown> | null; level: number; xp: number; area_name: string | null; is_me: boolean }

export const myRewards = () => rpc<Rewards>("my_rewards");
export const claimQuest = (slug: string) => rpc<number>("claim_quest", { p_slug: slug });
export const leaderboard = (scope: "township" | "area", period: "week" | "all") =>
  rpc<LeaderRow[]>("leaderboard", { p_scope: scope, p_period: period }).then((x) => x ?? []);
export const setOptOut = (out: boolean) => rpc<void>("set_leaderboard_optout", { p_out: out });
export const revokeXp = (userId: string, amount: number, note: string) => rpc<void>("revoke_xp", { p_user: userId, p_amount: amount, p_note: note });

export async function saveAvatar(userId: string, cfg: AvatarConfig) {
  const { error } = await supabase.from("profiles").update({ avatar_config: cfg }).eq("id", userId);
  if (error) throw error;
}
