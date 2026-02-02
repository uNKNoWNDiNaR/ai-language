"use strict";
// backend/src/http/sendError.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = sendError;
function sendError(res, status, message, code) {
    const requestId = typeof res.locals?.requestId === "string" ? res.locals.requestId : undefined;
    return res.status(status).json({
        error: message,
        ...(code ? { code } : {}),
        ...(requestId ? { requestId } : {}),
    });
}
