"use strict";
// backend/src/middleware/jsonSizeLimit.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonSizeLimit = void 0;
const express_1 = __importDefault(require("express"));
const DEFAULT_LIMIT = "1mb";
function readLimit() {
    const raw = process.env.JSON_BODY_LIMIT;
    const t = typeof raw === "string" ? raw.trim() : "";
    return t || DEFAULT_LIMIT;
}
exports.jsonSizeLimit = express_1.default.json({ limit: readLimit() });
