// src/state/lessonLoader.ts

import fs from "fs"
import path from "path"
import type { LessonSession } from "./lessonState"; 

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
        const id = (lessonId || "").trim();

        const candidatePaths = [

            //prefered: build assets copied into dist/lessons
            path.join(process.cwd(), "dist", "lessons", lang, `${id}.json`),
            //Fallback: source lessons incase dist copy fails on deploy

            path.join(process.cwd(), "src", "lessons", lang, `${id}.json`),
        ];

        const lessonPath = candidatePaths.find((p) => fs.existsSync(p));
        if(!lessonPath) {
            console.error("[lessonLoader] Lesson file not found. Tried:", candidatePaths);
            return null;
        }

        const lessonData = fs.readFileSync(lessonPath, "utf-8");
        return JSON.parse(lessonData) as Lesson;
    } catch (err) {
        console.error("[lessonLoader] Failed to load session:", err);
        return null;
    }
}