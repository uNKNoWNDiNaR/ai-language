"use strict";
//backend/src/middleware/auth.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
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
    // Allow CORS preflight requests through (browser sends OPTIONS before POST)
    if (req.method === "OPTIONS")
        return next();
    const expected = process.env.AUTH_TOKEN?.trim();
    // Dev/ local/ CI safe default: no token configured - no auth required.
    if (!expected)
        return next();
    const bearer = extractBearerToken(req.get("authorization"));
    const xToken = (req.get("x-auth-token") ?? "").trim();
    const provided = bearer ?? (xToken.length > 0 ? xToken : null);
    if (!provided || provided !== expected) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
}
