import type { Decision, Signal, Niveau, KpiSummary, Ticket } from "./types";

export function signalColor(signal: Signal | null | undefined): string {
  switch (signal) {
    case "MV":   return "mv";
    case "IV":   return "iv";
    case "SECU": return "secu";
    default:     return "text-tertiary";
  }
}

export function signalLabel(signal: Signal | null | undefined): string {
  switch (signal) {
    case "MV":   return "Matériovigilance";
    case "IV":   return "Identitovigilance";
    case "SECU": return "Sécurité";
    default:     return "—";
  }
}

export function decisionColor(decision: Decision | null | undefined): string {
  switch (decision) {
    case "ANALYSE_REQUISE": return "mv";
    case "SURVEILLER":      return "surveiller";
    case "CLOS":            return "clos";
    default:                return "text-tertiary";
  }
}

export function decisionLabel(decision: Decision | null | undefined): string {
  switch (decision) {
    case "ANALYSE_REQUISE": return "Analyse requise";
    case "SURVEILLER":      return "Surveiller";
    case "CLOS":            return "Clos";
    default:                return "En attente";
  }
}

export function niveauLabel(niveau: Niveau | null | undefined): string {
  switch (niveau) {
    case "CRITIQUE": return "Critique";
    case "MAJEUR":   return "Majeur";
    case "MINEUR":   return "Mineur";
    default:         return "—";
  }
}

export function niveauColor(niveau: Niveau | null | undefined): string {
  switch (niveau) {
    case "CRITIQUE": return "#e24b4a";
    case "MAJEUR":   return "#f59e0b";
    case "MINEUR":   return "#3b82f6";
    default:         return "var(--color-text-tertiary)";
  }
}

export function formatSemaine(code: string): string {
  if (!code) return code;
  const [year, week] = code.split("-W");
  return `S${week} — ${year}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatConfidence(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export function computeKpis(tickets: Ticket[]): KpiSummary {
  return tickets.reduce<KpiSummary>(
    (acc, t) => {
      acc.total++;
      if (t.decision === "ANALYSE_REQUISE") acc.analyse_requise++;
      else if (t.decision === "SURVEILLER") acc.surveiller++;
      else if (t.decision === "CLOS") acc.clos++;
      return acc;
    },
    { total: 0, analyse_requise: 0, surveiller: 0, clos: 0 }
  );
}

export function cls(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
