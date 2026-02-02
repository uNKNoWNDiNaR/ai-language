//backend/src/middleware/errorEnvelope.ts

import type { NextFunction, Request, Response } from "express";

export function errorEnvelopeMiddleware(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    if (body && typeof body === "object" && typeof body.error === "string") {
      if (typeof body.requestId !== "string") {
        const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
        if (requestId) body = { ...body, requestId };
      }
    }
    return originalJson(body);
  }) as any;

  next();
}
