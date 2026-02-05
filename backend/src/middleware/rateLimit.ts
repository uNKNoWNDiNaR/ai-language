// backend/src/middleware/rateLimit.ts

import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAtMs: number };

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 120);

// in-memory, per-process (good enough for MVP)
const buckets = new Map<string, Bucket>();

function keyFor(req: Request): string {
  // best-effort client key; avoid PII logging
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return ip;
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
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
export const rateLimit = rateLimitMiddleware;

export default rateLimitMiddleware;
