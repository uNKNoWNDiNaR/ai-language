"use strict";
// src/state/lessonLoader.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLesson = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Load a lesson JSON file by language and lessonId
 */
const loadLesson = (language, lessonId) => {
    try {
        //Normalise to pevent case issues
        const lang = (language || "").trim().toLowerCase();
        const id = (lessonId || "").trim();
        const candidatePaths = [
            //prefered: build assets copied into dist/lessons
            path_1.default.join(process.cwd(), "dist", "lessons", lang, `${id}.json`),
            //Fallback: source lessons incase dist copy fails on deploy
            path_1.default.join(process.cwd(), "src", "lessons", lang, `${id}.json`),
        ];
        const lessonPath = candidatePaths.find((p) => fs_1.default.existsSync(p));
        if (!lessonPath) {
            console.error("[lessonLoader] Lesson file not found. Tried:", candidatePaths);
            return null;
        }
        const lessonData = fs_1.default.readFileSync(lessonPath, "utf-8");
        const raw = JSON.parse(lessonData);
        // Sanitize acceptedAnswers to string[]
        if (raw && Array.isArray(raw.questions)) {
            raw.questions = raw.questions.map((q) => {
                const aaRaw = q?.acceptedAnswers;
                const acceptedAnswers = Array.isArray(aaRaw)
                    ? aaRaw
                        .filter((x) => typeof x === "string" && x.trim().length > 0)
                        .map((s) => s.trim())
                    : undefined;
                const explanationRaw = q?.explanation;
                const explanation = typeof explanationRaw === "string" && explanationRaw.trim.length > 0
                    ? explanationRaw.trim()
                    : undefined;
                const conceptTagRaw = q?.conceptTag;
                const conceptTag = typeof conceptTagRaw === "string" && conceptTagRaw.trim().length > 0
                    ? conceptTagRaw
                        .trim()
                        .toLowerCase()
                        .replace(/[.$]/g, "_")
                        .replace(/\s+/g, "_")
                        .slice(0, 48)
                    : undefined;
                const out = { ...q };
                if (acceptedAnswers && acceptedAnswers.length > 0)
                    out.acceptedAnswers = acceptedAnswers;
                else
                    out.acceptedAnswers = undefined;
                out.conceptTag = conceptTag;
                out.explanation = explanation;
                return out;
            });
        }
        return raw;
    }
    catch (err) {
        console.error("[lessonLoader] Failed to load session:", err);
        return null;
    }
};
exports.loadLesson = loadLesson;
