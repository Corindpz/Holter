"use client";

import { useState, useEffect, useCallback } from "react";
import type { Semaine, Ticket } from "@/lib/types";
import { getSemaines, getAnalyses, getProgress } from "@/lib/api";
import { formatSemaine, computeKpis } from "@/lib/utils";
import { Dashboard } from "@/components/tabs/Dashboard";
import { Analytics } from "@/components/tabs/Analytics";
import { ReviewQueue } from "@/components/tabs/ReviewQueue";
import { Signals } from "@/components/tabs/Signals";
import { Dictionary } from "@/components/tabs/Dictionary";
import { Settings } from "@/components/tabs/Settings";

type Tab = "dashboard" | "analytics" | "review" | "signals" | "dictionary" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard",  label: "Tableau de bord",    icon: <IconGrid /> },
  { id: "analytics",  label: "Tendances",           icon: <IconChart /> },
  { id: "review",     label: "File de revue",       icon: <IconQueue /> },
  { id: "signals",    label: "Signaux vigilance",   icon: <IconAlert /> },
  { id: "dictionary", label: "Dictionnaire",        icon: <IconBook /> },
  { id: "settings",   label: "Paramètres",          icon: <IconSettings /> },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [semaines, setSemaines] = useState<Semaine[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [backendDown, setBackendDown] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Load theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("holter-theme") as "dark" | "light" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("holter-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Load semaines on mount
  const refreshSemaines = useCallback(async () => {
    try {
      const data = await getSemaines();
      setBackendDown(false);
      setSemaines(data);
      if (!selectedCode && data.length > 0) {
        setSelectedCode(data[0].code);
      }
    } catch {
      setBackendDown(true);
    }
  }, [selectedCode]);

  useEffect(() => {
    refreshSemaines();
  }, []);

  // Load tickets when semaine changes
  const refreshTickets = useCallback(async () => {
    if (!selectedCode) return;
    setLoadingTickets(true);
    try {
      const data = await getAnalyses(selectedCode);
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, [selectedCode]);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  // Poll progress while analysis running
  useEffect(() => {
    if (!analysisRunning || !selectedCode) return;
    const interval = setInterval(async () => {
      try {
        const p = await getProgress(selectedCode);
        if (!p.running) {
          setAnalysisRunning(false);
          await refreshSemaines();
          await refreshTickets();
        }
      } catch {
        setAnalysisRunning(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [analysisRunning, selectedCode, refreshSemaines, refreshTickets]);

  const currentSemaine = semaines.find((s) => s.code === selectedCode) ?? null;
  const kpis = computeKpis(tickets);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* ── Top bar ─────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 border-b shrink-0"
        style={{
          height: "52px",
          borderColor: "var(--color-border)",
          background: "var(--color-elevated)",
        }}
      >
        {/* Logo + wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-white"
              style={{ background: "var(--color-accent)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--color-text)" }}>
              Holter PMS
            </span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{
            background: "rgba(226,75,74,0.12)",
            color: "var(--color-accent)",
            border: "1px solid rgba(226,75,74,0.25)"
          }}>
            TRIAGE
          </span>
        </div>

        {/* Semaine selector + meta */}
        <div className="flex items-center gap-3">
          {currentSemaine && !currentSemaine.analyse_complete && (
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--color-text-tertiary)" }}>
              <span className="pulse-dot w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--color-iv)" }} />
              Non analysé
            </span>
          )}
          {currentSemaine?.analyse_complete && (
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--color-clos)" }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--color-clos)" }} />
              Analysé
            </span>
          )}
          <select
            className="input"
            style={{ width: "auto", minWidth: "140px", fontSize: "12px", padding: "5px 30px 5px 10px" }}
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
          >
            {semaines.length === 0 && (
              <option value="">Aucune semaine</option>
            )}
            {semaines.map((s) => (
              <option key={s.code} value={s.code}>
                {formatSemaine(s.code)} — {s.nb_tickets} tickets
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Nav + Content ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav
          className="flex flex-col gap-0.5 px-2 py-3 shrink-0 border-r"
          style={{
            width: "200px",
            borderColor: "var(--color-border)",
            background: "var(--color-elevated)",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors w-full"
              style={{
                fontSize: "13px",
                color: tab === t.id ? "var(--color-text)" : "var(--color-text-secondary)",
                background: tab === t.id ? "var(--color-card)" : "transparent",
                fontWeight: tab === t.id ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  (e.currentTarget as HTMLElement).style.background = "var(--color-card)";
                  (e.currentTarget as HTMLElement).style.color = "var(--color-text)";
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--color-text-secondary)";
                }
              }}
            >
              <span style={{ opacity: tab === t.id ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
              {t.id === "review" && kpis.analyse_requise > 0 && (
                <span
                  className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: "var(--color-mv)", color: "white" }}
                >
                  {kpis.analyse_requise}
                </span>
              )}
            </button>
          ))}

          <div className="mt-auto">
            <div
              className="px-3 py-2 text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Softway Medical
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg)" }}>
          {backendDown && (
            <div
              className="flex items-center gap-3 px-5 py-2.5 text-sm"
              style={{
                background: "rgba(245,158,11,0.1)",
                borderBottom: "1px solid rgba(245,158,11,0.25)",
                color: "var(--color-iv)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Backend indisponible — lancez{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)" }}>
                python holter.py
              </code>
              {" "}pour démarrer le serveur (port 8765).
            </div>
          )}
          {tab === "dashboard" && (
            <Dashboard
              semaine={currentSemaine}
              tickets={tickets}
              kpis={kpis}
              loading={loadingTickets}
              analysisRunning={analysisRunning}
              setAnalysisRunning={setAnalysisRunning}
              onImportDone={async (code) => {
                setSelectedCode(code);
                await refreshSemaines();
              }}
              onAnalysisStart={() => setAnalysisRunning(true)}
              selectedCode={selectedCode}
            />
          )}
          {tab === "analytics" && (
            <Analytics semaine={currentSemaine} selectedCode={selectedCode} />
          )}
          {tab === "review" && (
            <ReviewQueue
              tickets={tickets}
              semaine={currentSemaine}
              loading={loadingTickets}
              onDecisionRecorded={refreshTickets}
              selectedCode={selectedCode}
            />
          )}
          {tab === "signals" && (
            <Signals tickets={tickets} loading={loadingTickets} />
          )}
          {tab === "dictionary" && <Dictionary />}
          {tab === "settings" && (
            <Settings
              theme={theme}
              onToggleTheme={toggleTheme}
              semaine={currentSemaine}
              selectedCode={selectedCode}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Nav icons ────────────────────────────────────────────────
function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconQueue() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}
