"use strict";
// backend/src/middleware/rateLimit.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
const sendError_1 = require("../http/sendError");
const buckets = new Map();
const WINDOW_MS = 60000;
const MAX = 120;
function keyForReq(req) {
    return String(req.ip || req.socket?.remoteAddress || "unknown");
}
function maybePrune(now) {
    if (buckets.size < 5000)
        return;
    for (const [k, b] of buckets) {
        if (b.resetAt <= now)
            buckets.delete(k);
    }
}
function rateLimitMiddleware(req, res, next) {
    const key = keyForReq(req);
    const now = Date.now();
    maybePrune(now);
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
        res.setHeader("x-rate-limit-limit", String(MAX));
        res.setHeader("x-rate-limit-remaining", String(MAX - 1));
        return next();
    }
    b.count += 1;
    const remaining = Math.max(0, MAX - b.count);
    res.setHeader("x-rate-limit-limit", String(MAX));
    res.setHeader("x-rate-limit-remaining", String(remaining));
    res.setHeader("x-rate-limit-reset", String(Math.ceil((b.resetAt - now) / 1000)));
    if (b.count > MAX) {
        return (0, sendError_1.sendError)(res, 429, "Too many requests. Please slow down and try again.", "RATE_LIMITED");
    }
    return next();
}
