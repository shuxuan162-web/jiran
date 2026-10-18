// Billing reminders (0010_billing.sql). Bills come only from management; payments happen outside Jiran.
import { supabase } from "../../lib/supabase";
import { rpc } from "../services/api";
import type { BillKind, BillState, CsvBill } from "../../lib/billing";

export const INVOICE_BUCKET = "invoices";

export interface MyBill {
  id: string; kind: BillKind; period: string; amount: number; due_date: string; paid_at: string | null;
  reference: string | null; note: string | null; state: BillState; reminders_on: boolean; has_invoice: boolean; soon_days: number;
}
export const myBills = () => rpc<MyBill[]>("my_bills").then((r) => (r ?? []).map((b) => ({ ...b, amount: Number(b.amount) })));
export const setBillReminder = (id: string, on: boolean) => rpc<void>("set_bill_reminder", { p_id: id, p_on: on });
export const billRemindersTick = () => rpc<void>("bill_reminders_tick");

/** A short-lived link to the invoice file (5 minutes). Storage rules decide who may open it. */
export async function invoiceLink(billId: string): Promise<string> {
  const path = await rpc<string | null>("bill_invoice_path", { p_id: billId });
  if (!path) throw new Error("not_found");
  const { data, error } = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw error ?? new Error("not_found");
  return data.signedUrl;
}

// Management
export interface AdminBill {
  id: string; unit_id: string; unit_label: string; area_id: string; area_name: string; kind: BillKind; period: string; amount: number;
  due_date: string; paid_at: string | null; reference: string | null; note: string | null; status: "open" | "void"; void_reason: string | null;
  state: BillState; has_invoice: boolean; invoice_path: string | null; owners: number; updated_at: string;
}
export const adminBills = (state: string, area: string | null) =>
  rpc<AdminBill[]>("admin_bills", { p_state: state, p_area: area }).then((r) => (r ?? []).map((b) => ({ ...b, amount: Number(b.amount) })));
export interface UnitHit { id: string; label: string; area_name: string; owners: number }
export const unitSearch = (q: string) => rpc<UnitHit[]>("admin_unit_search", { p_q: q }).then((r) => r ?? []);
export const saveBill = (b: { id: string | null; unit: string; kind: BillKind; period: string; amount: number; due: string; reference: string; note: string }) =>
  rpc<string>("save_bill", { p_id: b.id, p_unit: b.unit, p_kind: b.kind, p_period: b.period, p_amount: b.amount, p_due: b.due, p_reference: b.reference || null, p_note: b.note || null });
export const voidBill = (id: string, reason: string) => rpc<void>("void_bill", { p_id: id, p_reason: reason });
export const markBillPaid = (id: string, paidOn: string | null) => rpc<void>("mark_bill_paid", { p_id: id, p_paid_on: paidOn });
export const setReminderDays = (days: number) => rpc<void>("set_billing_reminder_days", { p_days: days });

export async function attachInvoice(bill: { id: string; unit_id: string }, file: File) {
  const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
  const path = `${bill.unit_id}/${bill.id}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  await rpc<void>("set_bill_invoice", { p_id: bill.id, p_path: path });
}
export const removeInvoice = (id: string) => rpc<void>("set_bill_invoice", { p_id: id, p_path: null });

export interface ImportRow { row: number; unit: string | null; type: BillKind | null; period: string; amount: number | null; due_date: string | null; errors: string[] }
export const importBills = (rows: CsvBill[], commit: boolean) =>
  rpc<{ rows: ImportRow[]; errors: number; inserted: number }>("import_bills", { p_rows: rows, p_commit: commit });

export async function reminderDays(): Promise<number> {
  const { data } = await supabase.from("app_config").select("value").eq("key", "billing_reminder_days").maybeSingle();
  return Number(data?.value ?? 3) || 3;
}

// Notification settings (shared with service requests)
export interface NotifPrefs { billing: boolean; service_requests: boolean }
export async function myNotifPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase.from("notification_prefs").select("billing, service_requests").eq("user_id", userId).maybeSingle();
  return { billing: data?.billing ?? true, service_requests: data?.service_requests ?? true };
}
export const setNotifPref = (cat: "billing" | "service", on: boolean) => rpc<void>("set_notification_pref", { p_cat: cat, p_on: on });
