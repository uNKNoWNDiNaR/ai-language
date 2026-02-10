// backend/src/services/supportFallback.ts

import type { SupportedLanguage } from "../types";
import type { SupportEventType } from "./supportPolicy";

function clampSupportLevel(value: number): number {
  if (!Number.isFinite(value)) return 0.85;
  return Math.max(0, Math.min(1, value));
}

export function buildSupportFallback(
  instructionLanguage: SupportedLanguage,
  supportLevel: number,
  eventType?: SupportEventType
): string {
  const level = clampSupportLevel(supportLevel);
  const short = level < 0.4;
  const isRetryContext =
    eventType === "WRONG_FEEDBACK" ||
    eventType === "ALMOST_FEEDBACK" ||
    eventType === "HINT_AUTO" ||
    eventType === "HINT_REQUESTED";

  switch (instructionLanguage) {
    case "de":
      return isRetryContext
        ? short
          ? "Versuch es noch einmal."
          : "Kein Druck - versuch es noch einmal."
        : short
          ? "Ich kann es gern erklaeren."
          : "Wenn du moechtest, erklaere ich es gern.";
    case "es":
      return isRetryContext
        ? short
          ? "Intentalo de nuevo."
          : "Sin prisa - intentalo de nuevo."
        : short
          ? "Puedo explicarlo si quieres."
          : "Si quieres, puedo explicarlo con calma.";
    case "fr":
      return isRetryContext
        ? short
          ? "Reessaie."
          : "Sans pression - reessaie."
        : short
          ? "Je peux l'expliquer si tu veux."
          : "Si tu veux, je l'explique calmement.";
    default:
      return isRetryContext
        ? short
          ? "Try again."
          : "No rush - try again."
        : short
          ? "I can explain if you'd like."
          : "If you'd like, I can explain it calmly.";
  }
}
