// backend/src/controllers/lessonController.ts

import { LessonSessionModel } from "../state/sessionState";
import type { Request, Response } from "express";
import type { LessonSession } from "../state/lessonState";
import { buildTutorPrompt } from "../ai/promptBuilder";
import { generateTutorResponse, generatePracticeJSON } from "../ai/openaiClient";
import type { TutorIntent } from "../ai/tutorIntent";
import type { Lesson } from "../state/lessonLoader";
import { loadLesson } from "../state/lessonLoader";
import { evaluateAnswer } from "../state/answerEvaluator";

import {
  getDeterministicRetryMessage,
  getForcedAdvanceMessage,
  getHintLeadIn,
  getFocusNudge,
  getDeterministicRetryExplanation,
  getStartTransition,
  getAdvanceTransition,
  getNextQuestionLabel,
  getEndLessonMessage,
  getHintLabel,
  getPacePrefix,
  type ExplanationDepth,
} from "../ai/staticTutorMessages";

import { LessonProgressModel } from "../state/progressState";
import { generatePracticeItem } from "../services/practiceGenerator";
import { buildReviewPrompt } from "../services/reviewPrompt";
import { PracticeMetaType } from "../types";
import type { SupportedLanguage } from "../types";
import {
  isTutorMessageAcceptable,
  buildTutorFallback,
  validatePrimaryLanguage,
  validateJsonShape,
} from "../ai/tutorOutputGuard";
import { randomUUID } from "crypto";

import {
  recordLessonAttempt,
  getLearnerProfileSummary,
  getLearnerTopFocusReason,
  getConceptMistakeCount,
  getTeachingProfilePrefs,
  updateTeachingProfilePrefs,
  getInstructionLanguage,
  setInstructionLanguage,
  enqueueReviewQueueItems,
  type ReviewQueueItemRecord,
} from "../storage/learnerProfileStore";

import { isPracticeGenEnabled, isInstructionLanguageEnabled } from "../config/featureFlags";
import {
  normalizeLanguage as normalizeInstructionLanguage,
} from "../utils/instructionLanguage";

import {
  normalizeLanguage,
  isSupportedLanguage,
  getTutorIntent,
  chooseHintForAttempt,
  buildProgressPayload,
} from "./lessonHelpers";

import { mapLikeGetNumber, mapLikeHas, mapLikeSet } from "../utils/mapLike";
import { sendError } from "../http/sendError";
import { logServerError } from "../utils/logger";
import { computeSupportLevelDelta, updateSupportLevel } from "../services/supportLevelService";
import { buildSupportSection } from "../services/supportSectionBuilder";
import { computeSupportPolicy } from "../ai/supportPolicy";
import { type SupportEventType } from "../services/supportPolicy";
import { normalizeSupportLevel, supportLevelToNumber, type TeachingSupportLevel } from "../utils/supportLevel";

const FORCED_ADVANCE_PRACTICE_THRESHOLD = 2;

function normalizeTransitionLanguage(
  instructionLanguage: SupportedLanguage | null | undefined,
  fallback: SupportedLanguage
): SupportedLanguage {
  return instructionLanguage ?? fallback;
}

function buildTransitionMessage(
  intent: TutorIntent,
  questionText: string,
  language: SupportedLanguage
): string {
  const q = (questionText || "").trim();
  if (intent === "ASK_QUESTION") {
    return [getStartTransition(language), q].filter(Boolean).join("\n");
  }
  if (intent === "ADVANCE_LESSON") {
    return [getAdvanceTransition(language), getNextQuestionLabel(language), q]
      .filter(Boolean)
      .join("\n");
  }
  if (intent === "FORCED_ADVANCE") {
    return [getForcedAdvanceMessage(language), getNextQuestionLabel(language), q]
      .filter(Boolean)
      .join("\n");
  }
  if (intent === "END_LESSON") {
    return getEndLessonMessage(language);
  }
  return q;
}
const DEFAULT_SUPPORT_LEVEL: TeachingSupportLevel = "high";

function isExplicitSupportRequest(answer: string): boolean {
  const t = String(answer || "").trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes("explain") ||
    t.includes("help") ||
    t.includes("english") ||
    t.includes("deutsch") ||
    t.includes("german") ||
    t.includes("spanish") ||
    t.includes("french")
  );
}

function normalizeTeachingPace(value: unknown): "slow" | "normal" {
  return value === "slow" ? "slow" : "normal";
}

function normalizeExplanationDepthPref(value: unknown): ExplanationDepth {
  return value === "short" || value === "detailed" ? value : "normal";
}

function normalizeSupportLevelPref(value: unknown): TeachingSupportLevel {
  return normalizeSupportLevel(value) ?? DEFAULT_SUPPORT_LEVEL;
}


function resolveSupportEventType(args: {
  intent: TutorIntent;
  evaluationResult?: "correct" | "almost" | "wrong";
  attemptCount: number;
  hintPresent: boolean;
  newConcept: boolean;
  explicitSupportRequest: boolean;
  repeatedConfusion: boolean;
}): SupportEventType {
  if (args.intent === "END_LESSON") return "SESSION_SUMMARY";
  if (args.intent === "FORCED_ADVANCE") return "FORCED_ADVANCE";
  if (args.explicitSupportRequest) return "USER_REQUESTED_EXPLAIN";
  if (args.repeatedConfusion) return "USER_CONFUSED";
  if (args.hintPresent) return "HINT_AUTO";
  if (args.newConcept && (args.intent === "ASK_QUESTION" || args.intent === "ADVANCE_LESSON")) {
    return "INTRO_NEW_CONCEPT";
  }
  if (args.evaluationResult === "almost") return "ALMOST_FEEDBACK";
  if (args.evaluationResult === "wrong") return "WRONG_FEEDBACK";
  if (args.evaluationResult === "correct") return "CORRECT_FEEDBACK";
  return "SESSION_START";
}

function updateRecentConfusions(
  session: any,
  conceptTag: string,
  isIncorrect: boolean,
  forcedAdvance: boolean
): boolean {
  if (!conceptTag) return false;
  const list = Array.isArray(session.recentConfusions) ? session.recentConfusions : [];
  if (isIncorrect || forcedAdvance) {
    list.push({ conceptTag, timestamp: new Date() });
  }
  const trimmed = list.slice(-10);
  session.recentConfusions = trimmed;
  const count = trimmed.filter((entry: any) => entry?.conceptTag === conceptTag).length;
  return forcedAdvance || count >= 2;
}

function getConceptTag(question: any, lessonId?: string): string {
  if (question && typeof question.conceptTag === "string" && question.conceptTag.trim()) {
    return question.conceptTag.trim();
  }
  if (lessonId && question?.id != null) {
    return `lesson-${lessonId}-q${String(question.id)}`;
  }
  return "";
}

type QuestionMeta = {
  id: string | number;
  prompt: string;
  taskType: "typing" | "speaking";
  expectedInput?: "sentence" | "blank";
  conceptTag?: string;
  promptStyle?: string;
};

function buildQuestionMeta(question: any): QuestionMeta | null {
  if (!question) return null;
  const promptRaw = typeof question.prompt === "string" ? question.prompt.trim() : "";
  const questionRaw = typeof question.question === "string" ? question.question.trim() : "";
  const prompt = promptRaw || questionRaw;
  if (!prompt) return null;
  const taskType: "typing" | "speaking" =
    question?.taskType === "speaking" ? "speaking" : "typing";
  const expectedInputRaw =
    typeof question?.expectedInput === "string" ? question.expectedInput.trim().toLowerCase() : "";
  const expectedInput =
    expectedInputRaw === "blank" || expectedInputRaw === "sentence"
      ? (expectedInputRaw as "blank" | "sentence")
      : undefined;
  const idRaw = question?.id ?? "";
  const conceptTag =
    typeof question?.conceptTag === "string" ? question.conceptTag.trim() : "";
  const promptStyle =
    typeof question?.promptStyle === "string" ? question.promptStyle.trim() : "";
  const base = expectedInput
    ? { id: idRaw, prompt, taskType, expectedInput }
    : { id: idRaw, prompt, taskType };
  return {
    ...base,
    ...(conceptTag ? { conceptTag } : {}),
    ...(promptStyle ? { promptStyle } : {}),
  };
}
function toMapLike(map: any): Map<string, number> {
  if (map instanceof Map) return map;
  const out = new Map<string, number>();
  if (map && typeof map === "object") {
    Object.entries(map).forEach(([key, value]) => {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(num)) out.set(key, num);
    });
  }
  return out;
}

function pickWeakQuestionIds(
  lesson: Lesson,
  attemptCounts: Map<string, number>,
  maxItems = 5
): string[] {
  const scored = lesson.questions.map((q, idx) => {
    const qid = String(q.id);
    const attempts = attemptCounts.get(qid) ?? 0;
    return { qid, attempts, idx };
  });

  const weak = scored.filter((s) => s.attempts >= 2);
  if (weak.length === 0) return [];

  weak.sort((a, b) => {
    if (b.attempts !== a.attempts) return b.attempts - a.attempts;
    return a.idx - b.idx;
  });

  return weak.slice(0, maxItems).map((c) => c.qid);
}

async function buildReviewQueueItems(
  lesson: Lesson,
  lessonId: string,
  questionIds: string[],
  now: Date,
  language: SupportedLanguage
): Promise<ReviewQueueItemRecord[]> {
  const items: ReviewQueueItemRecord[] = [];
  for (const qid of questionIds) {
    const q = lesson.questions.find((x) => String(x.id) === qid);
    if (!q) continue;
    const conceptTag = q.conceptTag || `lesson-${lessonId}-q${qid}`;
    const expected = String(q.answer ?? "");

    const prompt = await buildReviewPrompt({
      language,
      lessonId,
      sourceQuestionText: q.prompt || q.question,
      expectedAnswerRaw: expected,
      examples: q.examples,
      conceptTag,
      promptStyle: (q as any).promptStyle,
    });

    items.push({
      id: randomUUID(),
      lessonId,
      conceptTag,
      prompt,
      expected,
      createdAt: now,
      dueAt: now,
      attempts: 0,
    });
  }
  return items;
}

async function ensureTutorPromptOnResume(
  session: any,
  instructionLanguage: SupportedLanguage | null,
  teachingPrefs: {
    pace: "slow" | "normal";
    explanationDepth: ExplanationDepth;
    supportLevel: TeachingSupportLevel;
  }
): Promise<string | null> {
  const last = session.messages?.[session.messages.length - 1];
  if (last && last.role === "assistant") return null;

  const lesson = loadLesson(session.language, session.lessonId);
  if (!lesson) return null;

  const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
  const q = lesson.questions[idx];
  const questionText = q ? (q.prompt || q.question) : "";
  const conceptTag = q ? getConceptTag(q, session.lessonId) : "";

  let intent: TutorIntent;
  if (session.state === "COMPLETE") intent = "END_LESSON";
  else if (session.state === "ADVANCE") intent = "ADVANCE_LESSON";
  else intent = "ASK_QUESTION";

  const pace = normalizeTeachingPace(teachingPrefs.pace);
  const explanationDepth = normalizeExplanationDepthPref(teachingPrefs.explanationDepth);
  const supportLevel = normalizeSupportLevelPref(teachingPrefs.supportLevel);

  const policy = computeSupportPolicy({
    intent,
    pace,
    explanationDepth,
    supportLevel,
    instructionLanguage: instructionLanguage ?? undefined,
    lessonLanguage: session.language as SupportedLanguage,
    attemptCount: 1,
    isFirstQuestion: idx === 0,
  });

  let includeSupport = policy.includeSupport;
  if (session.forceNoSupport) includeSupport = false;

  const tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
    ...(instructionLanguage ? { instructionLanguage } : {}),
    supportLevel,
    supportTextDirective: includeSupport ? "include" : "omit",
    eventType: "SESSION_START",
    includeSupport,
    conceptTag,
    pace,
    explanationDepth,
    attemptCount: 1,
    isFirstQuestion: idx === 0,
  });

  let tutorMessage: string;
  let supportText = "";
  try {
    const response = await generateTutorResponse(tutorPrompt, intent, { language: session.language });
    tutorMessage = response.primaryText;
    if (!validateJsonShape(response)) {
      tutorMessage = "";
    }
  } catch {
    tutorMessage = "I'm having trouble responding right now. Please try again later.";
  }

  if (
    !validatePrimaryLanguage(tutorMessage, session.language as SupportedLanguage) ||
    !isTutorMessageAcceptable({
      intent,
      language: session.language,
      message: tutorMessage,
      questionText,
    })
  ) {
    tutorMessage = buildTutorFallback({
      intent,
      language: session.language,
      message: tutorMessage,
      questionText,
    });
  }

  const transitionLanguage = normalizeTransitionLanguage(
    instructionLanguage,
    session.language as SupportedLanguage
  );
  tutorMessage = buildTransitionMessage(intent, questionText, transitionLanguage);

  if (includeSupport) {
      supportText = buildSupportSection({
        lessonLanguage: session.language as SupportedLanguage,
        instructionLanguage: instructionLanguage ?? undefined,
        supportLanguageStyle: policy.supportLanguageStyle,
        maxSupportBullets: policy.maxSupportBullets,
        explanationDepth,
        eventType: "SESSION_START",
        conceptTag,
        hintTarget: typeof q?.hintTarget === "string" ? q.hintTarget : undefined,
        explanationTarget: typeof q?.explanationTarget === "string" ? q.explanationTarget : undefined,
        hintSupport: typeof q?.hintSupport === "string" ? q.hintSupport : undefined,
        explanationSupport:
          typeof q?.explanationSupport === "string" ? q.explanationSupport : undefined,
      });
  } else {
    supportText = "";
  }

  const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;

  session.messages = session.messages || [];
  session.messages.push({ role: "assistant", content: combinedMessage });

  await session.save();

  return combinedMessage;
}

//----------------------
// Start lesson
//----------------------
export const startLesson = async (req: Request, res: Response) => {
  const { userId, language, lessonId, restart, teachingPrefs } = req.body;

  const lang = normalizeLanguage(language);

  if (!userId) return sendError(res, 400, "UserId is required", "INVALID_REQUEST");
  if (!lang)
    return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
  if (!lessonId) return sendError(res, 400, "lessonId is required", "INVALID_REQUEST");

  try {
    let instructionLanguage: SupportedLanguage | null = null;

    if (teachingPrefs && typeof updateTeachingProfilePrefs === "function") {
      try {
        await updateTeachingProfilePrefs({
          userId,
          language: lang,
          pace: teachingPrefs?.pace,
          explanationDepth: teachingPrefs?.explanationDepth,
          supportLevel: teachingPrefs?.supportLevel,
          supportMode: teachingPrefs?.supportMode,
        });
      } catch {
        // best-effort: never block lesson start
      }
    }

    if (isInstructionLanguageEnabled()) {
      try {
        const normalizedInstruction = normalizeInstructionLanguage(teachingPrefs?.instructionLanguage);
        if (normalizedInstruction && typeof setInstructionLanguage === "function") {
          await setInstructionLanguage({
            userId,
            language: lang,
            instructionLanguage: normalizedInstruction,
          });
        }
      } catch {
        // best-effort
      }

      try {
        instructionLanguage =
          typeof getInstructionLanguage === "function" ? await getInstructionLanguage(userId, lang) : null;
      } catch {
        instructionLanguage = null;
      }
    }

    let storedTeachingPrefs: Awaited<ReturnType<typeof getTeachingProfilePrefs>> | null = null;
    try {
      storedTeachingPrefs =
        typeof getTeachingProfilePrefs === "function"
          ? await getTeachingProfilePrefs(userId, lang)
          : null;
    } catch {
      storedTeachingPrefs = null;
    }

    const resolvedTeachingPrefs = {
      pace: normalizeTeachingPace(teachingPrefs?.pace ?? storedTeachingPrefs?.pace),
      explanationDepth: normalizeExplanationDepthPref(
        teachingPrefs?.explanationDepth ?? storedTeachingPrefs?.explanationDepth
      ),
      supportLevel: normalizeSupportLevelPref(
        teachingPrefs?.supportLevel ?? storedTeachingPrefs?.supportLevel
      ),
    };

    let session = await LessonSessionModel.findOne(
      { userId, language: lang },
      undefined,
      { sort: { updatedAt: -1 } }
    );

    if (session) {
      const sameLesson = session.lessonId === lessonId && session.language === lang;
      if (sameLesson) {
        if (restart === true) {
          await LessonProgressModel.deleteOne({ userId, language: lang, lessonId });
          session = null;
        } else {
          const resumeLesson = loadLesson(session.language, session.lessonId);
          const progress = resumeLesson ? buildProgressPayload(session, resumeLesson) : undefined;
          const resumeQuestion = resumeLesson?.questions?.[session.currentQuestionIndex ?? 0];
          const question = buildQuestionMeta(resumeQuestion);
          const tutorMessage = await ensureTutorPromptOnResume(
            session,
            instructionLanguage,
            resolvedTeachingPrefs
          );

          return res.status(200).json({
            session,
            ...(tutorMessage ? { tutorMessage } : {}),
            ...(progress ? { progress } : {}),
            ...(question ? { question } : {}),
          });
        }
      }

      await LessonSessionModel.deleteOne({ userId, language: lang });
      session = null;
    }

    const lesson: Lesson | null = loadLesson(lang, lessonId);
    if (!lesson) return sendError(res, 404, "Lesson not found", "NOT_FOUND");

    const newSession: LessonSession = {
      userId,
      lessonId,
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
      language: lang,
      ...(typeof teachingPrefs?.forceNoSupport === "boolean"
        ? { forceNoSupport: teachingPrefs.forceNoSupport }
        : {}),
    };

    const firstQuestion = lesson.questions[0];
    const firstQuestionText = firstQuestion ? (firstQuestion.prompt || firstQuestion.question) : "";
    const firstConceptTag = getConceptTag(firstQuestion, lessonId);
    if (firstConceptTag) {
      const seen = new Map<string, number>();
      seen.set(firstConceptTag, 1);
      newSession.seenConceptTags = seen as any;
    }

    const intent: TutorIntent = "ASK_QUESTION";

    const pace = normalizeTeachingPace(resolvedTeachingPrefs.pace);
    const explanationDepth = normalizeExplanationDepthPref(resolvedTeachingPrefs.explanationDepth);
    const supportLevel = normalizeSupportLevelPref(resolvedTeachingPrefs.supportLevel);

    const policy = computeSupportPolicy({
      intent,
      pace,
      explanationDepth,
      supportLevel,
      instructionLanguage: instructionLanguage ?? undefined,
      lessonLanguage: lang as SupportedLanguage,
      attemptCount: 1,
      isFirstQuestion: true,
    });

    let includeSupport = policy.includeSupport;
    if (newSession.forceNoSupport) includeSupport = false;

    const tutorPrompt = buildTutorPrompt(newSession, intent, firstQuestionText, {
      ...(instructionLanguage ? { instructionLanguage } : {}),
      supportLevel,
      supportTextDirective: includeSupport ? "include" : "omit",
      eventType: "SESSION_START",
      includeSupport,
      conceptTag: firstConceptTag,
      pace,
      explanationDepth,
      attemptCount: 1,
      isFirstQuestion: true,
    });

    let tutorMessage: string;
    let supportText = "";
    try {
      const response = await generateTutorResponse(tutorPrompt, intent, { language: lang });
      tutorMessage = response.primaryText;
      if (!validateJsonShape(response)) {
        tutorMessage = "";
      }
    } catch {
      tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }

    if (
      !validatePrimaryLanguage(tutorMessage, lang as SupportedLanguage) ||
      !isTutorMessageAcceptable({
        intent,
        language: lang,
        message: tutorMessage,
        questionText: firstQuestionText,
      })
    ) {
      tutorMessage = buildTutorFallback({
        intent,
        language: lang,
        message: tutorMessage,
        questionText: firstQuestionText,
      });
    }

    const transitionLanguage = normalizeTransitionLanguage(instructionLanguage, lang as SupportedLanguage);
    tutorMessage = buildTransitionMessage(intent, firstQuestionText, transitionLanguage);

    if (includeSupport) {
      supportText = buildSupportSection({
        lessonLanguage: lang as SupportedLanguage,
        instructionLanguage: instructionLanguage ?? undefined,
        supportLanguageStyle: policy.supportLanguageStyle,
        maxSupportBullets: policy.maxSupportBullets,
        explanationDepth,
        eventType: "SESSION_START",
        conceptTag: firstConceptTag,
        hintTarget: typeof firstQuestion?.hintTarget === "string" ? firstQuestion.hintTarget : undefined,
        explanationTarget:
          typeof firstQuestion?.explanationTarget === "string"
            ? firstQuestion.explanationTarget
            : undefined,
        hintSupport:
          typeof firstQuestion?.hintSupport === "string" ? firstQuestion.hintSupport : undefined,
        explanationSupport:
          typeof firstQuestion?.explanationSupport === "string"
            ? firstQuestion.explanationSupport
            : undefined,
      });
    } else {
      supportText = "";
    }

    const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;

    const intitialMessage = { role: "assistant", content: combinedMessage };
    session = await LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });

    await LessonProgressModel.updateOne(
      { userId, language: lang, lessonId },
      {
        $set: {
          status: "in_progress",
          currentQuestionIndex: 0,
          lastActiveAt: new Date(),
        },
      },
      { upsert: true }
    );

    const progress = buildProgressPayload(session, lesson);
    const question = buildQuestionMeta(firstQuestion);

    return res.status(201).json({
      session,
      tutorMessage: combinedMessage,
      progress,
      ...(question ? { question } : {}),
    });
  } catch (err) {
    logServerError("startLesson", err, res.locals?.requestId);
    return sendError(res, 500, "Server error", "SERVER_ERROR");
  }
};

//----------------------
// Submit answer
//----------------------
export const submitAnswer = async (req: Request, res: Response) => {
  try {
    const { userId, answer, language, lessonId, teachingPrefs } = req.body;
    if (!userId || typeof answer !== "string") {
      return sendError(
        res,
        400,
        "Invalid Payload (userId and answer are required)",
        "INVALID_REQUEST",
      );
    }

    const normalizedLanguage =
      typeof language === "string" && language.trim() ? normalizeLanguage(language) : null;
    if (language != null && !normalizedLanguage) {
      return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
    }

    const sessionQuery: Record<string, string> = { userId };
    if (normalizedLanguage) sessionQuery.language = normalizedLanguage;
    if (typeof lessonId === "string" && lessonId.trim()) {
      sessionQuery.lessonId = lessonId.trim();
    }

    const session = await LessonSessionModel.findOne(sessionQuery, undefined, {
      sort: { updatedAt: -1 },
    });
    if (!session) return sendError(res, 404, "No active session found", "NOT_FOUND");

    if (!session.language && normalizedLanguage) {
      session.language = normalizedLanguage;
    }
    if (!session.lessonId && typeof lessonId === "string") session.lessonId = lessonId;

    if (!session.language || !session.lessonId) {
      return sendError(
        res,
        409,
        "Session missing language/lessonId. Please restart the lesson",
        "SESSION_INCMPLETE",
      );
    }

    if (teachingPrefs && typeof updateTeachingProfilePrefs === "function") {
      try {
        await updateTeachingProfilePrefs({
          userId: session.userId,
          language: session.language as SupportedLanguage,
          pace: teachingPrefs?.pace,
          explanationDepth: teachingPrefs?.explanationDepth,
          supportLevel: teachingPrefs?.supportLevel,
          supportMode: teachingPrefs?.supportMode,
        });
      } catch {
        // best-effort: do not block answering
      }
    }

    let instructionLanguage: SupportedLanguage | null = null;
    if (isInstructionLanguageEnabled()) {
      try {
        const normalizedInstruction = normalizeInstructionLanguage(teachingPrefs?.instructionLanguage);
        if (normalizedInstruction && typeof setInstructionLanguage === "function") {
          await setInstructionLanguage({
            userId: session.userId,
            language: session.language as SupportedLanguage,
            instructionLanguage: normalizedInstruction,
          });
        }
      } catch {
        // best-effort
      }

      try {
        instructionLanguage =
          typeof getInstructionLanguage === "function"
            ? await getInstructionLanguage(session.userId, session.language as SupportedLanguage)
            : null;
      } catch {
        instructionLanguage = null;
      }
    }

    let storedTeachingPrefs: Awaited<ReturnType<typeof getTeachingProfilePrefs>> | null = null;
    try {
      storedTeachingPrefs =
        typeof getTeachingProfilePrefs === "function"
          ? await getTeachingProfilePrefs(session.userId, session.language as SupportedLanguage)
          : null;
    } catch {
      storedTeachingPrefs = null;
    }

    const resolvedTeachingPrefs = {
      pace: normalizeTeachingPace(teachingPrefs?.pace ?? storedTeachingPrefs?.pace),
      explanationDepth: normalizeExplanationDepthPref(
        teachingPrefs?.explanationDepth ?? storedTeachingPrefs?.explanationDepth
      ),
      supportLevel: normalizeSupportLevelPref(
        teachingPrefs?.supportLevel ?? storedTeachingPrefs?.supportLevel
      ),
    };

    const pace = normalizeTeachingPace(resolvedTeachingPrefs.pace);
    const explanationDepth = normalizeExplanationDepthPref(resolvedTeachingPrefs.explanationDepth);
    const supportLevel = normalizeSupportLevelPref(resolvedTeachingPrefs.supportLevel);
    const supportLevelNumber = supportLevelToNumber(supportLevel);

    if (typeof teachingPrefs?.forceNoSupport === "boolean") {
      session.forceNoSupport = teachingPrefs.forceNoSupport;
    }

    const forceNoSupport = Boolean(session.forceNoSupport);

    const lesson: Lesson | null = loadLesson(session.language, session.lessonId);
    if (!lesson) return sendError(res, 404, "Lesson not found", "NOT_FOUND");

    if (session.state === "COMPLETE") {
      const progress = buildProgressPayload(session, lesson, "completed");
      return res.status(200).json({ progress, session });
    }

    session.messages.push({ role: "user", content: answer });

    const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const currentQuestion = lesson.questions[currentIndex];

    if (!currentQuestion) {
      return sendError(
        res,
        409,
        "Session out of sync with lesson content. Please restart the lesson",
        "SESSION_OUT_OF_SYNC",
      );
    }

    const qid = String(currentQuestion.id);

    const practiceCooldownByQuestionId: any = (session as any).practiceCooldownByQuestionId;
    const practiceCooldownActive = mapLikeGetNumber(practiceCooldownByQuestionId, qid, 0) >= 1;


    const attemptMap: Map<string, number> = session.attemptCountByQuestionId || new Map();
    const lastAnswerMap: Map<string, string> = session.lastAnswerByQuestionId || new Map();

    const prevAttemptCount = attemptMap.get(qid) || 0;
    const attemptCount = prevAttemptCount + 1;
    attemptMap.set(qid, attemptCount);

    const prevAnswer = (lastAnswerMap.get(qid) || "").trim().toLowerCase();
    const nowAnswer = answer.trim().toLowerCase();
    const repeatedSameWrong = prevAnswer.length > 0 && prevAnswer === nowAnswer;
    lastAnswerMap.set(qid, nowAnswer);

    session.attemptCountByQuestionId = attemptMap as any;
    session.lastAnswerByQuestionId = lastAnswerMap as any;

    const evaluation = evaluateAnswer(currentQuestion, answer, session.language);
    const isCorrect = evaluation.result === "correct";
    const reviewAfterAttempts = !isCorrect && attemptCount >= 3;

    const conceptTag = getConceptTag(currentQuestion, session.lessonId);
    const conceptMap: any = (session as any).mistakeCountByConceptTag ?? new Map();

    if (!isCorrect && conceptTag) {
      const prev = mapLikeGetNumber(conceptMap, conceptTag, 0);
      (session as any).mistakeCountByConceptTag = mapLikeSet<number>(conceptMap, conceptTag, prev + 1);
    } else if (conceptTag && !(session as any).mistakeCountByConceptTag) {
      (session as any).mistakeCountByConceptTag = conceptMap;
    }

    if (!isCorrect) {
      if (evaluation.result === "almost") {
        (session as any).almostCount = ((session as any).almostCount || 0) + 1;
      } else {
        (session as any).wrongCount = ((session as any).wrongCount || 0) + 1;
      }
    }

    const explicitSupportRequest = isExplicitSupportRequest(answer);

    let markNeedsReview = false;

    if (isCorrect) {
      if (currentIndex + 1 >= lesson.questions.length) {
        session.state = "COMPLETE";
      } else {
        session.currentQuestionIndex = currentIndex + 1;
        session.state = "ADVANCE";
      }

      const cd0: any = (session as any).practiceCooldownByQuestionId ?? new Map();
      (session as any).practiceCooldownByQuestionId = mapLikeSet<number>(cd0, qid, 0);
    } else {
      if (attemptCount >= 4) {
        markNeedsReview = true;
        (session as any).forcedAdvanceCount = ((session as any).forcedAdvanceCount || 0) + 1;

        if (currentIndex + 1 >= lesson.questions.length) {
          session.state = "COMPLETE";
        } else {
          session.currentQuestionIndex = currentIndex + 1;
          session.state = "ADVANCE";
        }

        const cd0: any = (session as any).practiceCooldownByQuestionId ?? new Map();
        (session as any).practiceCooldownByQuestionId = mapLikeSet<number>(cd0, qid, 0);
      } else {
        session.state = "USER_INPUT";
      }
    }

    const repeatedConfusion = updateRecentConfusions(
      session,
      conceptTag,
      !isCorrect,
      markNeedsReview
    );

    let baseStatus =
      session.state === "COMPLETE" ? (markNeedsReview ? "needs_review" : "completed") : "in_progress";

    const updateMistakes: any = {};
    if (markNeedsReview) {
      updateMistakes[`mistakesByQuestion.${qid}`] = 1;
    }

    await LessonProgressModel.updateOne(
      { userId: session.userId, language: session.language, lessonId: session.lessonId },
      {
        $set: {
          status: baseStatus,
          currentQuestionIndex: session.currentQuestionIndex || 0,
          lastActiveAt: new Date(),
        },
        $inc: {
          attemptsTotal: 1,
          ...(markNeedsReview ? updateMistakes : {}),
        },
      },
      { upsert: true }
    );

    try {
      await recordLessonAttempt({
        userId: session.userId,
        language: session.language,
        result: evaluation.result,
        reasonCode: evaluation.reasonCode,
        forcedAdvance: markNeedsReview,
        repeatedWrong: repeatedSameWrong || reviewAfterAttempts,
        conceptTag: currentQuestion?.conceptTag,
        lessonId: session.lessonId,
        questionId: String(currentQuestion?.id ?? ""),
      });
    } catch {
      // ignore
    }

    if (baseStatus === "completed" || baseStatus === "needs_review") {
      try {
        const attemptCounts = toMapLike(session.attemptCountByQuestionId);
        const weakIds = pickWeakQuestionIds(lesson, attemptCounts);
        const now = new Date();
        const items = await buildReviewQueueItems(
          lesson,
          session.lessonId,
          weakIds,
          now,
          session.language as SupportedLanguage
        );
        await enqueueReviewQueueItems({
          userId: session.userId,
          language: session.language,
          items,
          summary: {
            lessonId: session.lessonId,
            completedAt: now,
            didWell: "You completed the lesson.",
            focusNext: items.map((i) => i.conceptTag).slice(0, 3),
          },
        });
      } catch {
        // best-effort: never block lesson completion
      }
    }

    if (baseStatus === "completed" || baseStatus === "needs_review") {
      try {
        const stats = {
          wrongCount: Number((session as any).wrongCount || 0),
          almostCount: Number((session as any).almostCount || 0),
          forcedAdvanceCount: Number((session as any).forcedAdvanceCount || 0),
          hintsUsedCount: Number((session as any).hintsUsedCount || 0),
        };
        const delta = computeSupportLevelDelta(stats, supportLevelNumber);
        if (delta !== 0) {
          await updateSupportLevel(session.userId, session.language as SupportedLanguage, delta);
        }
      } catch {
        // best-effort
      }
    }

    const intent = getTutorIntent(session.state, isCorrect, markNeedsReview);

    const safeIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const nextQuestion =
      session.state !== "COMPLETE" && lesson.questions[safeIndex] ? lesson.questions[safeIndex] : null;
    const questionText = nextQuestion ? (nextQuestion.prompt || nextQuestion.question) : "";

    const nextConceptTag = nextQuestion ? getConceptTag(nextQuestion, session.lessonId) : "";
    const seenConceptTags: any = (session as any).seenConceptTags ?? new Map();
    const hasSeenConcept = nextConceptTag
      ? mapLikeGetNumber(seenConceptTags, nextConceptTag, 0) > 0
      : false;
    const newConcept = nextConceptTag ? !hasSeenConcept : false;
    if (nextConceptTag && !hasSeenConcept) {
      (session as any).seenConceptTags = mapLikeSet<number>(seenConceptTags, nextConceptTag, 1);
    } else if (!(session as any).seenConceptTags) {
      (session as any).seenConceptTags = seenConceptTags;
    }

    const hintEvent = !isCorrect && attemptCount >= 2 && attemptCount < 4;

    const eventType = resolveSupportEventType({
      intent,
      evaluationResult: evaluation.result,
      attemptCount,
      hintPresent: hintEvent,
      newConcept,
      explicitSupportRequest,
      repeatedConfusion,
    });

    const policy = computeSupportPolicy({
      intent,
      pace,
      explanationDepth,
      supportLevel,
      instructionLanguage: instructionLanguage ?? undefined,
      lessonLanguage: session.language as SupportedLanguage,
      attemptCount,
      isFirstQuestion: currentIndex === 0,
    });

    let includeSupport = policy.includeSupport;
    if (forceNoSupport) includeSupport = false;

    const hintObj = chooseHintForAttempt(currentQuestion, attemptCount, {
      instructionLanguage: instructionLanguage ?? undefined,
      targetLanguage: session.language as SupportedLanguage,
      supportLevel: supportLevelNumber,
      recentConfusion: repeatedConfusion,
      includeSupport,
    });
    const hintTextForPrompt = hintObj?.text ?? "";
    const hintForResponse = hintObj ? { level: hintObj.level, text: hintObj.text } : undefined;

    if (hintObj && hintObj.level >= 1 && hintObj.level < 3) {
      (session as any).hintsUsedCount = ((session as any).hintsUsedCount || 0) + 1;
    }

    let supportText = "";

    const revealAnswer = intent === "FORCED_ADVANCE" ? String(currentQuestion.answer || "").trim() : "";

    const transitionLanguage = normalizeTransitionLanguage(
      instructionLanguage,
      session.language as SupportedLanguage
    );

    const retryMessage =
      intent === "ENCOURAGE_RETRY"
        ? getDeterministicRetryMessage({
            reasonCode: evaluation.reasonCode,
            attemptCount,
            repeatedSameWrong,
            language: transitionLanguage,
          })
        : "";

    const forcedAdvanceMessage =
      intent === "FORCED_ADVANCE" ? getForcedAdvanceMessage(transitionLanguage) : "";

    const hintLeadIn =
      intent === "ENCOURAGE_RETRY" && hintTextForPrompt
        ? getHintLeadIn(attemptCount, transitionLanguage)
        : "";

    let learnerProfileSummary: string | null = null;
    let topFocusReason: string | null = null;

    try {
      [learnerProfileSummary, topFocusReason] = await Promise.all([
        getLearnerProfileSummary({ userId: session.userId, language: session.language }),
        getLearnerTopFocusReason({ userId: session.userId, language: session.language }),
      ]);
    } catch {
      learnerProfileSummary = null;
      topFocusReason = null;
    }

    let focusNudge = "";
    try {
      if (typeof topFocusReason === "string" && topFocusReason.trim()) {
        focusNudge = getFocusNudge(topFocusReason, transitionLanguage);
      }
    } catch {
      focusNudge = "";
    }

    const pacePrefix = pace === "slow" ? getPacePrefix(transitionLanguage) : "";

    const hintLeadInWithFocus =
      intent === "ENCOURAGE_RETRY" && hintTextForPrompt
        ? (pacePrefix || focusNudge || hintLeadIn)
        : hintLeadIn;

    const forcedAdvanceMessageWithFocus = intent === "FORCED_ADVANCE" ? forcedAdvanceMessage : forcedAdvanceMessage;

    const eventConceptTag =
      intent === "ENCOURAGE_RETRY" || intent === "FORCED_ADVANCE" ? conceptTag : nextConceptTag;

    let retryExplanationText = "";
    try {
      retryExplanationText =
        intent === "ENCOURAGE_RETRY"
          ? getDeterministicRetryExplanation({
              reasonCode: evaluation.reasonCode,
              attemptCount,
              depth: explanationDepth,
            })
          : "";
    } catch {
      retryExplanationText = "";
    }

    const forcedAdvanceExplanationText =
      intent === "FORCED_ADVANCE" && explanationDepth !== "short"
        ? typeof currentQuestion?.explanation === "string"
          ? currentQuestion.explanation
          : ""
        : "";

    const explanationTextForPrompt =
      intent === "ENCOURAGE_RETRY"
        ? retryExplanationText
        : intent === "FORCED_ADVANCE"
          ? forcedAdvanceExplanationText
          : "";

    let tutorMessage = "";

    if (intent === "ENCOURAGE_RETRY") {
      const lines: string[] = [];
      const retryLine = retryMessage;
      if (retryLine) lines.push(retryLine);

      const showPrimaryHint = !includeSupport && Boolean(hintTextForPrompt);
      if (showPrimaryHint) {
        if (hintLeadInWithFocus) lines.push(hintLeadInWithFocus);
        const hintLabel = getHintLabel(transitionLanguage);
        const hintLine = `${hintLabel} ${hintTextForPrompt}`.trim();
        if (hintLine) lines.push(hintLine);
      }

      if (questionText) lines.push(questionText);
      tutorMessage = lines.join("\n").trim();
      if (!tutorMessage) {
        tutorMessage = questionText || retryLine;
      }
    } else {
      let tutorPrompt: string;
      try {
        tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
          retryMessage,
          hintText: "",
          hintLeadIn: "",
          forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
          revealAnswer: "",
          learnerProfileSummary: learnerProfileSummary ?? undefined,
          explanationText: "",
          instructionLanguage: instructionLanguage ?? undefined,
          supportLevel,
          supportTextDirective: includeSupport ? "include" : "omit",
          eventType,
          includeSupport,
          conceptTag: eventConceptTag,
          pace,
          explanationDepth,
          attemptCount,
          isFirstQuestion: currentIndex === 0,
        });
      } catch {
        tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
          retryMessage,
          hintText: "",
          hintLeadIn: "",
          forcedAdvanceMessage,
          revealAnswer: "",
          learnerProfileSummary: learnerProfileSummary ?? undefined,
          explanationText: intent === "FORCED_ADVANCE" ? (currentQuestion?.explanation ?? "") : "",
          instructionLanguage: instructionLanguage ?? undefined,
          supportLevel,
          supportTextDirective: includeSupport ? "include" : "omit",
          eventType,
          includeSupport,
          conceptTag: eventConceptTag,
          pace,
          explanationDepth,
          attemptCount,
          isFirstQuestion: currentIndex === 0,
        });
      }

      try {
        const response = await generateTutorResponse(tutorPrompt, intent, { language: session.language });
        tutorMessage = response.primaryText;
        if (!validateJsonShape(response)) {
          tutorMessage = "";
        }
      } catch {
        tutorMessage = "I'm having trouble responding right now. please try again.";
      }
    }

    const retryMessageForGuard = retryMessage;

    if (
      !validatePrimaryLanguage(tutorMessage, session.language as SupportedLanguage) ||
      !isTutorMessageAcceptable({
        intent,
        language: session.language,
        message: tutorMessage,
        questionText,
        retryMessage: retryMessageForGuard,
        hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        hintLeadIn: hintLeadInWithFocus,
        forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
        revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
      })
    ) {
      tutorMessage = buildTutorFallback({
        intent,
        language: session.language,
        message: tutorMessage,
        questionText,
        retryMessage: retryMessageForGuard,
        hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        hintLeadIn: hintLeadInWithFocus,
        forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
        revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
      });
    }

    if (intent !== "ENCOURAGE_RETRY") {
      tutorMessage = buildTransitionMessage(intent, questionText, transitionLanguage);
    }

    const completionDetected = /completed this (lesson|session)/i.test(tutorMessage);
    if (completionDetected && baseStatus !== "completed") {
      session.state = "COMPLETE";
      baseStatus = "completed";
      try {
        await LessonProgressModel.updateOne(
          { userId: session.userId, language: session.language, lessonId: session.lessonId },
          {
            $set: {
              status: baseStatus,
              currentQuestionIndex: session.currentQuestionIndex || 0,
              lastActiveAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch {
        // best-effort
      }
    }

    if (includeSupport) {
      const supportQuestion =
        intent === "ENCOURAGE_RETRY" || intent === "FORCED_ADVANCE" ? currentQuestion : nextQuestion;
      supportText = buildSupportSection({
        lessonLanguage: session.language as SupportedLanguage,
        instructionLanguage: instructionLanguage ?? undefined,
        supportLanguageStyle: policy.supportLanguageStyle,
        maxSupportBullets: policy.maxSupportBullets,
        explanationDepth,
        eventType,
        conceptTag: eventConceptTag,
        hintTarget:
          typeof supportQuestion?.hintTarget === "string" ? supportQuestion.hintTarget : undefined,
        explanationTarget:
          typeof supportQuestion?.explanationTarget === "string"
            ? supportQuestion.explanationTarget
            : undefined,
        hintSupport:
          typeof supportQuestion?.hintSupport === "string" ? supportQuestion.hintSupport : undefined,
        explanationSupport:
          typeof supportQuestion?.explanationSupport === "string"
            ? supportQuestion.explanationSupport
            : undefined,
      });
    } else {
      supportText = "";
    }

    const combinedMessage = supportText ? `${tutorMessage}\n\n${supportText}` : tutorMessage;
    session.messages.push({ role: "assistant", content: combinedMessage });

    await session.save();

    let practice: { practiceId: string; prompt: string } | undefined;

    const practiceConceptTag =
      typeof currentQuestion.conceptTag === "string" && currentQuestion.conceptTag.trim().length > 0
        ? currentQuestion.conceptTag.trim()
        : `lesson-${session.lessonId}-q${currentQuestion.id}`;
      
    const isForcedAdvance = intent === "FORCED_ADVANCE";
      
    // Forced-advance practice is gated by concept mistake count threshold
    let allowForcedAdvancePractice = false;
    if (isForcedAdvance) {
      try {
        const conceptCount = await getConceptMistakeCount(
          session.userId,
          session.language,
          practiceConceptTag
        );
        allowForcedAdvancePractice = conceptCount >= FORCED_ADVANCE_PRACTICE_THRESHOLD;
      } catch {
        allowForcedAdvancePractice = false;
      }
    }
    
    // Core schedule rule:
    // - allow on "almost" (once per question via cooldown)
    // - allow on forced-advance ONLY if threshold met (once per question via cooldown)
    const shouldGeneratePractice =
      isPracticeGenEnabled() &&
      !practiceCooldownActive &&
      (evaluation.result === "almost" || (isForcedAdvance && allowForcedAdvancePractice));
    
    if (shouldGeneratePractice) {
      try {
        const aiClient = { generatePracticeJSON };
      
        const practiceType: PracticeMetaType = "variation";
      
        const { item: practiceItem } = await generatePracticeItem(
          {
            language: session.language,
            lessonId: session.lessonId,
            sourceQuestionText: currentQuestion.prompt || currentQuestion.question,
            expectedAnswerRaw: currentQuestion.answer,
            conceptTag: practiceConceptTag,
            type: practiceType,
          },
          aiClient,
          { forceEnabled: true }
        );
      
        // Persist practice item
        let pb: any = (session as any).practiceById;
        pb = mapLikeSet(pb, practiceItem.practiceId, practiceItem);
      
        // Persist attempts counter (init only once)
        let pa: any = (session as any).practiceAttempts;
        if (!mapLikeHas(pa, practiceItem.practiceId)) {
          pa = mapLikeSet(pa, practiceItem.practiceId, 0);
        }
      
        (session as any).practiceById = pb;
        (session as any).practiceAttempts = pa;
      
        // Cooldown this question so we don’t generate repeated practices
        let cd: any = (session as any).practiceCooldownByQuestionId;
        cd = mapLikeSet(cd, qid, 1);
        (session as any).practiceCooldownByQuestionId = cd;
      
        await session.save();
      
        practice = { practiceId: practiceItem.practiceId, prompt: practiceItem.prompt };
      } catch {
        practice = undefined;
      }
    }

    const progress = buildProgressPayload(session, lesson, baseStatus as any);
    const question = buildQuestionMeta(nextQuestion);

    return res.status(200).json({
      progress,
      session,
      tutorMessage,
      evaluation: {
        result: evaluation.result,
        reasonCode: evaluation.reasonCode,
      },
      ...(hintForResponse ? { hint: hintForResponse } : {}),
      ...(practice ? { practice } : {}),
      ...(question ? { question } : {}),
    });
  } catch (err) {
    logServerError("submitAnswer", err, res.locals?.requestId);
    return sendError(res, 500, "Server error", "SERVER_ERROR");
  }
};

//----------------------
// Get session (debug)
//----------------------
export const getSessionHandler = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { language, lessonId } = req.query ?? {};

  if (!userId) return sendError(res, 400, "UserId is required", "INVALID_REQUEST");

  try {
    let normalizedLanguage: SupportedLanguage | null = null;
    if (typeof language === "string" && language.trim()) {
      normalizedLanguage = normalizeLanguage(language);
      if (!normalizedLanguage) {
        return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
      }
    }

    const sessionQuery: Record<string, string> = { userId };
    if (normalizedLanguage) sessionQuery.language = normalizedLanguage;
    if (typeof lessonId === "string" && lessonId.trim()) {
      sessionQuery.lessonId = lessonId.trim();
    }

    const session = await LessonSessionModel.findOne(sessionQuery, undefined, {
      sort: { updatedAt: -1 },
    });
    if (!session) return sendError(res, 404, "No active sessions found", "NOT_FOUND");

    let instructionLanguage: SupportedLanguage | null = null;
    if (isInstructionLanguageEnabled() && session?.language) {
      try {
        instructionLanguage =
          typeof getInstructionLanguage === "function"
            ? await getInstructionLanguage(session.userId, session.language as SupportedLanguage)
            : null;
      } catch {
        instructionLanguage = null;
      }
    }

    let storedTeachingPrefs: Awaited<ReturnType<typeof getTeachingProfilePrefs>> | null = null;
    try {
      storedTeachingPrefs =
        typeof getTeachingProfilePrefs === "function"
          ? await getTeachingProfilePrefs(session.userId, session.language as SupportedLanguage)
          : null;
    } catch {
      storedTeachingPrefs = null;
    }

    const resolvedTeachingPrefs = {
      pace: normalizeTeachingPace(storedTeachingPrefs?.pace),
      explanationDepth: normalizeExplanationDepthPref(storedTeachingPrefs?.explanationDepth),
      supportLevel: normalizeSupportLevelPref(storedTeachingPrefs?.supportLevel),
    };

    const tutorMessage = await ensureTutorPromptOnResume(
      session,
      instructionLanguage,
      resolvedTeachingPrefs
    );

    const lesson = loadLesson(session.language, session.lessonId);
    const progress = lesson ? buildProgressPayload(session, lesson) : undefined;
    const question = lesson
      ? buildQuestionMeta(lesson.questions?.[session.currentQuestionIndex ?? 0])
      : null;

    return res.status(200).json({
      session,
      messages: session.messages,
      ...(tutorMessage ? { tutorMessage } : {}),
      ...(progress ? { progress } : {}),
      ...(question ? { question } : {}),
    });
  } catch (err) {
    logServerError("getSessionHandler", err, res.locals?.requestId);
    return sendError(res, 500, "Failed to fetch session", "SERVER_ERROR");
  }
};
