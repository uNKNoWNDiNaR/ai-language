import type { SupportedLanguage, TeachingPace, ExplanationDepth, TeachingPrefs } from "../api/lessonAPI";

export function isInstructionLanguageEnabledFlag(value: unknown): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  return t === "1" || t === "true";
}

export function normalizeInstructionLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "en" || t === "de" || t === "es" || t === "fr") return t as SupportedLanguage;
  return null;
}

export function buildTeachingPrefsPayload(args: {
  pace: TeachingPace;
  explanationDepth: ExplanationDepth;
  instructionLanguage?: unknown;
  enableInstructionLanguage?: boolean;
}): TeachingPrefs {
  const base: TeachingPrefs = { pace: args.pace, explanationDepth: args.explanationDepth };
  if (!args.enableInstructionLanguage) return base;
  const normalized = normalizeInstructionLanguage(args.instructionLanguage);
  return normalized ? { ...base, instructionLanguage: normalized } : base;
}
