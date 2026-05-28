"use client";

import { useState } from "react";
import type { Ticket, Signal } from "@/lib/types";
import { formatDate, formatConfidence } from "@/lib/utils";
import { SignalChip, NiveauChip, DecisionChip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";

interface Props {
  tickets: Ticket[];
  loading: boolean;
}

type SignalFilter = "ALL" | Signal;

export function Signals({ tickets, loading }: Props) {
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("ALL");
  const [detail, setDetail] = useState<Ticket | null>(null);

  const withSignals = tickets.filter(
    (t) => t.signal != null && t.decision !== "CLOS"
  );

  const filtered = withSignals.filter(
    (t) => signalFilter === "ALL" || t.signal === signalFilter
  );

  // Group by signal for the summary row
  const counts = {
    MV: withSignals.filter((t) => t.signal === "MV").length,
    IV: withSignals.filter((t) => t.signal === "IV").length,
    SECU: withSignals.filter((t) => t.signal === "SECU").length,
  };

  return (
    <div className="p-6 space-y-4 animate-stagger">
      {/* ── Summary cards ───────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: "MV" as Signal, label: "Matériovigilance", color: "var(--color-mv)", bg: "rgba(226,75,74,0.08)", border: "rgba(226,75,74,0.2)" },
          { key: "IV" as Signal, label: "Identitovigilance", color: "var(--color-iv)", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
          { key: "SECU" as Signal, label: "Sécurité", color: "var(--color-secu)", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)" },
        ] as const).map(({ key, label, color, bg, border }) => (
          <button
            key={key}
            onClick={() => setSignalFilter(signalFilter === key ? "ALL" : key)}
            className="card p-4 text-left transition-all"
            style={{
              background: signalFilter === key ? bg : "var(--color-card)",
              borderColor: signalFilter === key ? border : "var(--color-border)",
            }}
          >
            <div className="text-label mb-2">{label}</div>
            <div style={{ fontSize: "28px", fontWeight: 600, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {loading ? (
                <span className="inline-block w-8 h-6 rounded animate-pulse" style={{ background: "var(--color-elevated)" }} />
              ) : counts[key]}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>
              signal{counts[key] !== 1 ? "s" : ""} actif{counts[key] !== 1 ? "s" : ""}
            </div>
          </button>
        ))}
      </div>

      {/* ── Signals table ───────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ fontSize: "13px", fontWeight: 500 }}>
            Signaux vigilance actifs
            {signalFilter !== "ALL" && (
              <span className="ml-2" style={{ color: "var(--color-text-tertiary)" }}>
                · filtre {signalFilter}
              </span>
            )}
          </span>
          <span className="text-label">{filtered.length} ticket{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-9 rounded animate-pulse" style={{ background: "var(--color-elevated)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center" style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
            {withSignals.length === 0
              ? "Aucun signal vigilance détecté pour cette semaine."
              : "Aucun signal pour ce filtre."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Objet</th>
                <th>Produit</th>
                <th>Site</th>
                <th>Signal</th>
                <th>Niveau</th>
                <th>Décision</th>
                <th>Conf.</th>
                <th>Articles</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => setDetail(t)} style={{ cursor: "pointer" }}>
                  <td className="text-mono" style={{ color: "var(--color-text-tertiary)", fontSize: "11px" }}>{t.id}</td>
                  <td className="text-mono" style={{ color: "var(--color-text-tertiary)", fontSize: "11px" }}>{formatDate(t.date_creation)}</td>
                  <td style={{ maxWidth: "200px" }}>
                    <span className="block truncate text-xs" title={t.objet ?? ""}>{t.objet ?? "—"}</span>
                  </td>
                  <td style={{ maxWidth: "120px" }}>
                    <span className="block truncate text-xs" title={t.produit ?? ""}>{t.produit ?? "—"}</span>
                  </td>
                  <td style={{ maxWidth: "100px" }}>
                    <span className="block truncate text-xs" title={t.site ?? ""}>{t.site ?? "—"}</span>
                  </td>
                  <td><SignalChip signal={t.signal} /></td>
                  <td><NiveauChip niveau={t.niveau} /></td>
                  <td><DecisionChip decision={t.decision} /></td>
                  <td className="text-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {formatConfidence(t.confiance)}
                  </td>
                  <td>
                    {t.articles_cites && t.articles_cites.length > 0 ? (
                      <span className="text-mono text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {t.articles_cites.length} art.
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <button
                      className="text-[11px] transition-colors"
                      style={{ color: "var(--color-text-tertiary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
                      onClick={(e) => { e.stopPropagation(); setDetail(t); }}
                    >
                      Détail →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Detail modal ────────────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Signal — ${detail?.id ?? ""}`}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <SignalChip signal={detail.signal} />
              <NiveauChip niveau={detail.niveau} />
              <DecisionChip decision={detail.decision} />
              <span className="text-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                Conf. {formatConfidence(detail.confiance)} — Pass {detail.passe_finale ?? "—"}
              </span>
            </div>

            <div className="rounded-md p-4 space-y-3" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
              <div>
                <div className="text-label mb-1">Objet</div>
                <div style={{ fontSize: "13px" }}>{detail.objet ?? "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Produit", value: detail.produit },
                  { label: "Site / Établissement", value: detail.site },
                  { label: "Priorité", value: detail.priorite },
                  { label: "Statut", value: detail.statut },
                  { label: "Date création", value: formatDate(detail.date_creation) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-label mb-0.5">{label}</div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{value ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            {detail.raisonnement && (
              <div>
                <div className="text-label mb-1.5">Raisonnement IA</div>
                <p className="rounded-md p-3" style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.7, background: "var(--color-elevated)", border: "1px solid var(--color-border)" }}>
                  {detail.raisonnement}
                </p>
              </div>
            )}

            {detail.articles_cites && detail.articles_cites.length > 0 && (
              <div>
                <div className="text-label mb-1.5">Articles réglementaires cités</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.articles_cites.map((a) => (
                    <span
                      key={a}
                      className="text-mono text-[11px] px-2 py-0.5 rounded"
                      style={{ background: "var(--color-elevated)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.mots_cles && detail.mots_cles.length > 0 && (
              <div>
                <div className="text-label mb-1.5">Mots-clés détectés</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.mots_cles.map((k) => (
                    <span
                      key={k}
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{ background: "var(--color-elevated)", color: "var(--color-text-tertiary)", border: "1px solid var(--color-border)" }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.action_expert && (
              <div className="rounded-md p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <div className="text-label mb-1">Décision expert</div>
                <div style={{ fontSize: "12px", color: "var(--color-clos)" }}>
                  {detail.action_expert} → {detail.decision_finale}
                  {detail.commentaire && ` — ${detail.commentaire}`}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
