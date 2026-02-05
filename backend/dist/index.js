"use strict";
// backend/src/index.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const lesson_1 = __importDefault(require("./routes/lesson"));
const progress_1 = __importDefault(require("./routes/progress"));
const practice_1 = __importDefault(require("./routes/practice"));
const feedback_1 = __importDefault(require("./routes/feedback"));
const review_1 = __importDefault(require("./routes/review"));
const auth_1 = require("./middleware/auth");
const requestContext_1 = require("./middleware/requestContext");
const errorEnvelope_1 = require("./middleware/errorEnvelope");
const rateLimit_1 = require("./middleware/rateLimit");
// Keep body limit without adding complexity.
// (If you already created jsonSizeLimit.ts, you can swap this back later.)
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(requestContext_1.requestContextMiddleware);
app.use(rateLimit_1.rateLimitMiddleware);
// Apply JSON parsing with a sane size limit.
// This replaces the broken jsonSizeLimit usage + avoids double-parsing.
app.use(express_1.default.json({ limit: process.env.JSON_BODY_LIMIT || "64kb" }));
app.use(auth_1.authMiddleware);
app.use("/lesson", lesson_1.default);
app.use("/progress", progress_1.default);
app.use("/practice", practice_1.default);
app.use("/feedback", feedback_1.default);
app.use("/review", review_1.default);
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.use(errorEnvelope_1.errorEnvelopeMiddleware);
const PORT = Number(process.env.PORT || 3000);
// Backward-compatible env support (keeps old working setups)
const MONGO_URL = process.env.MONGO_URL || process.env.MONGO_URI || process.env.MONGODB_URI || "";
mongoose_1.default
    .connect(MONGO_URL)
    .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})
    .catch((error) => console.error("MongoDB connection error:", error));
