//backend/src/config/featureFlags.ts

export function isPracticeGenEnabled(): boolean {
  return String(process.env.PRACTICE_GEN_ENABLED || "").toLowerCase() === "true";
}
