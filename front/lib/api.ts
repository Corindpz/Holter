import type {
  Semaine, Ticket, Progress, DictionaryEntry, ExclusionRule,
  TrendSeries, PriorityRecommendation, ImportResult, DecisionPayload,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "PATCH" });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

// ── Semaines ──────────────────────────────────────────────────
export const getSemaines = () => get<Semaine[]>("/api/semaines");

// ── Import ───────────────────────────────────────────────────
export async function importFile(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/import`, { method: "POST", body: fd });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  return res.json();
}

// ── Analysis ──────────────────────────────────────────────────
export const runAnalysis = (semaine: string) =>
  post<{ status: string; total: number }>(`/api/analysis/run/${semaine}`);

export const getProgress = (semaine: string) =>
  get<Progress>(`/api/analysis/progress/${semaine}`);

export const getAnalyses = (semaine: string) =>
  get<Ticket[]>(`/api/analysis/${semaine}`);

// ── Review ────────────────────────────────────────────────────
export const recordDecision = (payload: DecisionPayload) =>
  post<{ ok: boolean; pending: number }>("/api/review/decision", payload);

export const setExpert = (semaine: string, expert_nom: string) =>
  post<{ ok: boolean }>("/api/review/expert", { semaine_code: semaine, expert_nom });

export const getPending = (semaine: string) =>
  get<{ pending: number }>(`/api/review/pending/${semaine}`);

// ── Analytics ─────────────────────────────────────────────────
export const getTrends = (semaine: string) =>
  get<TrendSeries>(`/api/analytics/trends/${semaine}`);

export const getPriorities = (semaine: string) =>
  get<{ generated_at: string; recommendations: PriorityRecommendation[] }>(
    `/api/analytics/priorities/${semaine}`
  );

export const generatePriorities = (semaine: string) =>
  post<{ generated_at: string; recommendations: PriorityRecommendation[] }>(
    `/api/analytics/priorities/${semaine}`
  );

// ── Dictionary ────────────────────────────────────────────────
export const getDictionary = () => get<DictionaryEntry[]>("/api/dictionary");

export const addDictionaryEntry = (entry: Omit<DictionaryEntry, "id" | "semaines_validees" | "poids">) =>
  post<{ ok: boolean }>("/api/dictionary", entry);

export const deleteDictionaryEntry = (pattern: string) =>
  del<{ ok: boolean }>(`/api/dictionary/${encodeURIComponent(pattern)}`);

// ── Exclusions ────────────────────────────────────────────────
export const getExclusions = () => get<ExclusionRule[]>("/api/exclusions");

export const addExclusion = (body: Omit<ExclusionRule, "id" | "actif" | "date_creation">) =>
  post<{ status: string }>("/api/exclusions", body);

export const toggleExclusion = (id: number) =>
  patch<{ status: string }>(`/api/exclusions/${id}`);

export const deleteExclusion = (id: number) =>
  del<{ status: string }>(`/api/exclusions/${id}`);

// ── Export ────────────────────────────────────────────────────
export async function exportPdf(semaine: string): Promise<void> {
  const res = await fetch(`${BASE}/api/export/pdf/${semaine}`, { method: "POST" });
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `holter_pms_${semaine}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportExcel(semaine: string): Promise<void> {
  const res = await fetch(`${BASE}/api/export/excel/${semaine}`);
  if (!res.ok) {
    const detail = await res.json().then((d) => d.detail).catch(() => res.statusText);
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `holter_pms_${semaine}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
