"use strict";
// src/index.ts
// this is also known as the backend entry file
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("./db/mongo");
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const lesson_1 = __importDefault(require("./routes/lesson"));
const progress_1 = __importDefault(require("./routes/progress"));
const cors_1 = __importDefault(require("cors"));
const practice_1 = __importDefault(require("./routes/practice"));
const feedback_1 = __importDefault(require("./routes/feedback"));
const auth_1 = require("./middleware/auth");
const rateLimit_1 = require("./middleware/rateLimit");
const sendError_1 = require("./http/sendError");
const PORT = process.env.PORT || 3000;
(0, mongo_1.connectMongo)();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: "*",
    methods: ["GET", "POST"],
}));
//body size limit
app.use(express_1.default.json({ limit: "1mb" }));
//basic rate limit (no PII)
app.use(rateLimit_1.rateLimitMiddleware);
// health BEFORE Auth
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use(auth_1.authMiddleware);
app.use("/lesson", lesson_1.default);
app.use("/progress", progress_1.default);
app.use("/practice", practice_1.default);
app.use("/feedback", feedback_1.default);
//404
app.use((_req, res) => (0, sendError_1.sendError)(res, 404, "Not Found", "NOT_FOUND"));
//error handler
app.use((err, _req, res, next) => {
    const requestId = typeof res?.locals?.requestId === "string" ? res.locals.requestId : undefined;
    console.error(JSON.stringify({
        level: "error",
        msg: "unhandled_error",
        requestId,
        error: err instanceof Error ? err.message : String(err),
    }));
    if (res.headersSent)
        return next(err);
    return (0, sendError_1.sendError)(res, 500, "Server error");
});
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
