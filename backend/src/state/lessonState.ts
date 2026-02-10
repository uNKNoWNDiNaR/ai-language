// src/state/lessonState.ts

import type { PracticeItem } from "../types";

export type LessonState = "USER_INPUT" | "ADVANCE" | "COMPLETE";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
};

// Note: In persistence we store some fields as Mongoose Map types.
// In tests/mocks you may still see plain objects. We allow both shapes here.
export type StringNumberMap = Map<string, number> | Record<string, number>;
export type StringStringMap = Map<string, string> | Record<string, string>;
export type PracticeItemMap = Map<string, PracticeItem> | Record<string, PracticeItem>;
export type PracticeAttemptMap = Map<string, number> | Record<string, number>;

export type LessonSession = {
  userId: string;
  lessonId: string;
  language: string;
  state: LessonState;

  attempts: number;
  maxAttempts: number;
  currentQuestionIndex: number;

  messages: ChatMessage[];

  // Phase 2.2+: per-question tracking
  attemptCountByQuestionId?: StringNumberMap;
  lastAnswerByQuestionId?: StringStringMap;

  // Support-level tracking (session-scoped)
  mistakeCountByConceptTag?: StringNumberMap;
  seenConceptTags?: StringNumberMap;
  wrongCount?: number;
  almostCount?: number;
  forcedAdvanceCount?: number;
  hintsUsedCount?: number;

  // Practice persistence
  practiceById?: PracticeItemMap;
  practiceAttempts?: PracticeAttemptMap;

  // Practice scheduling cooldown (per source question)
  practiceCooldownByQuestionId?: StringNumberMap;

  // Support-level scaffolding
  recentConfusions?: Array<{ conceptTag: string; timestamp: Date }>;
  manualSupportTurnsLeft?: number;
  lastSupportModeFromProfile?: "auto" | "manual";
  forceNoSupport?: boolean;
};
