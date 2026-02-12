export type TesterContext = {
  version: 1;
  selfReportedLevel: "A1" | "A2" | "B1_PLUS";
  goal: "SPEAKING" | "GRAMMAR" | "TRAVEL" | "OTHER";
  updatedAtISO: string;
};

const CONTEXT_PREFIX = "ai-language:testerContext:";
const DISMISS_PREFIX = "ai-language:testerContextDismissedAt:";
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function safeParseJSON(value: string | null): any | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readTesterContext(anonUserId: string): TesterContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CONTEXT_PREFIX}${anonUserId}`);
    const parsed = safeParseJSON(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.selfReportedLevel || !parsed.goal) return null;
    return parsed as TesterContext;
  } catch {
    return null;
  }
}

export function saveTesterContext(anonUserId: string, ctx: TesterContext): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${CONTEXT_PREFIX}${anonUserId}`, JSON.stringify(ctx));
  } catch {
    // ignore storage failures
  }
}

export function dismissTesterContext(anonUserId: string, whenISO: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${DISMISS_PREFIX}${anonUserId}`, whenISO);
  } catch {
    // ignore storage failures
  }
}

export function shouldShowTesterContext(anonUserId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const existing = readTesterContext(anonUserId);
    if (existing) return false;
    const dismissedAtRaw = localStorage.getItem(`${DISMISS_PREFIX}${anonUserId}`);
    const dismissedAt = dismissedAtRaw ? Date.parse(dismissedAtRaw) : NaN;
    if (!Number.isNaN(dismissedAt)) {
      return Date.now() - dismissedAt > DISMISS_WINDOW_MS;
    }
    return true;
  } catch {
    return true;
  }
}

