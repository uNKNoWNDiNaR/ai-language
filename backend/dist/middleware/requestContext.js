"use strict";
//backend/src/middleware/requestContext.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContextMiddleware = requestContextMiddleware;
const node_crypto_1 = __importDefault(require("node:crypto"));
function normalizeIncomingRequestId(v) {
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    if (!t || t.length > 64)
        return null;
    if (!/^[A-Za-z0-9_-]+$/.test(t))
        return null;
    return t;
}
function requestContextMiddleware(req, res, next) {
    const incoming = normalizeIncomingRequestId(req.get("x-request-id"));
    const requestId = incoming ?? node_crypto_1.default.randomUUID();
    res.locals.requestId = requestId;
    try {
        res.setHeader("x-request-id", requestId);
    }
    catch {
        // ignore
    }
    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const end = process.hrtime.bigint();
        const latencyMs = Number(end - start) / 1000000;
        // Prefer route template (avoids logging IDs)
        const path = (req.baseUrl || "") + (req.route?.path ? String(req.route.path) : req.path);
        console.log(JSON.stringify({
            level: "info",
            msg: "request",
            requestId,
            method: req.method,
            path,
            status: res.statusCode,
            latencyMs: Math.round(latencyMs * 10) / 10,
        }));
    });
    next();
}
