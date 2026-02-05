//backend/src/config/featureFlags.ts

export function isPracticeGenEnabled(): boolean {
  return String(process.env.PRACTICE_GEN_ENABLED || "").toLowerCase() === "true";
}

export function isInstructionLanguageEnabled(): boolean {
  const raw = String(process.env.FEATURE_INSTRUCTION_LANGUAGE || "").toLowerCase().trim();
  return raw === "1" || raw === "true";
}
