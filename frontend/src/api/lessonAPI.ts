// frontend/src/api/lessonAPI.ts

import axios from "axios";

type ErrorPayload = {
  error?: unknown;
  code?: unknown;
  requestId?: unknown;
};

export function getHttpStatus(e: unknown): number | undefined {
  if (!axios.isAxiosError(e)) return undefined;
  return e.response?.status;
}

export type SupportedLanguage = "en" | "de" | "es" | "fr";

export type TeachingPace = "slow" | "normal";
export type ExplanationDepth = "short" | "normal" | "detailed";

export type TeachingPrefs = {
  pace: TeachingPace;
  explanationDepth: ExplanationDepth;
};


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

export type FeedbackRequest = {
  userId: string;
  anonSessionId: string;
  feltRushed?:boolean;
  helpedUnderstand?: number; // 1..5
  confusedText?: string;

  //Optional fallback context if session is gone
  lessonId?: string;
  language?: SupportedLanguage;
  conceptTag?: string;
};

export type FeedbackResponse = {ok: true}


export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

const AUTH_TOKEN: string| undefined = import.meta.env.VITE_AUTH_TOKEN

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: AUTH_TOKEN ? {Authorization: `Bearer ${AUTH_TOKEN}`} : undefined,
})

function asErrorPayload(v: unknown): ErrorPayload | null {
  if(v && typeof v === "object") return v as ErrorPayload;
  return null;
}
export async function startLesson(params: {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  restart?: boolean;
  teachingPrefs?: TeachingPrefs;
}): Promise<StartLessonResponse> {
  const { data } = await http.post<StartLessonResponse>("/lesson/start", params);
  return data;
}

export async function submitAnswer(params: {
  userId: string;
  answer: string;
  language?: SupportedLanguage;
  lessonId?: string;
  teachingPrefs?: TeachingPrefs; 
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

export async function submitFeedback(params:FeedbackRequest): Promise<FeedbackResponse> {
  const { data } = await http.post<FeedbackResponse>("/feedback", params);
  return data;
}

export function toUserSafeErrorMessage(e: unknown): string {
  // If not an axios error then fallback
  if(!axios.isAxiosError(e)) {
    return "Something went wrong please try again";
  }
  
  const status = e?.response?.status;
  const payload = asErrorPayload(e.response?.data);

  const requestId = 
    typeof payload?.requestId === "string" ? payload.requestId : undefined;

  const serverMsg = 
    typeof payload?.error === "string" ? payload.error : undefined;

  // Network / timeout (no response)
  if (!e.response) {
    const isTimeout = e.code === "ECONNABORTED";
    const msg = isTimeout
      ? "The server took too long to respond. Please try again."
      : "Couldn’t reach the server. Check your connection and try again.";
    return requestId ? `${msg} (Request ID: ${requestId})` : msg;
  }

  if (status === 401) {
    const msg = "This server requires an auth token. Please check your configuration and try again.";
    return requestId ? `${msg} (Request ID: ${requestId})` : msg;
  }

  if (status === 429) {
    const msg = "You’re sending requests too quickly. Take a short pause, then try again.";
    return requestId ? `${msg} (Request ID: ${requestId})` : msg;
  }

  if (typeof status === "number" && status >= 500) {
    const msg = "Something went wrong on the server. Please try again.";
    return requestId ? `${msg} (Request ID: ${requestId})` : msg;
  }

  const msg = serverMsg ?? "Request failed. Please try again.";
  return requestId ? `${msg} (Request ID: ${requestId})` : msg;
}
