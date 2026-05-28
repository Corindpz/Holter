"use client";

import { useState, useEffect } from "react";
import type { Semaine, ExclusionRule } from "@/lib/types";
import { getExclusions, addExclusion, toggleExclusion, deleteExclusion, exportPdf, exportExcel } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatSemaine } from "@/lib/utils";

interface Props {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  semaine: Semaine | null;
  selectedCode: string;
}

const TEAM_KEY = "holter-team";

type TeamMember = { name: string; role: string };

export function Settings({ theme, onToggleTheme, semaine, selectedCode }: Props) {
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([]);
  const [loadingExcl, setLoadingExcl] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Team management
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");

  // New exclusion form
  const [excChamp, setExcChamp] = useState<ExclusionRule["champ"]>("site");
  const [excOp, setExcOp] = useState<ExclusionRule["operateur"]>("contient");
  const [excValeur, setExcValeur] = useState("");
  const [excRaison, setExcRaison] = useState("");
  const [excCreePar, setExcCreePar] = useState(() => localStorage.getItem("holter-expert") ?? "");

  const [exclFetchError, setExclFetchError] = useState(false);

  async function refreshExcl() {
    setLoadingExcl(true);
    setExclFetchError(false);
    try {
      setExclusions(await getExclusions());
    } catch {
      setExclFetchError(true);
    } finally {
      setLoadingExcl(false);
    }
  }

  useEffect(() => {
    refreshExcl();
    const saved = localStorage.getItem(TEAM_KEY);
    if (saved) setTeam(JSON.parse(saved));
  }, []);

  function saveTeam(updated: TeamMember[]) {
    setTeam(updated);
    localStorage.setItem(TEAM_KEY, JSON.stringify(updated));
  }

  function addMember() {
    if (!newMemberName) return;
    saveTeam([...team, { name: newMemberName, role: newMemberRole }]);
    setNewMemberName("");
    setNewMemberRole("");
  }

  function removeMember(idx: number) {
    saveTeam(team.filter((_, i) => i !== idx));
  }

  async function handleAddExclusion() {
    if (!excValeur || !excRaison || !excCreePar) return;
    setSubmitting(true);
    setError(null);
    try {
      await addExclusion({
        champ: excChamp,
        operateur: excOp,
        valeur: excValeur,
        raison: excRaison,
        cree_par: excCreePar,
      });
      setAddOpen(false);
      setExcValeur("");
      setExcRaison("");
      await refreshExcl();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportPdf() {
    if (!selectedCode) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      await exportPdf(selectedCode);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportExcel() {
    if (!selectedCode) return;
    setExportingXlsx(true);
    setExportError(null);
    try {
      await exportExcel(selectedCode);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExportingXlsx(false);
    }
  }

  return (
    <div className="p-6 space-y-5 animate-stagger">
      {/* ── Apparence ───────────────────────────── */}
      <Section title="Apparence">
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: "13px", fontWeight: 500 }}>Mode</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              {theme === "dark" ? "Interface sombre" : "Interface claire"}
            </div>
          </div>
          <button
            onClick={onToggleTheme}
            className="relative w-12 h-6 rounded-full transition-colors"
            style={{ background: theme === "dark" ? "var(--color-accent)" : "var(--color-border-strong)" }}
            aria-label="Basculer thème"
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ transform: theme === "dark" ? "translateX(26px)" : "translateX(2px)" }}
            />
          </button>
        </div>
      </Section>

      {/* ── Export ──────────────────────────────── */}
      <Section title="Export">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>Rapport PDF</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                {semaine
                  ? `${formatSemaine(semaine.code)} — ${semaine.nb_tickets} tickets`
                  : "Aucune semaine sélectionnée"}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={exportingPdf}
              disabled={!semaine || !semaine.analyse_complete}
              onClick={handleExportPdf}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Télécharger PDF
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>Export Excel</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                3 feuilles — Résumé, Tous les tickets, Signaux vigilance
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={exportingXlsx}
              disabled={!semaine}
              onClick={handleExportExcel}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Télécharger XLSX
            </Button>
          </div>
          {!semaine?.analyse_complete && semaine && (
            <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)" }}>
              L&apos;analyse IA doit être complète pour exporter le PDF (Excel disponible sans analyse).
            </div>
          )}
          {exportError && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "rgba(226,75,74,0.1)", color: "var(--color-mv)", border: "1px solid rgba(226,75,74,0.2)" }}>
              {exportError}
            </div>
          )}
        </div>
      </Section>

      {/* ── Équipe ──────────────────────────────── */}
      <Section title="Rotation d'équipe">
        <div className="space-y-3">
          {team.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Rôle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {team.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: "13px", fontWeight: 500 }}>{m.name}</td>
                    <td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{m.role || "—"}</td>
                    <td>
                      <button
                        className="text-[11px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-mv)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
                        onClick={() => removeMember(i)}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-center gap-2">
            <input
              className="input"
              style={{ maxWidth: "180px" }}
              placeholder="Nom"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <input
              className="input"
              style={{ maxWidth: "160px" }}
              placeholder="Rôle (optionnel)"
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <Button size="sm" onClick={addMember} disabled={!newMemberName}>
              Ajouter
            </Button>
          </div>
        </div>
      </Section>

      {/* ── Exclusions ──────────────────────────── */}
      <Section
        title="Règles d'exclusion"
        action={
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Ajouter règle
          </Button>
        }
      >
        {loadingExcl ? (
          <div className="space-y-2">
            {[1,2].map((i) => <div key={i} className="h-9 rounded animate-pulse" style={{ background: "var(--color-elevated)" }} />)}
          </div>
        ) : exclFetchError ? (
          <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)", textAlign: "center", padding: "24px 0" }}>
            Backend indisponible — démarrez le serveur pour gérer les exclusions.
          </div>
        ) : exclusions.length === 0 ? (
          <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)", textAlign: "center", padding: "24px 0" }}>
            Aucune règle d&apos;exclusion définie.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Champ</th>
                <th>Opérateur</th>
                <th>Valeur</th>
                <th>Raison</th>
                <th>Créé par</th>
                <th>Date</th>
                <th>Actif</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exclusions.map((ex) => (
                <tr key={ex.id}>
                  <td className="text-mono text-xs">{ex.champ}</td>
                  <td className="text-mono text-xs">{ex.operateur}</td>
                  <td style={{ fontSize: "12px", fontWeight: 500 }}>{ex.valeur}</td>
                  <td style={{ fontSize: "12px", color: "var(--color-text-secondary)", maxWidth: "180px" }}>
                    <span className="block truncate" title={ex.raison}>{ex.raison}</span>
                  </td>
                  <td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{ex.cree_par}</td>
                  <td className="text-mono" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
                    {formatDate(ex.date_creation)}
                  </td>
                  <td>
                    <button
                      className="w-9 h-5 rounded-full transition-colors"
                      style={{ background: ex.actif ? "var(--color-clos)" : "var(--color-elevated)", border: "1px solid var(--color-border)" }}
                      onClick={() => toggleExclusion(ex.id).then(refreshExcl)}
                    >
                      <span
                        className="block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: ex.actif ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                  </td>
                  <td>
                    <button
                      className="text-[11px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-mv)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
                      onClick={() => deleteExclusion(ex.id).then(refreshExcl)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Add exclusion modal ─────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter une règle d'exclusion" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-label mb-1.5">Champ</div>
              <select className="input" value={excChamp} onChange={(e) => setExcChamp(e.target.value as ExclusionRule["champ"])}>
                <option value="site">site</option>
                <option value="produit">produit</option>
                <option value="objet">objet</option>
                <option value="type">type</option>
              </select>
            </div>
            <div>
              <div className="text-label mb-1.5">Opérateur</div>
              <select className="input" value={excOp} onChange={(e) => setExcOp(e.target.value as ExclusionRule["operateur"])}>
                <option value="contient">contient</option>
                <option value="egal">égal</option>
                <option value="commence_par">commence par</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-label mb-1.5">Valeur</div>
            <input className="input" placeholder="ex: Infrastructure IT" value={excValeur} onChange={(e) => setExcValeur(e.target.value)} />
          </div>
          <div>
            <div className="text-label mb-1.5">Raison</div>
            <input className="input" placeholder="Justification de l'exclusion" value={excRaison} onChange={(e) => setExcRaison(e.target.value)} />
          </div>
          <div>
            <div className="text-label mb-1.5">Créé par</div>
            <input className="input" placeholder="Votre nom" value={excCreePar} onChange={(e) => setExcCreePar(e.target.value)} />
          </div>
          {error && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "rgba(226,75,74,0.1)", color: "var(--color-mv)", border: "1px solid rgba(226,75,74,0.2)" }}>
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              loading={submitting}
              disabled={!excValeur || !excRaison || !excCreePar}
              onClick={handleAddExclusion}
            >
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
        <span style={{ fontSize: "13px", fontWeight: 500 }}>{title}</span>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
