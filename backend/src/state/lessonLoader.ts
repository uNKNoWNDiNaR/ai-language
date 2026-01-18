// src/state/lessonLoader.ts

import fs from "fs"
import path from "path"

export type LessonQuestion = {
    id: number;
    question: string;
    answer: string;
    hint?: string;
    hints?: string[];
    examples?: string[];
};

export type Lesson = {
    lessonId: string;
    title: string;
    description: string;
    questions: LessonQuestion[];
};

/**
 * Load a lesson JSON file by language and lessonId
 */
export const loadLesson = (language: string, lessonId: string): Lesson | null => {
    try{

        //Normalise to pevent case issues
        const lang = (language || "").trim().toLowerCase();

        const candidatePaths = [
            path.join(__dirname, "..", "lessons", lang, `${lessonId}.json`),
            path.join(process.cwd(), "src", "lessons", lang, `${lessonId}.json`),
        ];

        const lessonPath = candidatePaths.find(p => fs.existsSync(p));
        if(!lessonPath) {
            console.error("Lesson file not found. Tried", candidatePaths);
            return null;
        }

        const lessonData = fs.readFileSync(lessonPath, "utf-8");
        return JSON.parse(lessonData) as Lesson;
    } catch (err) {
        console.error("Failed to load session:", err);
        return null;
    }
}