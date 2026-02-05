"use strict";
// backend/src/utils/logger.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.logServerError = logServerError;
function logServerError(context, err, requestId) {
    const rid = typeof requestId === "string" && requestId.trim() ? ` requestId=${requestId.trim()}` : "";
    const name = err instanceof Error && err.name ? ` ${err.name}` : "";
    const msg = err instanceof Error ? err.message : String(err || "unknown error");
    const safeMsg = msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
    console.error(`[${context}]${rid}${name} ${safeMsg}`.trim());
}
