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
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: "*",
    methods: ["GET", "POST"],
}));
(0, mongo_1.connectMongo)();
app.use("/lesson", lesson_1.default);
app.use("/progress", progress_1.default);
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
