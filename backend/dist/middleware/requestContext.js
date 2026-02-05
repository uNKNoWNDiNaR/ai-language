"use strict";
// backend/src/middleware/requestContext.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContext = void 0;
exports.requestContextMiddleware = requestContextMiddleware;
const crypto_1 = require("crypto");
function isValidRequestId(v) {
    if (typeof v !== "string")
        return false;
    const s = v.trim();
    if (!s)
        return false;
    return /^[a-zA-Z0-9_-]{3,64}$/.test(s);
}
function readHeader(req, name) {
    const r = req;
    // Express provides req.get(name) and req.header(name)
    if (typeof r.get === "function") {
        const v = r.get(name);
        if (typeof v === "string")
            return v;
    }
    if (typeof r.header === "function") {
        const v = r.header(name);
        if (typeof v === "string")
            return v;
    }
    // Unit-test mocks often only provide req.headers
    const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
    if (typeof raw === "string")
        return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string")
        return raw[0];
    return undefined;
}
function requestContextMiddleware(req, res, next) {
    const incoming = readHeader(req, "x-request-id");
    const requestId = isValidRequestId(incoming) ? incoming : (0, crypto_1.randomUUID)();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
}
// Optional alias (safe)
exports.requestContext = requestContextMiddleware;
exports.default = requestContextMiddleware;
