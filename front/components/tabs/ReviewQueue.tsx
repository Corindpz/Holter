"use client";

import { useState, useEffect } from "react";
import type { Ticket, Semaine, ActionExpert, Decision } from "@/lib/types";
import { recordDecision, setExpert } from "@/lib/api";
import { formatDate, formatConfidence, cls } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DecisionChip, SignalChip, NiveauChip } from "@/components/ui/Chip";

const PAGE_SIZE = 50;

interface Props {
  tickets: Ticket[];
  semaine: Semaine | null;
  loading: boolean;
  onDecisionRecorded: () => Promise<void>;
  selectedCode: string;
}

type FilterDecision = "ALL" | "ANALYSE_REQUISE" | "SURVEILLER" | "CLOS";

export function ReviewQueue({ tickets, semaine, loading, onDecisionRecorded, selectedCode }: Props) {
  const [filter, setFilter] = useState<FilterDecision>("ANALYSE_REQUISE");
  const [page, setPage] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expertName, setExpertName] = useState("");
  const [expertSaved, setExpertSaved] = useState(false);
  const [action, setAction] = useState<ActionExpert>("CONFIRMER");
  const [decisionFinale, setDecisionFinale] = useState<Decision>("CLOS");
  const [commentaire, setCommentaire] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load expert from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("holter-expert") ?? "";
    if (saved) { setExpertName(saved); setExpertSaved(true); }
  }, []);

  function saveExpert() {
    localStorage.setItem("holter-expert", expertName);
    setExpertSaved(true);
    if (selectedCode) setExpert(selectedCode, expertName).catch(() => null);
  }

  const filtered = tickets.filter((t) =>
    filter === "ALL" ? true : t.decision === filter
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function openReview(ticket: Ticket) {
    setSelectedTicket(ticket);
    setAction("CONFIRMER");
    setDecisionFinale(ticket.decision ?? "CLOS");
    setCommentaire("");
    setSubmitError(null);
    setModalOpen(true);
  }

  async function submitDecision() {
    if (!selectedTicket || !expertName) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordDecision({
        ticket_id: selectedTicket.id,
        semaine_code: selectedTicket.semaine_code,
        expert_nom: expertName,
        action,
        decision_finale: decisionFinale,
        commentaire: commentaire || undefined,
      });
      setModalOpen(false);
      await onDecisionRecorded();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 space-y-4 animate-stagger">
      {/* ── Expert header ───────────────────────── */}
      <div className="card p-4 flex items-center gap-4">
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
          Expert de revue
        </div>
        <input
          className="input"
          style={{ maxWidth: "200px" }}
          placeholder="Votre nom…"
          value={expertName}
          onChange={(e) => { setExpertName(e.target.value); setExpertSaved(false); }}
          onKeyDown={(e) => e.key === "Enter" && saveExpert()}
        />
        {!expertSaved && expertName && (
          <Button size="sm" onClick={saveExpert}>Enregistrer</Button>
        )}
        {expertSaved && (
          <span style={{ fontSize: "12px", color: "var(--color-clos)" }}>✓ Enregistré</span>
        )}
        <div className="ml-auto text-label">
          {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {(["ALL", "ANALYSE_REQUISE", "SURVEILLER", "CLOS"] as FilterDecision[]).map((f) => {
          const counts: Record<FilterDecision, number> = {
            ALL: tickets.length,
            ANALYSE_REQUISE: tickets.filter((t) => t.decision === "ANALYSE_REQUISE").length,
            SURVEILLER: tickets.filter((t) => t.decision === "SURVEILLER").length,
            CLOS: tickets.filter((t) => t.decision === "CLOS").length,
          };
          const labels: Record<FilterDecision, string> = {
            ALL: "Tous",
            ANALYSE_REQUISE: "Analyse requise",
            SURVEILLER: "Surveiller",
            CLOS: "Clos",
          };
          return (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              className={cls(
                "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                filter === f
                  ? "bg-[var(--color-card)] text-[var(--color-text)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-text)]"
              )}
              style={{ border: filter === f ? "1px solid var(--color-border-strong)" : "1px solid transparent" }}
            >
              {labels[f]}
              <span className="ml-1.5 font-mono text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                {counts[f]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table ───────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 rounded animate-pulse" style={{ background: "var(--color-elevated)", animationDelay: `${i * 40}ms` }} />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-10 text-center" style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
            Aucun ticket dans cette catégorie.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Objet</th>
                <th>Produit</th>
                <th>Signal</th>
                <th>Niveau</th>
                <th>Décision IA</th>
                <th>Conf.</th>
                <th>Expert</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr
                  key={t.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => openReview(t)}
                >
                  <td className="text-mono" style={{ color: "var(--color-text-tertiary)", fontSize: "11px" }}>
                    {t.id}
                  </td>
                  <td className="text-mono" style={{ color: "var(--color-text-tertiary)", fontSize: "11px" }}>
                    {formatDate(t.date_creation)}
                  </td>
                  <td style={{ maxWidth: "240px" }}>
                    <span className="block truncate text-xs" title={t.objet ?? ""}>{t.objet ?? "—"}</span>
                  </td>
                  <td style={{ maxWidth: "120px" }}>
                    <span className="block truncate text-xs" title={t.produit ?? ""}>{t.produit ?? "—"}</span>
                  </td>
                  <td><SignalChip signal={t.signal} /></td>
                  <td><NiveauChip niveau={t.niveau} /></td>
                  <td><DecisionChip decision={t.decision} /></td>
                  <td className="text-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {formatConfidence(t.confiance)}
                  </td>
                  <td>
                    {t.action_expert ? (
                      <span className="text-[11px]" style={{ color: "var(--color-clos)" }}>✓ {t.action_expert}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: "11px" }}>—</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!t.action_expert && t.decision !== null && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openReview(t)}
                      >
                        Valider
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ──────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Précédent
          </Button>
          <span className="text-mono text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            {page + 1} / {totalPages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Suivant →
          </Button>
        </div>
      )}

      {/* ── Review modal ────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Valider — ${selectedTicket?.id ?? ""}`}
        size="lg"
      >
        {selectedTicket && (
          <div className="space-y-4">
            {/* Ticket info */}
            <div className="rounded-md p-4 space-y-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div>
                <div className="text-label mb-1">Objet</div>
                <div style={{ fontSize: "13px" }}>{selectedTicket.objet ?? "—"}</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Produit", value: selectedTicket.produit ?? "—" },
                  { label: "Site", value: selectedTicket.site ?? "—" },
                  { label: "Statut", value: selectedTicket.statut ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-label mb-0.5">{label}</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{value}</div>
                  </div>
                ))}
              </div>
              {selectedTicket.raisonnement && (
                <div>
                  <div className="text-label mb-1">Raisonnement IA</div>
                  <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                    {selectedTicket.raisonnement}
                  </p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <SignalChip signal={selectedTicket.signal} />
                <NiveauChip niveau={selectedTicket.niveau} />
                <DecisionChip decision={selectedTicket.decision} />
                <span className="text-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Conf. {formatConfidence(selectedTicket.confiance)} — Pass {selectedTicket.passe_finale}
                </span>
              </div>
              {selectedTicket.articles_cites && selectedTicket.articles_cites.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTicket.articles_cites.map((a) => (
                    <span
                      key={a}
                      className="text-mono text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-card)", color: "var(--color-text-tertiary)", border: "1px solid var(--color-border)" }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Expert action */}
            <div className="space-y-3">
              <div>
                <div className="text-label mb-2">Action</div>
                <div className="flex gap-2">
                  {(["CONFIRMER", "RECLASSER", "ECARTER"] as ActionExpert[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAction(a)}
                      className="px-3 py-2 rounded text-xs font-medium transition-colors"
                      style={{
                        background: action === a ? "var(--color-accent)" : "var(--color-elevated)",
                        color: action === a ? "white" : "var(--color-text-secondary)",
                        border: `1px solid ${action === a ? "var(--color-accent)" : "var(--color-border)"}`,
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {action === "RECLASSER" && (
                <div>
                  <div className="text-label mb-2">Nouvelle décision</div>
                  <div className="flex gap-2">
                    {(["ANALYSE_REQUISE", "SURVEILLER", "CLOS"] as Decision[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDecisionFinale(d)}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{
                          background: decisionFinale === d ? "var(--color-elevated)" : "transparent",
                          color: decisionFinale === d ? "var(--color-text)" : "var(--color-text-tertiary)",
                          border: `1px solid ${decisionFinale === d ? "var(--color-border-strong)" : "var(--color-border)"}`,
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-label mb-1.5">Commentaire (optionnel)</div>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Justification de la décision…"
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
              </div>
            </div>

            {submitError && (
              <div className="text-sm px-3 py-2 rounded" style={{ background: "rgba(226,75,74,0.1)", color: "var(--color-mv)", border: "1px solid rgba(226,75,74,0.2)" }}>
                {submitError}
              </div>
            )}

            {!expertName && (
              <div className="text-sm" style={{ color: "var(--color-iv)" }}>
                ⚠ Renseignez votre nom en haut de page avant de valider.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
              <Button
                variant="primary"
                loading={submitting}
                disabled={!expertName}
                onClick={submitDecision}
              >
                Valider
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
