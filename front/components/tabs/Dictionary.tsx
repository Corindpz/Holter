"use client";

import { useState, useEffect } from "react";
import type { DictionaryEntry, Signal, Niveau } from "@/lib/types";
import { getDictionary, addDictionaryEntry, deleteDictionaryEntry } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SignalChip, NiveauChip, PoidsChip } from "@/components/ui/Chip";
import { formatDate } from "@/lib/utils";

export function Dictionary() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<DictionaryEntry | null>(null);
  const [filterPoids, setFilterPoids] = useState<"all" | "faible" | "moyen" | "fort">("all");
  const [filterSignal, setFilterSignal] = useState<"all" | Signal>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newPattern, setNewPattern] = useState("");
  const [newSignal, setNewSignal] = useState<Signal>("MV");
  const [newNiveau, setNewNiveau] = useState<Niveau>("MAJEUR");
  const [newArticle, setNewArticle] = useState("");
  const [newCreePar, setNewCreePar] = useState(() => localStorage.getItem("holter-expert") ?? "");

  async function refresh() {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await getDictionary();
      setEntries(data);
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleAdd() {
    if (!newPattern || !newCreePar) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDictionaryEntry({
        pattern: newPattern,
        signal: newSignal,
        niveau: newNiveau,
        article: newArticle || null,
        cree_par: newCreePar,
        date_creation: new Date().toISOString(),
      });
      setAddOpen(false);
      setNewPattern("");
      setNewArticle("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setSubmitting(true);
    try {
      await deleteDictionaryEntry(delTarget.pattern);
      setDelTarget(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = entries.filter((e) => {
    if (filterPoids !== "all" && e.poids !== filterPoids) return false;
    if (filterSignal !== "all" && e.signal !== filterSignal) return false;
    return true;
  });

  const poidsCounts = {
    faible: entries.filter((e) => e.poids === "faible").length,
    moyen:  entries.filter((e) => e.poids === "moyen").length,
    fort:   entries.filter((e) => e.poids === "fort").length,
  };

  return (
    <div className="p-6 space-y-4 animate-stagger">
      {/* ── Header ──────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: "16px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            Dictionnaire déterministe
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Patterns validés qui orientent ou bypassent l&apos;analyse LLM
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Ajouter
        </Button>
      </div>

      {/* ── Poids summary ───────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: "faible" as const, label: "Faible", subtitle: "< 3 validations", color: "var(--color-text-tertiary)" },
          { key: "moyen" as const,  label: "Moyen",  subtitle: "3–9 validations",  color: "var(--color-iv)" },
          { key: "fort" as const,   label: "Fort",   subtitle: "10+ validations — bypass LLM", color: "var(--color-mv)" },
        ]).map(({ key, label, subtitle, color }) => (
          <button
            key={key}
            onClick={() => setFilterPoids(filterPoids === key ? "all" : key)}
            className="card p-4 text-left transition-all"
            style={{ borderColor: filterPoids === key ? color : "var(--color-border)" }}
          >
            <div className="text-label mb-1.5">{label}</div>
            <div style={{ fontSize: "24px", fontWeight: 600, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
              {poidsCounts[key]}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)", marginTop: "4px" }}>{subtitle}</div>
          </button>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        <select
          className="input"
          style={{ width: "auto", fontSize: "12px" }}
          value={filterSignal}
          onChange={(e) => setFilterSignal(e.target.value as typeof filterSignal)}
        >
          <option value="all">Tous les signaux</option>
          <option value="MV">MV</option>
          <option value="IV">IV</option>
          <option value="SECU">SECU</option>
        </select>
        <span className="text-label ml-auto">{filtered.length} entrée{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Table ───────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded animate-pulse" style={{ background: "var(--color-elevated)" }} />
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center" style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
            Backend indisponible — démarrez le serveur pour accéder au dictionnaire.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center" style={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
            Aucune entrée dans le dictionnaire.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Signal</th>
                <th>Niveau</th>
                <th>Article</th>
                <th>Poids</th>
                <th>Validations</th>
                <th>Créé par</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500, fontSize: "12px", fontFamily: "var(--font-geist-mono)" }}>
                    {e.pattern}
                  </td>
                  <td><SignalChip signal={e.signal} /></td>
                  <td><NiveauChip niveau={e.niveau} /></td>
                  <td className="text-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    {e.article ?? "—"}
                  </td>
                  <td><PoidsChip poids={e.poids} /></td>
                  <td className="text-mono text-xs">{e.semaines_validees}</td>
                  <td style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{e.cree_par}</td>
                  <td className="text-mono" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
                    {formatDate(e.date_creation)}
                  </td>
                  <td>
                    <button
                      className="text-[11px] transition-colors"
                      style={{ color: "var(--color-text-tertiary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-mv)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
                      onClick={() => setDelTarget(e)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add modal ───────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un pattern" size="md">
        <div className="space-y-4">
          <div>
            <div className="text-label mb-1.5">Pattern</div>
            <input
              className="input"
              placeholder="ex: défibrillateur non chargé"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-label mb-1.5">Signal</div>
              <select className="input" value={newSignal} onChange={(e) => setNewSignal(e.target.value as Signal)}>
                <option value="MV">MV — Matériovigilance</option>
                <option value="IV">IV — Identitovigilance</option>
                <option value="SECU">SECU — Sécurité</option>
              </select>
            </div>
            <div>
              <div className="text-label mb-1.5">Niveau</div>
              <select className="input" value={newNiveau} onChange={(e) => setNewNiveau(e.target.value as Niveau)}>
                <option value="CRITIQUE">CRITIQUE</option>
                <option value="MAJEUR">MAJEUR</option>
                <option value="MINEUR">MINEUR</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-label mb-1.5">Article réglementaire (optionnel)</div>
            <input
              className="input"
              placeholder="ex: MDR Art. 87"
              value={newArticle}
              onChange={(e) => setNewArticle(e.target.value)}
            />
          </div>
          <div>
            <div className="text-label mb-1.5">Créé par</div>
            <input
              className="input"
              placeholder="Votre nom"
              value={newCreePar}
              onChange={(e) => setNewCreePar(e.target.value)}
            />
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
              disabled={!newPattern || !newCreePar}
              onClick={handleAdd}
            >
              Ajouter
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirm ──────────────────────── */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} title="Supprimer le pattern" size="sm">
        <div className="space-y-4">
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            Supprimer le pattern{" "}
            <span className="font-mono" style={{ color: "var(--color-text)" }}>&ldquo;{delTarget?.pattern}&rdquo;</span>
            {" "}? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDelTarget(null)}>Annuler</Button>
            <Button variant="danger" loading={submitting} onClick={handleDelete}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
