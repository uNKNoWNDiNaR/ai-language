const ANON_ID_KEY = "ai-language:anonUserId";

function generateAnonId() {
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
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const created = generateAnonId();
    localStorage.setItem(ANON_ID_KEY, created);
    return created;
  } catch {
    return generateAnonId();
  }
}

