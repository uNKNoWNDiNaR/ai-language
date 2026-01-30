// frontend/src/api/lessonAPI.ts

import axios from "axios";

export type SupportedLanguage = "en" | "de" | "es" | "fr";
export type TutorRole = "user" | "assistant";

export type ChatMessage = {
  role: TutorRole;
  content: string;
  timestamp?: string;
};

export type LessonSession = {
  userId: string;
  lessonId: string;
  language: SupportedLanguage;
  state: string;
  attempts: number;
  maxAttempts: number;
  currentQuestionIndex: number;
  messages: ChatMessage[];
  createdAt?: string;
  updatedAt?: string;
};

export type EvaluationResult = "correct" | "almost" | "wrong";

export type EvaluationPayload = {
  result: EvaluationResult;
  reasonCode?: string;
};

export type HintPayload = {
  level: number;
  text: string;
};

export type PracticePayload = {
  practiceId: string;
  prompt: string;
};

export type LessonProgressPayload = {
    status: "in_progress" | "needs_review" | "completed";
    currentQuestionIndex: number;
    totalQuestions: number;
};

export type StartLessonResponse = {
  session: LessonSession;
  tutorMessage?: string;
  progress?: LessonProgressPayload;
};

export type SubmitAnswerResponse = {
  session: LessonSession;
  tutorMessage: string;
  evaluation: EvaluationPayload;
  hint?: HintPayload;
  practice?: PracticePayload;
  progress?: LessonProgressPayload;
};

export type SubmitPracticeResponse = {
  result: EvaluationResult;
  reasonCode?: string;
  attemptCount: number;
  tutorMessage: string;
};

export type GetSessionResponse = {
    session: LessonSession;
    tutorMessage?: string;
    progress?: LessonProgressPayload;
};

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
})

export async function startLesson(params: {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  restart?: boolean;
}): Promise<StartLessonResponse> {
  const { data } = await http.post<StartLessonResponse>("/lesson/start", params);
  return data;
}

export async function submitAnswer(params: {
  userId: string;
  answer: string;
  language?: SupportedLanguage;
  lessonId?: string;
}): Promise<SubmitAnswerResponse> {
  const { data } = await http.post<SubmitAnswerResponse>("/lesson/submit", params);
  return data;
}

export async function getSession(userId: string): Promise<GetSessionResponse> {
  const { data } = await http.get<GetSessionResponse>(`/lesson/session/${userId}`);
  return data;
}

export async function submitPractice(params: {
  userId: string;
  practiceId: string;
  answer: string;
}): Promise<SubmitPracticeResponse> {
  const { data } = await http.post<SubmitPracticeResponse>("/practice/submit", params);
  return data;
}

