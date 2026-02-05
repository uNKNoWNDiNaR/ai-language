// backend/src/middleware/requestContext.ts

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

function isValidRequestId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return /^[a-zA-Z0-9_-]{3,64}$/.test(s);
}

function readHeader(req: Request, name: string): string | undefined {
  const r: any = req as any;

  // Express provides req.get(name) and req.header(name)
  if (typeof r.get === "function") {
    const v = r.get(name);
    if (typeof v === "string") return v;
  }
  if (typeof r.header === "function") {
    const v = r.header(name);
    if (typeof v === "string") return v;
  }

  // Unit-test mocks often only provide req.headers
  const raw = (req.headers as any)?.[name] ?? (req.headers as any)?.[name.toLowerCase()];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = readHeader(req, "x-request-id");
  const requestId = isValidRequestId(incoming) ? incoming : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  next();
}

// Optional alias (safe)
export const requestContext = requestContextMiddleware;

export default requestContextMiddleware;
