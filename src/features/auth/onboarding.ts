import { supabase, OWNERSHIP_BUCKET } from "../../lib/supabase";
import { safeFileName } from "../../lib/validation";

export interface AreaRow { id: string; slug: string; name: string; kind: string; residential: boolean; center_lat: number | null; center_lng: number | null; verified: boolean; source_note: string | null; sort_order: number; }
export interface UnitRow { id: string; area_id: string; label: string; synthetic: boolean; }

export async function loadAreas(): Promise<AreaRow[]> {
  const { data, error } = await supabase.from("areas").select("*").order("sort_order");
  if (error) throw error;
  return data as AreaRow[];
}

export async function loadUnits(areaId: string): Promise<UnitRow[]> {
  const { data, error } = await supabase.from("units").select("id, area_id, label, synthetic")
    .eq("area_id", areaId).order("unit_no", { ascending: true });
  if (error) throw error;
  // unit_no is text: sort numerically for a friendlier list
  return (data as UnitRow[]).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** Uploads a certificate into the owner's private folder and (re)submits verification. */
export async function uploadAndSubmitCertificate(userId: string, file: File, unitId?: string) {
  const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from(OWNERSHIP_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc("submit_verification_docs", { p_paths: [path], p_unit_id: unitId ?? null });
  if (error) throw error;
  return path;
}
