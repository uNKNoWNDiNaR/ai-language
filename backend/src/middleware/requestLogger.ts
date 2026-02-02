// // backend/src/middleware/requestLogger.ts

// import type { Request, Response, NextFunction } from "express";
// import { getRequestId } from "../http/sendError";

// function safePath(req: Request): string {
//   const raw = req.originalUrl || req.url || req.path || "";
//   return raw.split("?")[0] || "";
// }

// export function requestLogger(req: Request, res: Response, next: NextFunction) {
//   const start = process.hrtime.bigint();

//   res.on("finish", () => {
//     const end = process.hrtime.bigint();
//     const ms = Number(end - start) / 1e6;

//     const entry = {
//       level: "info",
//       msg: "request",
//       requestId: getRequestId(res) || "",
//       method: req.method,
//       path: safePath(req),
//       status: res.statusCode,
//       ms: Math.round(ms * 10) / 10,
//     };

//     // One JSON line per request (no PII).
//     console.log(JSON.stringify(entry));
//   });

//   next();
// }
