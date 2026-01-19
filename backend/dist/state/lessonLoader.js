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
        return JSON.parse(lessonData);
    }
    catch (err) {
        console.error("[lessonLoader] Failed to load session:", err);
        return null;
    }
};
exports.loadLesson = loadLesson;
