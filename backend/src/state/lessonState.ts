//src/state/LessonState.ts

import { TutorIntent } from "../ai/tutorIntent";

export type LessonState =   // backend control only
    | "USER_INPUT" 
    | "ADVANCE"
    | "COMPLETE";

  export type BackendMessage = {
    role: "user" | "assistant";
    content: string;
};

export type LessonSession = {
    userId: string;
    lessonId: string;
    state: string;
    tutorIntent?: TutorIntent;
    attempts: number;
    maxAttempts: number; 
    currentQuestionIndex: number;  
    messages: BackendMessage[];
    language: string;
};
export type BackendSession = {
    userId: string;
    lessonId: string;
    state: string;
    tutorIntent?: TutorIntent;
    attempts: number;
    maxAttempts: number; 
    currentQuestionIndex: number;  
    messages: BackendMessage[];
};

