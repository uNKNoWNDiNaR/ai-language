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
  instructionLanguage?: SupportedLanguage;
  supportLevel?: number;
  supportMode?: "auto" | "manual";
};

export type LessonTaskType = "typing" | "speaking";

export type LessonQuestionMeta = {
  id?: string | number;
  prompt: string;
  taskType?: LessonTaskType;
  expectedInput?: "sentence" | "blank";
};

export type TutorRole = "user" | "assistant";

export type ChatMessage = {
  role: TutorRole;
  content: string;
  primaryText?: string;
  supportText?: string;
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

export type LessonCatalogItem = {
  lessonId: string;
  title: string;
  description: string;
  totalQuestions: number;
};

export type LessonCatalogResponse = {
  lessons: LessonCatalogItem[];
};

export type ProgressDoc = {
  userId: string;
  language: string;
  lessonId: string;
  status: string;
  lastActiveAt?: string;
};

export type StartLessonResponse = {
  session: LessonSession;
  tutorMessage?: string;
  progress?: LessonProgressPayload;
  question?: LessonQuestionMeta;
};

export type SubmitAnswerResponse = {
  session: LessonSession;
  tutorMessage: string;
  evaluation: EvaluationPayload;
  hint?: HintPayload;
  practice?: PracticePayload;
  progress?: LessonProgressPayload;
  question?: LessonQuestionMeta;
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
    question?: LessonQuestionMeta;
};

export type FeedbackRequest = {
  userId: string;
  anonSessionId: string;
  feltRushed?: boolean;
  helpedUnderstand?: number; // 1..5
  confusedText?: string;
  improveText?: string;

  screen?: "home" | "lesson" | "review" | "other";
  intent?: "start" | "continue" | "review" | "change_settings" | "exploring";
  crowdedRating?: "not_at_all" | "a_little" | "yes_a_lot";
  feltBest?: Array<"continue_card" | "units" | "optional_review" | "calm_tone" | "other">;

  // Optional fallback context if session is gone
  lessonId?: string;
  language?: SupportedLanguage;
  conceptTag?: string;
  targetLanguage?: SupportedLanguage;
  instructionLanguage?: SupportedLanguage;
  sessionKey?: string;
  currentQuestionIndex?: number;
  appVersion?: string;
  timestamp?: string;
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
  const { data } = await http.get<GetSessionResponse>(`/lesson/${encodeURIComponent(userId)}`);
  return data;
}

export async function getLessonCatalog(
  language: SupportedLanguage
): Promise<LessonCatalogResponse> {
  const { data } = await http.get<LessonCatalogResponse>("/lesson/catalog", {
    params: { language },
  });
  return data;
}

export async function getUserProgress(
  userId: string,
  language: SupportedLanguage
): Promise<{ progress: ProgressDoc[] }> {
  const { data } = await http.get<{ progress: ProgressDoc[] }>(
    `/progress/${encodeURIComponent(userId)}`,
    { params: { language } }
  );
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

export type ReviewSummary = {
  lessonId?: string;
  completedAt?: string;
  didWell?: string;
  focusNext?: string[];
};

export type SuggestedReviewItem = {
  id: string;
  lessonId: string;
  conceptTag: string;
  prompt: string;
  expected?: string;
  createdAt?: string;
  dueAt?: string;
  attempts: number;
  lastResult?: EvaluationResult;
};

export type SuggestedReviewResponse = {
  summary: ReviewSummary | null;
  items: SuggestedReviewItem[];
};

export type ReviewCandidateItem = {
  lessonId: string;
  questionId: string;
  conceptTag?: string;
  confidence?: number;
  reason?: string;
  lastSeenAt?: string;
  mistakeCount?: number;
};

export type ReviewCandidatesResponse = {
  items: ReviewCandidateItem[];
  message?: string;
};

export async function getSuggestedReview(params: {
  userId: string;
  language: SupportedLanguage;
  maxItems?: number;
  limit?: number;
}): Promise<SuggestedReviewResponse> {
  const maxItems = params.maxItems ?? params.limit;
  const { data } = await http.get<SuggestedReviewResponse>("/review/suggested", {
    params: {
      userId: params.userId,
      language: params.language,
      ...(typeof maxItems === "number" ? { maxItems } : {}),
    },
  });
  return data;
}

export async function getReviewCandidates(params: {
  userId: string;
  language: SupportedLanguage;
  maxItems?: number;
  limit?: number;
}): Promise<ReviewCandidatesResponse> {
  const maxItems = params.maxItems ?? params.limit;
  const { data } = await http.post<ReviewCandidatesResponse>("/review/suggest", {
    userId: params.userId,
    language: params.language,
    ...(typeof maxItems === "number" ? { maxItems } : {}),
  });
  return data;
}

export type GenerateReviewQueueResponse = {
  added: number;
};

export async function generateReviewQueue(params: {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
}): Promise<GenerateReviewQueueResponse> {
  const { data } = await http.post<GenerateReviewQueueResponse>("/review/generate", params);
  return data;
}

export type SubmitReviewResponse = {
  result: EvaluationResult;
  tutorMessage: string;
  nextItem: SuggestedReviewItem | null;
  remaining: number;
};

export async function submitReview(params: {
  userId: string;
  language: SupportedLanguage;
  itemId: string;
  answer: string;
}): Promise<SubmitReviewResponse> {
  const { data } = await http.post<SubmitReviewResponse>("/review/submit", params);
  return data;
}

export type GeneratePracticeResponse = {
  practiceItem: {
    practiceId: string;
    prompt: string;
  };
  source?: {
    questionId?: string;
    conceptTag?: string;
    reason?: string;
  };
};

export async function generatePractice(params: {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  questionId?: string;
  conceptTag?: string;
  type?: "variation";
}): Promise<GeneratePracticeResponse> {
  const { data } = await http.post<GeneratePracticeResponse>("/practice/generate", params);
  return data;
}

export type GenerateReviewPracticeResponse = {
  practice: Array<{
    practiceId: string;
    prompt: string;
    lessonId: string;
    questionId: string;
    conceptTag: string;
  }>;
};

export async function generateReviewPractice(params: {
  userId: string;
  language: SupportedLanguage;
  items: Array<{ lessonId: string; questionId: string }>;
}): Promise<GenerateReviewPracticeResponse> {
  const { data } = await http.post<GenerateReviewPracticeResponse>("/practice/generateReview", params);
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
