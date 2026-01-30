// src/ai/tutorIntent.ts

export type TutorIntent = // AI behaviour only
  | "ASK_QUESTION"
  | "ENCOURAGE_RETRY"
  | "ADVANCE_LESSON"
  | "FORCED_ADVANCE"
  | "END_LESSON"
  | "EXPLAIN_PRACTICE_RESULT";
