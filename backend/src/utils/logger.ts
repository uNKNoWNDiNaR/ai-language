// backend/src/utils/logger.ts

export function logServerError(context: string, err: unknown, requestId?: string) {
  const rid =
    typeof requestId === "string" && requestId.trim() ? ` requestId=${requestId.trim()}` : "";
  const name = err instanceof Error && err.name ? ` ${err.name}` : "";
  const msg = err instanceof Error ? err.message : String(err || "unknown error");
  const safeMsg = msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;

  console.error(`[${context}]${rid}${name} ${safeMsg}`.trim());
}
