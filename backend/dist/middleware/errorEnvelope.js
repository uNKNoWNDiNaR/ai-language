"use strict";
// backend/src/middleware/errorEnvelope.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorEnvelope = void 0;
exports.errorEnvelopeMiddleware = errorEnvelopeMiddleware;
function isErrorPayload(body) {
    return !!body && typeof body === "object" && "error" in body;
}
function errorEnvelopeMiddleware(_req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        if (isErrorPayload(body)) {
            const requestId = res.locals?.requestId;
            if (typeof requestId === "string" && requestId.trim()) {
                return originalJson({ ...body, requestId });
            }
        }
        return originalJson(body);
    });
    next();
}
// Optional alias (safe, doesn’t break tests)
exports.errorEnvelope = errorEnvelopeMiddleware;
exports.default = errorEnvelopeMiddleware;
