import type { Signal, Decision, Niveau, Poids } from "@/lib/types";
import { cls } from "@/lib/utils";

interface ChipProps {
  label: string;
  color?: "mv" | "iv" | "secu" | "clos" | "surveiller" | "neutral" | "faible" | "moyen" | "fort";
  size?: "xs" | "sm";
}

const colorMap: Record<string, string> = {
  mv:        "bg-[rgba(226,75,74,0.15)] text-[var(--color-mv)] border border-[rgba(226,75,74,0.3)]",
  iv:        "bg-[rgba(245,158,11,0.15)] text-[var(--color-iv)] border border-[rgba(245,158,11,0.3)]",
  secu:      "bg-[rgba(59,130,246,0.15)] text-[var(--color-secu)] border border-[rgba(59,130,246,0.3)]",
  clos:      "bg-[rgba(16,185,129,0.12)] text-[var(--color-clos)] border border-[rgba(16,185,129,0.25)]",
  surveiller:"bg-[rgba(139,92,246,0.12)] text-[var(--color-surveiller)] border border-[rgba(139,92,246,0.25)]",
  neutral:   "bg-[var(--color-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border)]",
  faible:    "bg-[var(--color-elevated)] text-[var(--color-text-tertiary)] border border-[var(--color-border)]",
  moyen:     "bg-[rgba(245,158,11,0.1)] text-[var(--color-iv)] border border-[rgba(245,158,11,0.2)]",
  fort:      "bg-[rgba(226,75,74,0.1)] text-[var(--color-mv)] border border-[rgba(226,75,74,0.2)]",
};

const sizeMap = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-[11px]",
};

export function Chip({ label, color = "neutral", size = "sm" }: ChipProps) {
  return (
    <span
      className={cls(
        "inline-flex items-center rounded font-medium font-mono tracking-wide leading-none whitespace-nowrap",
        colorMap[color] ?? colorMap.neutral,
        sizeMap[size]
      )}
    >
      {label}
    </span>
  );
}

export function SignalChip({ signal }: { signal: Signal | null | undefined }) {
  if (!signal) return <span className="text-[var(--color-text-tertiary)] text-xs">—</span>;
  return <Chip label={signal} color={signal.toLowerCase() as "mv" | "iv" | "secu"} />;
}

export function DecisionChip({ decision }: { decision: Decision | null | undefined }) {
  if (!decision) return <span className="text-[var(--color-text-tertiary)] text-xs">—</span>;
  const map: Record<Decision, { label: string; color: ChipProps["color"] }> = {
    ANALYSE_REQUISE: { label: "Analyse requise", color: "mv" },
    SURVEILLER:      { label: "Surveiller", color: "surveiller" },
    CLOS:            { label: "Clos", color: "clos" },
  };
  const { label, color } = map[decision];
  return <Chip label={label} color={color} />;
}

export function NiveauChip({ niveau }: { niveau: Niveau | null | undefined }) {
  if (!niveau) return null;
  const map: Record<Niveau, ChipProps["color"]> = {
    CRITIQUE: "mv",
    MAJEUR:   "iv",
    MINEUR:   "secu",
  };
  return <Chip label={niveau} color={map[niveau]} size="xs" />;
}

export function PoidsChip({ poids }: { poids: Poids }) {
  return <Chip label={poids} color={poids} size="xs" />;
}
