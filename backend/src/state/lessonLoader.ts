// src/state/lessonLoader.ts

import fs from "fs"
import path from "path"

export type LessonQuestion = {
    id: number;
    question: string;
    prompt?: string;
    answer: string;
    acceptedAnswers?: string[];
    expectedInput?: "sentence" | "blank";
    blankAnswers?: string[];
    taskType?: "typing" | "speaking";
    promptStyle?: "BLANK_AUX" | "TRANSFORM_SUBJECT" | "MAKE_QUESTION" | "REPLY_SHORT" | "WORD_BANK" | "SITUATION_CUE";
    explanation?: string;
    explanationTarget?: string;
    explanationSupport?: string;
    conceptTag?: string; 
    helpKey?: string;
    hint?: string;
    hints?: string[];
    hintTarget?: string;
    hintSupport?: string;
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
        
        const raw = JSON.parse(lessonData) as any;

        // Sanitize acceptedAnswers to string[]
        if (raw && Array.isArray(raw.questions)) {
            raw.questions = raw.questions.map((q: any) => {
                const aaRaw = q?.acceptedAnswers;
                const promptRaw = q?.prompt;
                const prompt =
                    typeof promptRaw === "string" && promptRaw.trim().length > 0
                        ? promptRaw.trim()
                        : "";
                const acceptedAnswers = Array.isArray(aaRaw)
                    ? aaRaw
                        .filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
                        .map((s: string) => s.trim())
                    : undefined;

                const explanationRaw = q?.explanation;
                const explanation =
                    typeof explanationRaw === "string" && explanationRaw.trim.length>0 
                        ? explanationRaw.trim()
                        : undefined
                
                const conceptTagRaw = q?.conceptTag;
                const conceptTag = 
                    typeof conceptTagRaw === "string" && conceptTagRaw.trim().length > 0
                        ? conceptTagRaw 
                            .trim()
                            .toLowerCase()
                            .replace(/[.$]/g,"_")
                            .replace(/\s+/g, "_")
                            .slice(0, 48)
                        : undefined;
                
                const taskTypeRaw =
                    typeof q?.taskType === "string" ? q.taskType.trim().toLowerCase() : "";
                const inferredSpeaking = /\b(say|ask|reply)\s*:/i.test(prompt);
                const taskType =
                    taskTypeRaw === "speaking"
                        ? "speaking"
                        : taskTypeRaw === "typing"
                            ? "typing"
                            : inferredSpeaking
                                ? "speaking"
                                : "typing";

                const expectedInputRaw =
                    typeof q?.expectedInput === "string" ? q.expectedInput.trim().toLowerCase() : "";
                const expectedInput =
                    expectedInputRaw === "blank" || expectedInputRaw === "sentence"
                        ? (expectedInputRaw as "blank" | "sentence")
                        : undefined;

                const blankAnswersRaw = Array.isArray(q?.blankAnswers) ? q.blankAnswers : [];
                const blankAnswers = blankAnswersRaw
                    .filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
                    .map((s: string) => s.trim());

                const out: any = {...q};
                if (prompt) {
                    out.prompt = prompt;
                    out.question = prompt;
                }
                if(acceptedAnswers && acceptedAnswers.length>0)out.acceptedAnswers = acceptedAnswers;
                else out.acceptedAnswers = undefined;

                out.conceptTag = conceptTag;
                out.explanation = explanation;
                out.taskType = taskType;
                if (expectedInput) out.expectedInput = expectedInput;
                else out.expectedInput = undefined;
                if (blankAnswers.length > 0) out.blankAnswers = blankAnswers;
                else out.blankAnswers = undefined;

                return out;
            });
        }

        return raw as Lesson;

    } catch (err) {
        console.error("[lessonLoader] Failed to load session:", err);
        return null;
    }
}
