// src/api/lessonAPI.ts

import axios from "axios";

const BASE_URL = "https://ai-language-tutor-2ff9.onrender.com";


  export type BackendMessage = {
    role: "user" | "assistant";
    content: string;
};


export type EvaluationResult = "correct" | "almost" | "wrong";

export type Evaluation = {
    result: EvaluationResult;
    reasonCode: string;  // e.g ARTICLE, WORD_ORDER, etc
};

export type Hint = {
    level: number; //2 => light, 3+ => strong
    text: string;
}

export type ProgressStatus = "Completed" | "in_progress" | "needs_review";

export type Progress = {
    current: number; //1-based question number 
    total: number;
    status: ProgressStatus;
};
export interface LessonSession {
    userId: string;
    lessonId: string;
    language?: string;
    state: string;
    attempts: number;
    maxAttempts: number;
    currentQuestionIndex: number;
    messages: BackendMessage[]
}

export interface StartLessonResponse {
    session: LessonSession;
    tutorMessage: string;
    progress?: Progress;
}


export interface SubmitAnswerResponse {
    session: LessonSession;
    tutorMessage: string;
    evaluation?: Evaluation;
    hint?: Hint;
    progress?: Progress;
}

export async function startLesson(
    userId: string,
    language: string,
    lessonId: string,
    options?:{ restart?: boolean}
): Promise<StartLessonResponse> {
    const res = await axios.post(`${BASE_URL}/lesson/start`, {
        userId,
        language,
        lessonId,
        ...(options?.restart ? {restart: true} : {}),
});
    return res.data;
}

export async function submitAnswer(
    userId:string, 
    language:string, 
    lessonId:string, 
    answer:string
): Promise<SubmitAnswerResponse> {
    const res = await axios.post(`${BASE_URL}/lesson/submit`, {
        userId, 
        language,
        lessonId,
        answer});
    return res.data;
}

export type BackendSession = {
    userId: string;
    lessonId?: string;
    language?: string;
    state?: string;
    attempts?: number;
    maxAttempts?: number;
    currentQuestionIndex?: number;
    messages: BackendMessage[];
};

export const getSession = async (userId:string): Promise<BackendSession | null> => {
        const res = await axios.get(`${BASE_URL}/lesson/${userId}`);
        return res.data.session ?? null;
}


//https://ai-language-tutor-2ff9.onrender.com/