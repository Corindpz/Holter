export type Decision = "ANALYSE_REQUISE" | "SURVEILLER" | "CLOS";
export type Signal = "MV" | "IV" | "SECU";
export type Niveau = "CRITIQUE" | "MAJEUR" | "MINEUR";
export type Poids = "faible" | "moyen" | "fort";
export type ActionExpert = "CONFIRMER" | "RECLASSER" | "ECARTER";

export interface Semaine {
  code: string;
  date_debut: string;
  date_fin: string;
  expert_nom: string | null;
  date_import: string;
  nb_tickets: number;
  analyse_complete: boolean;
}

export interface Ticket {
  id: string;
  semaine_code: string;
  objet: string | null;
  priorite: string | null;
  statut: string | null;
  produit: string | null;
  site: string | null;
  description: string | null;
  description_anonyme: string | null;
  date_creation: string | null;
  // joined from analyses
  decision: Decision | null;
  signal: Signal | null;
  niveau: Niveau | null;
  confiance: number | null;
  raisonnement: string | null;
  articles_cites: string[] | null;
  capa_suggere: number | null;
  mots_cles: string[] | null;
  passe_finale: number | null;
  // joined from decisions
  action_expert: ActionExpert | null;
  decision_finale: string | null;
  commentaire: string | null;
  decision_horodatage: string | null;
}

export interface Progress {
  done: number;
  total: number;
  running: boolean;
}

export interface DictionaryEntry {
  id: number;
  pattern: string;
  signal: Signal;
  niveau: Niveau;
  article: string | null;
  cree_par: string;
  date_creation: string;
  semaines_validees: number;
  poids: Poids;
}

export interface ExclusionRule {
  id: number;
  champ: "site" | "produit" | "objet" | "type";
  operateur: "contient" | "egal" | "commence_par";
  valeur: string;
  raison: string;
  actif: boolean;
  cree_par: string;
  date_creation: string;
}

export interface TrendCluster {
  cluster_id: string;
  produit: string;
  signal: Signal | null;
  niveau: Niveau | null;
  count_current: number;
  avg_13s: number;
  score: number;
  gravite_weight: number;
  velocite: number;
}

export interface TrendSeries {
  clusters: TrendCluster[];
  weekly_labels: string[];
  weekly_by_signal: Record<Signal, number[]>;
}

export interface PriorityRecommendation {
  rang: number;
  titre: string;
  cluster: string;
  score: number;
  justification: string;
  articles_mdr: string[];
  action_suggeree: string;
  delai_reglementaire: string;
}

export interface ImportResult {
  semaine_code: string;
  imported: number;
}

export interface DecisionPayload {
  ticket_id: string;
  semaine_code: string;
  expert_nom: string;
  action: ActionExpert;
  decision_finale: Decision;
  commentaire?: string;
}

export interface KpiSummary {
  total: number;
  analyse_requise: number;
  surveiller: number;
  clos: number;
}
