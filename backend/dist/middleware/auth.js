"use strict";
//backend/src/middleware/auth.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const sendError_1 = require("../http/sendError");
function extractBearerToken(rawAuth) {
    if (!rawAuth)
        return null;
    const m = rawAuth.match(/^Bearer\s+(.+)$/i);
    if (!m)
        return null;
    const token = m[1]?.trim();
    return token ? token : null;
}
/**
 * Minimal Auth: if AUTH_TOKEN is set on the server, require it.
 * if AUTH_TOKEN is not set, allow all requests(dev-fiendly / non-breaking)
 */
function authMiddleware(req, res, next) {
    if (req.method === "OPTIONS")
        return next();
    const expected = process.env.AUTH_TOKEN?.trim();
    if (!expected)
        return next();
    const bearer = extractBearerToken(req.get("authorization"));
    const xToken = (req.get("x-auth-token") ?? "").trim();
    const provided = bearer ?? (xToken.length > 0 ? xToken : null);
    if (!provided || provided !== expected) {
        return (0, sendError_1.sendError)(res, 401, "Unauthorized", "UNAUTHORIZED");
    }
    return next();
}
