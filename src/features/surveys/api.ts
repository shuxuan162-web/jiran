// Surveys and the FAQ (0012_surveys_faq.sql).
import { supabase } from "../../lib/supabase";
import { rpc } from "../services/api";

export type FaqCategory = "reporting" | "emergency" | "community" | "account" | "services" | "contact" | "other";
export const FAQ_CATEGORIES: FaqCategory[] = ["reporting", "emergency", "community", "account", "services", "contact", "other"];
export interface FaqRow { id: string; category: FaqCategory; question: string; answer: string; link_to: string | null; link_label: string | null; keywords: string[]; sort_order: number; active: boolean; updated_at: string }
export async function loadFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase.from("faqs").select("id, category, question, answer, link_to, link_label, keywords, sort_order, active, updated_at").order("sort_order").order("question");
  if (error) throw error;
  return (data ?? []) as FaqRow[];
}
export const saveFaq = (f: { id: string | null; category: FaqCategory; question: string; answer: string; keywords: string[]; link_to: string; link_label: string; sort_order: number; active: boolean }) =>
  rpc<string>("save_faq", { p_id: f.id, p_category: f.category, p_question: f.question, p_answer: f.answer, p_keywords: f.keywords, p_link_to: f.link_to || null, p_link_label: f.link_label || null, p_sort: f.sort_order, p_active: f.active });

export type QKind = "rating" | "choice" | "text";
export interface SurveyQuestion { id?: string; position?: number; kind: QKind; prompt: string; options: string[]; required: boolean }
export interface OpenSurvey { id: string; title: string; intro: string | null; opened_at: string; questions: number; answered: boolean }
export const openSurveys = () => rpc<OpenSurvey[]>("open_surveys").then((r) => r ?? []);
export async function surveyWithQuestions(id: string) {
  const [s, q] = await Promise.all([
    supabase.from("surveys").select("id, title, intro, status").eq("id", id).maybeSingle(),
    supabase.from("survey_questions").select("id, position, kind, prompt, options, required").eq("survey_id", id).order("position"),
  ]);
  if (s.error) throw s.error;
  if (q.error) throw q.error;
  return { survey: s.data as { id: string; title: string; intro: string | null; status: "draft" | "open" | "closed" } | null, questions: (q.data ?? []) as SurveyQuestion[] };
}
export type Answer = { question_id: string; rating?: number; choice?: string; text?: string };
export const submitSurvey = (id: string, answers: Answer[]) => rpc<void>("submit_survey", { p_id: id, p_answers: answers });

export interface AdminSurvey { id: string; title: string; intro: string | null; status: "draft" | "open" | "closed"; opened_at: string | null; closed_at: string | null; created_at: string; questions: number; responses: number }
export const adminSurveys = () => rpc<AdminSurvey[]>("admin_surveys").then((r) => r ?? []);
export const saveSurvey = (id: string | null, title: string, intro: string, questions: SurveyQuestion[]) =>
  rpc<string>("save_survey", { p_id: id, p_title: title, p_intro: intro, p_questions: questions.map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options, required: q.required })) });
export const setSurveyStatus = (id: string, status: "open" | "closed") => rpc<void>("set_survey_status", { p_id: id, p_status: status });
export interface SurveyResults {
  responses: number;
  questions: { id: string; position: number; kind: QKind; prompt: string; options: string[]; required: boolean; answered: number; avg: number | null; counts: Record<string, number> | null; texts: string[] | null }[];
}
export const surveyResults = (id: string) => rpc<SurveyResults>("survey_results", { p_id: id });
