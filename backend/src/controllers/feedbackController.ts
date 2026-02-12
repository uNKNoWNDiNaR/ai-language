//backend/src/controllers/feedbackController.ts

import type { Request, Response } from "express";
import crypto from "node:crypto";

import { getSession } from "../storage/sessionStore";
import { loadLesson } from "../state/lessonLoader";
import { LessonFeedbackModel } from "../state/feedbackState";
import { sendError } from "../http/sendError";

function sha256Short(input:string): string {
    return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function toBooleanOrUndefined(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
}

function toHelpedUnderstandOrUndefined(v: unknown): number | undefined {
    if(typeof v !== "number") return undefined;
    if(!Number.isFinite(v)) return undefined;
    const n = Math.trunc(v);
    if(n < 1 || n > 5) return undefined;
    return n;
}

function toRatingOrUndefined(v: unknown): number | undefined {
  if (typeof v !== "number") return undefined;
  if (!Number.isFinite(v)) return undefined;
  const n = Math.trunc(v);
  if (n < 1 || n > 5) return undefined;
  return n;
}

function toConfusedTextOrUndefined(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if(!t) return undefined;
    //Kepp bounded(privacy and storage safety)
    return t.slice(0, 800);
}

function toShortTextOrUndefined(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v !== "number") return undefined;
  if (!Number.isFinite(v)) return undefined;
  return v;
}

function toEnumOrUndefined<T extends string>(
  v: unknown,
  allowed: ReadonlySet<T>,
): T | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim() as T;
  return allowed.has(t) ? t : undefined;
}

function toStringArrayOrUndefined<T extends string>(
  v: unknown,
  allowed: ReadonlySet<T>,
  maxItems = 6,
  maxLen = 40,
): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const next: T[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") continue;
    const t = entry.trim() as T;
    if (!t || t.length > maxLen) continue;
    if (!allowed.has(t)) continue;
    if (!next.includes(t)) next.push(t);
    if (next.length >= maxItems) break;
  }
  return next.length ? next : undefined;
}

const SCREEN_OPTIONS = new Set(["home", "lesson", "review", "other"]);
const INTENT_OPTIONS = new Set(["start", "continue", "review", "change_settings", "exploring"]);
const CROWD_OPTIONS = new Set(["not_at_all", "a_little", "yes_a_lot"]);
const FELT_BEST_OPTIONS = new Set([
  "continue_card",
  "units",
  "optional_review",
  "calm_tone",
  "other",
]);
const LESSON_FEEDBACK_TYPES = new Set(["lesson_end", "friction"]);
const LESSON_QUICK_TAGS = new Set([
  "too_hard",
  "too_easy",
  "confusing_instructions",
  "answer_checking_unfair",
  "good_pace",
  "helpful_hints",
]);
const RETURN_TOMORROW_OPTIONS = new Set(["yes", "maybe", "no"]);
const CLARITY_OPTIONS = new Set([
  "very_clear",
  "mostly_clear",
  "somewhat_confusing",
  "very_confusing",
]);
const PACE_OPTIONS = new Set(["too_slow", "just_right", "too_fast"]);
const ANSWER_CHECKING_OPTIONS = new Set(["fair", "mostly_fair", "unfair", "not_sure"]);
const FRICTION_TYPE_OPTIONS = new Set([
  "instructions",
  "vocab",
  "grammar",
  "evaluation_unfair",
  "other",
]);
const SUPPORT_LEVEL_OPTIONS = new Set(["high", "medium", "low"]);
const EVAL_RESULTS = new Set(["correct", "almost", "wrong"]);

function toAnonSessionIdOrGenerated(v: unknown): string {
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length >= 8 && t.length <= 80 && /^[A-Za-z0-9_-]+$/.test(t)) return t;
  }
  return crypto.randomUUID();
}

export async function submitFeedback(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return sendError(res, 400, "userId is required", "INVALID_REQUEST");
  }

  const feltRushed = toBooleanOrUndefined(body.feltRushed);
  const helpedUnderstand = toHelpedUnderstandOrUndefined(body.helpedUnderstand);
  const confusedText = toConfusedTextOrUndefined(body.confusedText);
  const improveText = toConfusedTextOrUndefined(body.improveText);

  const screen = toEnumOrUndefined(body.screen, SCREEN_OPTIONS);
  const intent = toEnumOrUndefined(body.intent, INTENT_OPTIONS);
  const crowdedRating = toEnumOrUndefined(body.crowdedRating, CROWD_OPTIONS);
  const feltBest = toStringArrayOrUndefined(body.feltBest, FELT_BEST_OPTIONS);

  const hasAnyField =
    typeof feltRushed === "boolean" ||
    typeof helpedUnderstand === "number" ||
    typeof confusedText === "string" ||
    typeof improveText === "string" ||
    typeof intent === "string" ||
    typeof crowdedRating === "string" ||
    (Array.isArray(feltBest) && feltBest.length > 0);

  if (!hasAnyField) {
    return sendError(res, 400, "Please fill at least one feedback field.", "EMPTY_FEEDBACK");
  }

  const anonSessionId = toAnonSessionIdOrGenerated(body.anonSessionId);
  const userAnonId = sha256Short(userId);

  // Prefer server-derived context from the active session.
  const session = await getSession(userId);

  const languageFromBody = typeof body.language === "string" ? body.language.trim() : "";
  const lessonIdFromBody = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  const conceptTagFromBody = typeof body.conceptTag === "string" ? body.conceptTag.trim() : "";

  const lessonId = session?.lessonId || lessonIdFromBody;
  const language = (session?.language || languageFromBody).toString();

  if (!lessonId || !language) {
    return sendError(
      res,
      400,
      "lessonId and language are required when no active session exists",
      "MISSING_CONTEXT",
    );
  }

  let conceptTag: string | undefined = conceptTagFromBody || undefined;

  // Derive conceptTag from the current question when possible.
  if (!conceptTag && session) {
    const lesson = loadLesson(String(session.language), String(session.lessonId));
    if (lesson && Array.isArray(lesson.questions) && lesson.questions.length > 0) {
      const rawIndex =
        typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
      const idx = Math.min(Math.max(0, rawIndex), lesson.questions.length - 1);
      const q = lesson.questions[idx] as { conceptTag?: unknown } | undefined;
      const ct = q?.conceptTag;
      if (typeof ct === "string" && ct.trim()) conceptTag = ct.trim();
    }
  }

  const instructionLanguage = toShortTextOrUndefined(body.instructionLanguage, 12);
  const sessionKey = toShortTextOrUndefined(body.sessionKey, 120);
  const appVersion = toShortTextOrUndefined(body.appVersion, 80);
  const clientTimestamp = toShortTextOrUndefined(body.timestamp, 40);
  const targetLanguage = toShortTextOrUndefined(body.targetLanguage, 12);

  await LessonFeedbackModel.create({
    userAnonId,
    anonSessionId,
    lessonId,
    language,
    conceptTag,
    sessionState: session?.state,
    currentQuestionIndex: session?.currentQuestionIndex,
    feltRushed,
    helpedUnderstand,
    confusedText,
    improveText,
    screen,
    intent,
    crowdedRating,
    feltBest,
    targetLanguage,
    instructionLanguage,
    sessionKey,
    appVersion,
    clientTimestamp,
  });

  return res.status(201).json({ ok: true });
}

export async function submitLessonFeedback(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return sendError(res, 400, "userId is required", "INVALID_REQUEST");
  }

  const targetLanguage =
    typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  if (!targetLanguage || !lessonId) {
    return sendError(
      res,
      400,
      "targetLanguage and lessonId are required",
      "MISSING_CONTEXT",
    );
  }

  const feedbackType = toEnumOrUndefined(body.feedbackType, LESSON_FEEDBACK_TYPES);
  if (!feedbackType) {
    return sendError(res, 400, "feedbackType is required", "INVALID_REQUEST");
  }

  const ratingProvided = body.rating !== undefined && body.rating !== null;
  const rating = toRatingOrUndefined(body.rating);
  if (ratingProvided && typeof rating !== "number") {
    return sendError(res, 400, "rating must be between 1 and 5", "INVALID_RATING");
  }

  let freeText: string | undefined;
  if (typeof body.freeText === "string") {
    const trimmed = body.freeText.trim();
    if (trimmed.length > 500) {
      return sendError(res, 400, "freeText is too long", "TEXT_TOO_LONG");
    }
    if (trimmed) freeText = trimmed;
  }

  const quickTags = toStringArrayOrUndefined(body.quickTags, LESSON_QUICK_TAGS, 8, 40);

  let forcedChoice:
    | {
        returnTomorrow?: string;
        clarity?: string;
        pace?: string;
        answerChecking?: string;
        frictionType?: string;
      }
    | undefined;
  if (body.forcedChoice !== undefined) {
    if (!body.forcedChoice || typeof body.forcedChoice !== "object" || Array.isArray(body.forcedChoice)) {
      return sendError(res, 400, "forcedChoice must be an object", "INVALID_FORCED_CHOICE");
    }
    const raw = body.forcedChoice as Record<string, unknown>;

    const returnTomorrow = toEnumOrUndefined(raw.returnTomorrow, RETURN_TOMORROW_OPTIONS);
    if (raw.returnTomorrow !== undefined && !returnTomorrow) {
      return sendError(res, 400, "returnTomorrow is invalid", "INVALID_FORCED_CHOICE");
    }

    const clarity = toEnumOrUndefined(raw.clarity, CLARITY_OPTIONS);
    if (raw.clarity !== undefined && !clarity) {
      return sendError(res, 400, "clarity is invalid", "INVALID_FORCED_CHOICE");
    }

    const pace = toEnumOrUndefined(raw.pace, PACE_OPTIONS);
    if (raw.pace !== undefined && !pace) {
      return sendError(res, 400, "pace is invalid", "INVALID_FORCED_CHOICE");
    }

    const answerChecking = toEnumOrUndefined(raw.answerChecking, ANSWER_CHECKING_OPTIONS);
    if (raw.answerChecking !== undefined && !answerChecking) {
      return sendError(res, 400, "answerChecking is invalid", "INVALID_FORCED_CHOICE");
    }

    const frictionType = toEnumOrUndefined(raw.frictionType, FRICTION_TYPE_OPTIONS);
    if (raw.frictionType !== undefined && !frictionType) {
      return sendError(res, 400, "frictionType is invalid", "INVALID_FORCED_CHOICE");
    }

    if (returnTomorrow || clarity || pace || answerChecking || frictionType) {
      forcedChoice = { returnTomorrow, clarity, pace, answerChecking, frictionType };
    }
  }

  const hasAnyField =
    typeof rating === "number" || typeof freeText === "string" || (quickTags?.length ?? 0) > 0;

  if (!hasAnyField && !forcedChoice) {
    return sendError(res, 400, "Please fill at least one feedback field.", "EMPTY_FEEDBACK");
  }

  const instructionLanguage = toShortTextOrUndefined(body.instructionLanguage, 12);
  const supportLevel = toEnumOrUndefined(body.supportLevel, SUPPORT_LEVEL_OPTIONS);
  const sessionId = toShortTextOrUndefined(body.sessionId, 160);
  const clientTimestamp =
    toShortTextOrUndefined(body.createdAt, 40) ?? toShortTextOrUndefined(body.timestamp, 40);

  const context = (body.context ?? {}) as Record<string, unknown>;
  const questionIdRaw = context.questionId ?? "";
  const questionId =
    typeof questionIdRaw === "string" || typeof questionIdRaw === "number"
      ? String(questionIdRaw)
      : undefined;
  const conceptTag =
    toShortTextOrUndefined(context.conceptTag, 80) ??
    toShortTextOrUndefined(body.conceptTag, 80);
  const attemptsOnQuestion = toNumberOrUndefined(context.attemptsOnQuestion);
  const promptStyle = toShortTextOrUndefined(context.promptStyle, 40);
  const evaluationResult = toEnumOrUndefined(context.evaluationResult, EVAL_RESULTS);
  const reasonCode = toShortTextOrUndefined(context.reasonCode, 40);

  const anonSessionId = toAnonSessionIdOrGenerated(sessionId);
  const userAnonId = sha256Short(userId);

  await LessonFeedbackModel.create({
    userAnonId,
    anonSessionId,
    lessonId,
    language: targetLanguage,
    targetLanguage,
    instructionLanguage,
    sessionId,
    supportLevel,
    feedbackType,
    rating,
    quickTags,
    freeText,
    forcedChoice,
    questionId,
    conceptTag,
    attemptsOnQuestion,
    promptStyle,
    evaluationResult,
    reasonCode,
    clientTimestamp,
  });

  return res.status(201).json({ ok: true });
}
