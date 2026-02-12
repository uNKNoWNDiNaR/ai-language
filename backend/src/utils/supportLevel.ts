import type { SupportedLanguage } from "../types";

export type TeachingSupportLevel = "high" | "medium" | "low";

export function isSupportLevel(value: unknown): value is TeachingSupportLevel {
  return value === "high" || value === "medium" || value === "low";
}

export function supportLevelFromNumber(
  value: number,
  fallback: TeachingSupportLevel = "high"
): TeachingSupportLevel {
  if (!Number.isFinite(value)) return fallback;
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

export function normalizeSupportLevel(value: unknown): TeachingSupportLevel | null {
  if (isSupportLevel(value)) return value;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return supportLevelFromNumber(n);
}

export function supportLevelToNumber(
  level: TeachingSupportLevel | null | undefined,
  fallback = 0.85
): number {
  switch (level) {
    case "high":
      return 0.85;
    case "medium":
      return 0.55;
    case "low":
      return 0.25;
    default:
      return fallback;
  }
}

export function fallbackSupportHint(language: SupportedLanguage): string {
  switch (language) {
    case "de":
      return "Versuche die erwartete Struktur.";
    case "es":
      return "Intenta la estructura esperada.";
    case "fr":
      return "Essaie la structure attendue.";
    default:
      return "Try the expected structure.";
  }
}
