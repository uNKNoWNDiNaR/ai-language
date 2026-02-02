//backend/src/middleware/requestContext.ts

import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";

function normalizeIncomingRequestId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return t;
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = normalizeIncomingRequestId(req.get("x-request-id"));
  const requestId = incoming ?? crypto.randomUUID();

  res.locals.requestId = requestId;

  try {
    res.setHeader("x-request-id", requestId);
  } catch {
    // ignore
  }

  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const latencyMs = Number(end - start) / 1_000_000;

    // Prefer route template (avoids logging IDs)
    const path = (req.baseUrl || "") + (req.route?.path ? String(req.route.path) : req.path);

    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        latencyMs: Math.round(latencyMs * 10) / 10,
      })
    );
  });

  next();
}
