"use client";

import { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import type { Semaine, TrendCluster } from "@/lib/types";
import { getTrends, getPriorities, generatePriorities } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SignalChip, NiveauChip } from "@/components/ui/Chip";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

interface Props {
  semaine: Semaine | null;
  selectedCode: string;
}

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "rgba(237,237,233,0.55)", font: { size: 11, family: "var(--font-geist-sans)" } } },
    tooltip: {
      backgroundColor: "#1a1a1a",
      borderColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      titleColor: "#edede9",
      bodyColor: "rgba(237,237,233,0.7)",
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "rgba(237,237,233,0.4)", font: { size: 10 } },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "rgba(237,237,233,0.4)", font: { size: 10 } },
    },
  },
} as const;

export function Analytics({ semaine, selectedCode }: Props) {
  const [trends, setTrends] = useState<{ labels: string[]; bySignal: Record<string, number[]>; clusters: TrendCluster[] } | null>(null);
  const [priorities, setPriorities] = useState<{ generated_at: string; recommendations: unknown[] } | null>(null);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [loadingPrio, setLoadingPrio] = useState(false);
  const [generatingPrio, setGeneratingPrio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCode) return;
    setLoadingTrends(true);
    getTrends(selectedCode)
      .then((data) => {
        setTrends({
          labels: data.weekly_labels,
          bySignal: data.weekly_by_signal as Record<string, number[]>,
          clusters: data.clusters,
        });
      })
      .catch(() => setTrends(null))
      .finally(() => setLoadingTrends(false));

    setLoadingPrio(true);
    getPriorities(selectedCode)
      .then(setPriorities)
      .catch(() => setPriorities(null))
      .finally(() => setLoadingPrio(false));
  }, [selectedCode]);

  async function handleGeneratePrio() {
    if (!selectedCode) return;
    setGeneratingPrio(true);
    setError(null);
    try {
      const data = await generatePriorities(selectedCode);
      setPriorities(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingPrio(false);
    }
  }

  const chartData = trends ? {
    labels: trends.labels,
    datasets: [
      {
        label: "MV",
        data: trends.bySignal["MV"] ?? [],
        backgroundColor: "rgba(226,75,74,0.7)",
        borderColor: "#e24b4a",
        borderWidth: 1,
      },
      {
        label: "IV",
        data: trends.bySignal["IV"] ?? [],
        backgroundColor: "rgba(245,158,11,0.7)",
        borderColor: "#f59e0b",
        borderWidth: 1,
      },
      {
        label: "SECU",
        data: trends.bySignal["SECU"] ?? [],
        backgroundColor: "rgba(59,130,246,0.7)",
        borderColor: "#3b82f6",
        borderWidth: 1,
      },
    ],
  } : null;

  return (
    <div className="p-6 space-y-5 animate-stagger">
      {/* ── Trend chart ─────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ fontSize: "13px", fontWeight: 500 }}>Tendances 13 semaines</span>
          <span className="text-label">par signal</span>
        </div>
        <div className="p-5" style={{ height: "240px" }}>
          {loadingTrends ? (
            <Skeleton height={200} />
          ) : chartData ? (
            <Bar data={chartData} options={CHART_OPTS as Parameters<typeof Bar>[0]["options"]} />
          ) : (
            <Empty text="Aucune donnée de tendance pour cette semaine." />
          )}
        </div>
      </div>

      {/* ── Clusters table ──────────────────────── */}
      {trends && trends.clusters.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 500 }}>Top clusters de risque</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Signal</th>
                <th>Niveau</th>
                <th>Tickets semaine</th>
                <th>Moy. 13s</th>
                <th>Score</th>
                <th>Vélocité</th>
              </tr>
            </thead>
            <tbody>
              {trends.clusters.map((c) => (
                <tr key={c.cluster_id}>
                  <td style={{ fontWeight: 500, fontSize: "12px" }}>{c.produit}</td>
                  <td><SignalChip signal={c.signal} /></td>
                  <td><NiveauChip niveau={c.niveau} /></td>
                  <td className="text-mono">{c.count_current}</td>
                  <td className="text-mono" style={{ color: "var(--color-text-secondary)" }}>{c.avg_13s.toFixed(1)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-elevated)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(c.score, 100)}%`, background: scoreGradient(c.score) }}
                        />
                      </div>
                      <span className="text-mono text-xs">{c.score.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="text-mono" style={{ color: velociteColor(c.velocite) }}>
                    {c.velocite >= 1 ? "+" : ""}{c.velocite.toFixed(1)}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Priority recommendations ─────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ fontSize: "13px", fontWeight: 500 }}>Recommandations IA</span>
          {semaine?.analyse_complete && (
            <Button
              variant="secondary"
              size="sm"
              loading={generatingPrio}
              onClick={handleGeneratePrio}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 110 20A10 10 0 0112 2zm0 0v4m0 14v-4M2 12h4m14 0h-4" />
              </svg>
              Générer
            </Button>
          )}
        </div>

        {error && (
          <div className="px-5 py-3 text-sm" style={{ color: "var(--color-mv)" }}>{error}</div>
        )}

        {loadingPrio ? (
          <div className="p-5 space-y-3">
            {[1,2,3].map((i) => <Skeleton key={i} height={56} />)}
          </div>
        ) : priorities && Array.isArray((priorities as { recommendations: unknown[] }).recommendations) && (priorities as { recommendations: unknown[] }).recommendations.length > 0 ? (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {((priorities as { recommendations: PrioRec[] }).recommendations).map((r) => (
              <div key={r.rang} className="px-5 py-4 space-y-1.5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span
                      className="text-mono text-[10px] mr-2"
                      style={{ color: "var(--color-accent)" }}
                    >
                      #{r.rang}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>{r.titre}</span>
                  </div>
                  <span
                    className="shrink-0 text-mono text-[11px] px-2 py-0.5 rounded"
                    style={{ background: "rgba(226,75,74,0.1)", color: "var(--color-accent)", border: "1px solid rgba(226,75,74,0.2)" }}
                  >
                    Score {r.score.toFixed(0)}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{r.justification}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
                    Action : <span style={{ color: "var(--color-text-secondary)" }}>{r.action_suggeree}</span>
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
                    Délai : <span style={{ color: "var(--color-text-secondary)" }}>{r.delai_reglementaire}</span>
                  </span>
                </div>
                {r.articles_mdr.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.articles_mdr.map((a) => (
                      <span
                        key={a}
                        className="text-mono text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: "var(--color-elevated)", color: "var(--color-text-tertiary)", border: "1px solid var(--color-border)" }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5">
            {!semaine?.analyse_complete ? (
              <Empty text="L'analyse IA doit être complète pour générer des recommandations." />
            ) : (
              <Empty text="Cliquez sur « Générer » pour produire des recommandations IA." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type PrioRec = {
  rang: number; titre: string; cluster: string; score: number;
  justification: string; articles_mdr: string[];
  action_suggeree: string; delai_reglementaire: string;
};

function scoreGradient(score: number): string {
  if (score >= 75) return "#e24b4a";
  if (score >= 40) return "#f59e0b";
  return "#3b82f6";
}

function velociteColor(v: number): string {
  if (v >= 2) return "var(--color-mv)";
  if (v >= 1.2) return "var(--color-iv)";
  return "var(--color-text-tertiary)";
}

function Skeleton({ height }: { height: number }) {
  return (
    <div
      className="rounded animate-pulse"
      style={{ height, background: "var(--color-elevated)" }}
    />
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-8" style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
      {text}
    </div>
  );
}
