// backend/src/utils/instructionLanguage.ts

import type { SupportedLanguage } from "../types";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "en" || value === "de" || value === "es" || value === "fr";
}

export function normalizeLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return isSupportedLanguage(t) ? (t as SupportedLanguage) : null;
}
