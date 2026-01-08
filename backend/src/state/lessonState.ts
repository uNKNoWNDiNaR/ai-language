//src/state/LessonSatet.ts

export type LessonState = 
| "PROMPT" 
| "USER_INPUT" 
| "FEEDBACK" 
| "RETRY" 
| "ADVANCE";

export type LessonSession = {
    userId: string;
    lessonId: string;
    state: LessonState;
    attempts: number;
    maxAttempts: number; //maximum attempts before advancing
};


//In-memory session store (for MVP)
export const sessions: Record<string, LessonSession> = {};