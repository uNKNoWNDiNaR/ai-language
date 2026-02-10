// backend/src/services/supportPolicy.ts

export type SupportEventType =
  | "SESSION_START"
  | "INTRO_NEW_CONCEPT"
  | "CORRECT_FEEDBACK"
  | "ALMOST_FEEDBACK"
  | "WRONG_FEEDBACK"
  | "HINT_AUTO"
  | "HINT_REQUESTED"
  | "FORCED_ADVANCE"
  | "USER_CONFUSED"
  | "USER_REQUESTED_EXPLAIN"
  | "SESSION_SUMMARY";

export function clampSupportLevel(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.85;
  return Math.max(0, Math.min(1, n));
}

export function getSupportCharLimit(level: number): number {
  const s = clampSupportLevel(level);
  if (s >= 0.75) return 280;
  if (s >= 0.4) return 200;
  return 120;
}

export function shouldIncludeSupportPolicy(args: {
  eventType: SupportEventType;
  supportLevel: number;
  questionIndex?: number;
  repeatedConfusion: boolean;
  explicitRequest: boolean;
  forceNoSupport: boolean;
}): boolean {
  if (args.forceNoSupport) return false;

  const level = clampSupportLevel(args.supportLevel);
  const idx = typeof args.questionIndex === "number" ? args.questionIndex : 0;

  if (args.eventType === "USER_REQUESTED_EXPLAIN") return true;

  if (level >= 0.75) {
    if (args.eventType === "CORRECT_FEEDBACK") {
      return idx % 2 === 0;
    }
    return true;
  }

  if (level >= 0.4) {
    if (args.eventType === "CORRECT_FEEDBACK") return false;
    if (args.eventType === "SESSION_START") return idx === 0;
    return (
      args.eventType === "INTRO_NEW_CONCEPT" ||
      args.eventType === "ALMOST_FEEDBACK" ||
      args.eventType === "WRONG_FEEDBACK" ||
      args.eventType === "HINT_AUTO" ||
      args.eventType === "HINT_REQUESTED" ||
      args.eventType === "FORCED_ADVANCE" ||
      args.eventType === "USER_CONFUSED" ||
      args.eventType === "SESSION_SUMMARY"
    );
  }

  if (args.repeatedConfusion) return true;
  return args.eventType === "USER_CONFUSED" || args.eventType === "FORCED_ADVANCE";
}
