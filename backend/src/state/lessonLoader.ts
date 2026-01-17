// src/state/lessonLoader.ts

import fs from "fs"
import path from "path"

export type LessonQuestion = {
    id: number;
    question: string;
    answer: string;
    hint?: string;
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
        const lessonPath = path.join(__dirname, "..","lessons", language, `${lessonId}.json`);
        if(!fs.existsSync(lessonPath)) {
            console.error("Lesson file not found at: ", lessonPath);
            return null;
        }
        
        const lessonData = fs.readFileSync(lessonPath, "utf-8");
        return JSON.parse(lessonData) as Lesson;
    } catch (err) {
        console.error("Failed to load session:", err);
        return null;
    }
}