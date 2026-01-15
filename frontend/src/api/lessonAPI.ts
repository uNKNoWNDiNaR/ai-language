// src/api/lessonAPI.ts

import axios from "axios";

const BASE_URL = "https://ai-language-tutor-2ff9.onrender.com/lesson";

export interface LessonSession {
    userId: string;
    lessonId: string;
    state: string;
    attempts: number;
    maxAttempts: number;
    currentQuestionIndex: number;
}

export interface StartLessonResponse {
    session: LessonSession;
    tutorPrompt: string;
    tutorMessage: string;
}

export interface SubmitAnswerResponse {
    session: LessonSession;
    tutorPrompt: string;
    tutorMessage: string;
}

export async function startLesson(userId: string): Promise<StartLessonResponse> {
    const res = await axios.post(`${BASE_URL}/start`, {userId});
    return res.data;
}

export async function submitAnswer(userId:string, answer:string): Promise<SubmitAnswerResponse> {
    const res = await axios.post(`${BASE_URL}/submit`, {userId, answer});
    return res.data;
}

export async function getSession(userId:string): Promise<LessonSession | null> {
    try{
        const res = await axios.get(`${BASE_URL}/${userId}`);
        return res.data;
    } catch(err) {
        return null;
    }
}