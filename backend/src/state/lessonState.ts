//src/state/LessonSatet.ts

import { TutorIntent } from "../ai/tutorIntent";

export type LessonState =   // backend control only
    | "USER_INPUT" 
    | "ADVANCE"
    | "COMPLETE";


export type LessonSession = {
    userId: string;
    lessonId: string;
    state: LessonState;
    tutorIntent?: TutorIntent;
    attempts: number;
    maxAttempts: number; 
    currentQuestionIndex?: number;  // tracks the current question number 
};

