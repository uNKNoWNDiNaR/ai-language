const ANON_USER_ID_KEY = "ai-language:anonUserId";
const DISPLAY_NAME_KEY = "ai-language:displayName";

function generateAnonUserId(): string {
  if (typeof globalThis !== "undefined") {
    const maybeCrypto = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    if (maybeCrypto?.randomUUID) {
      return maybeCrypto.randomUUID();
    }
  }
  return `anon_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function getAnonUserId(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const existing = localStorage.getItem(ANON_USER_ID_KEY);
    if (existing) return existing;
    const created = generateAnonUserId();
    localStorage.setItem(ANON_USER_ID_KEY, created);
    return created;
  } catch {
    return generateAnonUserId();
  }
}

export function getDisplayName(): string {
  if (typeof window === "undefined") return "Guest";
  try {
    const stored = localStorage.getItem(DISPLAY_NAME_KEY)?.trim();
    return stored || "Guest";
  } catch {
    return "Guest";
  }
}
