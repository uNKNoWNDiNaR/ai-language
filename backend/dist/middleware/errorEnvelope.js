"use strict";
//backend/src/middleware/errorEnvelope.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorEnvelopeMiddleware = errorEnvelopeMiddleware;
function errorEnvelopeMiddleware(_req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        if (body && typeof body === "object" && typeof body.error === "string") {
            if (typeof body.requestId !== "string") {
                const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
                if (requestId)
                    body = { ...body, requestId };
            }
        }
        return originalJson(body);
    });
    next();
}
