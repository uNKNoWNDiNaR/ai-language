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
const cors_1 = __importDefault(require("cors"));
//this uses theexpress backend
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Mount all lesson related rouutes under /lesson
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)({
    origin: "*", //    Vite frontend
    methods: ["GET", "POST"],
}));
(0, mongo_1.connectMongo)();
app.use("/lesson", lesson_1.default);
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
// http://localhost:5173.  CORS launch site
