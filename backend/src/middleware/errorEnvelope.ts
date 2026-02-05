// backend/src/middleware/errorEnvelope.ts

import type { Request, Response, NextFunction } from "express";

function isErrorPayload(body: unknown): body is { error: unknown } {
  return !!body && typeof body === "object" && "error" in (body as any);
}

export function errorEnvelopeMiddleware(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    if (isErrorPayload(body)) {
      const requestId = res.locals?.requestId;
      if (typeof requestId === "string" && requestId.trim()) {
        return originalJson({ ...body, requestId });
      }
    }
    return originalJson(body);
  }) as any;

  next();
}

// Optional alias (safe, doesn’t break tests)
export const errorEnvelope = errorEnvelopeMiddleware;

export default errorEnvelopeMiddleware;
