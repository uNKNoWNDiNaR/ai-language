"use strict";
// backend/src/controllers/lessonCatalogController.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLessonCatalog = getLessonCatalog;
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const sendError_1 = require("../http/sendError");
function isSupportedLanguage(v) {
    return v === "en" || v === "de" || v === "es" || v === "fr";
}
function getLessonsDir(language) {
    const lang = (language || "").trim().toLowerCase();
    const moduleRelative = path_1.default.resolve(__dirname, "..", "lessons", lang);
    const candidates = [
        moduleRelative,
        path_1.default.join(process.cwd(), "dist", "lessons", lang),
        path_1.default.join(process.cwd(), "src", "lessons", lang),
        path_1.default.join(process.cwd(), "backend", "dist", "lessons", lang),
        path_1.default.join(process.cwd(), "backend", "src", "lessons", lang),
    ];
    for (const dir of candidates) {
        if (fs.existsSync(dir))
            return dir;
    }
    return null;
}
function parseLessonIdSortKey(lessonId) {
    const match = lessonId.match(/^(.*?)-(\d+)$/);
    if (!match)
        return null;
    const prefix = match[1].trim();
    const num = Number(match[2]);
    if (!prefix || !Number.isFinite(num))
        return null;
    return { prefix, num };
}
async function getLessonCatalog(req, res) {
    const language = typeof req.query.language === "string" ? req.query.language.trim() : "";
    if (!isSupportedLanguage(language)) {
        return (0, sendError_1.sendError)(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    }
    const lessonsDir = getLessonsDir(language);
    if (!lessonsDir) {
        return res.status(200).json({ lessons: [] });
    }
    let files = [];
    try {
        files = fs.readdirSync(lessonsDir).filter((f) => f.toLowerCase().endsWith(".json"));
    }
    catch (err) {
        return (0, sendError_1.sendError)(res, 500, "Failed to read lesson catalog", "SERVER_ERROR");
    }
    const lessons = [];
    for (const file of files) {
        const fullPath = path_1.default.join(lessonsDir, file);
        try {
            const raw = fs.readFileSync(fullPath, "utf-8");
            const data = JSON.parse(raw);
            const lessonId = typeof data?.lessonId === "string" && data.lessonId.trim()
                ? data.lessonId.trim()
                : path_1.default.basename(file, path_1.default.extname(file));
            const title = typeof data?.title === "string" ? data.title : "";
            const description = typeof data?.description === "string" ? data.description : "";
            const totalQuestions = Array.isArray(data?.questions) ? data.questions.length : 0;
            lessons.push({ lessonId, title, description, totalQuestions });
        }
        catch (err) {
            return (0, sendError_1.sendError)(res, 500, `Invalid lesson JSON: ${file}`, "SERVER_ERROR");
        }
    }
    lessons.sort((a, b) => {
        const ak = parseLessonIdSortKey(a.lessonId);
        const bk = parseLessonIdSortKey(b.lessonId);
        if (ak && bk) {
            const prefixCmp = ak.prefix.localeCompare(bk.prefix);
            if (prefixCmp !== 0)
                return prefixCmp;
            if (ak.num !== bk.num)
                return ak.num - bk.num;
        }
        return a.lessonId.localeCompare(b.lessonId);
    });
    return res.status(200).json({ lessons });
}
