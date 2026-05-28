"use client";

import { useState, useRef } from "react";
import type { Semaine, Ticket, KpiSummary } from "@/lib/types";
import { importFile, runAnalysis, getProgress } from "@/lib/api";
import { formatSemaine, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { DecisionChip, SignalChip } from "@/components/ui/Chip";

interface Props {
  semaine: Semaine | null;
  tickets: Ticket[];
  kpis: KpiSummary;
  loading: boolean;
  analysisRunning: boolean;
  setAnalysisRunning: (v: boolean) => void;
  onImportDone: (code: string) => Promise<void>;
  onAnalysisStart: () => void;
  selectedCode: string;
}

export function Dashboard({
  semaine, tickets, kpis, loading, analysisRunning,
  setAnalysisRunning, onImportDone, onAnalysisStart, selectedCode,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await importFile(file);
      setImportSuccess(`${res.imported} tickets importés — ${formatSemaine(res.semaine_code)}`);
      await onImportDone(res.semaine_code);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleStartAnalysis() {
    if (!selectedCode) return;
    setStartingAnalysis(true);
    try {
      const r = await runAnalysis(selectedCode);
      setProgress({ done: 0, total: r.total });
      onAnalysisStart();
      // poll progress
      const poll = setInterval(async () => {
        try {
          const p = await getProgress(selectedCode);
          setProgress({ done: p.done, total: p.total });
          if (!p.running) {
            clearInterval(poll);
            setProgress(null);
            setAnalysisRunning(false);
          }
        } catch {
          clearInterval(poll);
          setAnalysisRunning(false);
        }
      }, 2000);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setStartingAnalysis(false);
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const recentSignals = tickets
    .filter((t) => t.signal && t.decision !== "CLOS")
    .slice(0, 8);

  return (
    <div className="p-6 space-y-6 animate-stagger">
      {/* ── KPI row ─────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total tickets", value: kpis.total, color: "var(--color-text)" },
          { label: "Analyse requise", value: kpis.analyse_requise, color: "var(--color-mv)" },
          { label: "Surveiller", value: kpis.surveiller, color: "var(--color-surveiller)" },
          { label: "Clos", value: kpis.clos, color: "var(--color-clos)" },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="text-label mb-2">{k.label}</div>
            <div
              className="text-display"
              style={{ color: k.color, fontSize: "28px", fontWeight: 600, letterSpacing: "-0.03em" }}
            >
              {loading ? (
                <span className="inline-block w-12 h-7 rounded animate-pulse" style={{ background: "var(--color-elevated)" }} />
              ) : (
                k.value.toLocaleString("fr-FR")
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Two-col: Import + Status ──────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Import zone */}
        <div className="card p-5 space-y-4">
          <div className="text-heading" style={{ fontSize: "14px" }}>Importer un export Salesforce</div>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
            style={{
              borderColor: dragOver ? "var(--color-accent)" : "var(--color-border-strong)",
              background: dragOver ? "rgba(226,75,74,0.05)" : "transparent",
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <div className="flex justify-center mb-3">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              Glissez un fichier CSV ou XLSX ici
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>
              ou cliquez pour sélectionner
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {importing && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Import en cours…
            </div>
          )}
          {importSuccess && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "rgba(16,185,129,0.1)", color: "var(--color-clos)", border: "1px solid rgba(16,185,129,0.2)" }}>
              {importSuccess}
            </div>
          )}
          {importError && (
            <div className="text-sm px-3 py-2 rounded" style={{ background: "rgba(226,75,74,0.1)", color: "var(--color-mv)", border: "1px solid rgba(226,75,74,0.2)" }}>
              Erreur : {importError}
            </div>
          )}
        </div>

        {/* Semaine status + analysis trigger */}
        <div className="card p-5 space-y-4">
          <div className="text-heading" style={{ fontSize: "14px" }}>Analyse IA</div>

          {semaine ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Semaine", value: formatSemaine(semaine.code) },
                  { label: "Import", value: formatDate(semaine.date_import) },
                  { label: "Tickets", value: semaine.nb_tickets.toLocaleString("fr-FR") },
                  { label: "Statut", value: semaine.analyse_complete ? "✓ Analysé" : "En attente" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-label mb-0.5">{label}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text)" }}>{value}</div>
                  </div>
                ))}
              </div>

              {(analysisRunning || progress) && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                    <span>Analyse en cours…</span>
                    <span className="font-mono">{progress?.done ?? 0} / {progress?.total ?? semaine.nb_tickets}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-elevated)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: "var(--color-accent)" }}
                    />
                  </div>
                </div>
              )}

              {!semaine.analyse_complete && !analysisRunning && (
                <Button
                  variant="primary"
                  onClick={handleStartAnalysis}
                  loading={startingAnalysis}
                  disabled={semaine.nb_tickets === 0}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Lancer l&apos;analyse IA
                </Button>
              )}
              {semaine.analyse_complete && !analysisRunning && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-clos)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Analyse complète
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
              Importez un fichier pour commencer.
            </div>
          )}
        </div>
      </div>

      {/* ── Recent signals ──────────────────────────── */}
      {recentSignals.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>Signaux actifs</span>
            <span className="ml-2 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {recentSignals.length} ticket{recentSignals.length > 1 ? "s" : ""}
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Objet</th>
                <th>Signal</th>
                <th>Décision</th>
                <th>Confiance</th>
              </tr>
            </thead>
            <tbody>
              {recentSignals.map((t) => (
                <tr key={t.id}>
                  <td className="text-mono" style={{ color: "var(--color-text-tertiary)" }}>{t.id}</td>
                  <td style={{ maxWidth: "280px" }}>
                    <span className="block truncate" title={t.objet ?? ""}>{t.objet ?? "—"}</span>
                  </td>
                  <td><SignalChip signal={t.signal} /></td>
                  <td><DecisionChip decision={t.decision} /></td>
                  <td className="text-mono" style={{ color: "var(--color-text-secondary)" }}>
                    {t.confiance != null ? `${Math.round(t.confiance * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && semaine && kpis.total === 0 && (
        <div
          className="card p-8 text-center"
          style={{ color: "var(--color-text-tertiary)", fontSize: "13px" }}
        >
          Aucun ticket pour cette semaine. Importez un fichier Salesforce.
        </div>
      )}
    </div>
  );
}
