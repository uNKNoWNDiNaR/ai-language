// backend/src/http/sendError.ts

import type { Response } from "express";

export function sendError(
  res: Response,
  status: number,
  message: string,
  code?: string
): Response {
  const requestId = 
    typeof (res as any).locals?.requestId === "string" ? (res as any).locals.requestId : undefined;

  return res.status(status).json({
    error: message,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  });
}
