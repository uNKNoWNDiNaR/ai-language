"use strict";
// backend/src/middleware/rateLimit.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = void 0;
exports.rateLimitMiddleware = rateLimitMiddleware;
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 120);
// in-memory, per-process (good enough for MVP)
const buckets = new Map();
function keyFor(req) {
    // best-effort client key; avoid PII logging
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";
    return ip;
}
function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = keyFor(req);
    const existing = buckets.get(key);
    if (!existing || existing.resetAtMs <= now) {
        buckets.set(key, { count: 1, resetAtMs: now + WINDOW_MS });
        return next();
    }
    existing.count += 1;
    if (existing.count > MAX_REQUESTS) {
        return res.status(429).json({ error: "Too many requests" });
    }
    return next();
}
// Optional alias (safe, doesn’t break tests)
exports.rateLimit = rateLimitMiddleware;
exports.default = rateLimitMiddleware;
