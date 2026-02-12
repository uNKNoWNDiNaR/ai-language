//backend/src/controllers/practiceController.ts

import type { Request, Response } from "express";
import { loadLesson, type LessonQuestion } from "../state/lessonLoader";
import type { PracticeMetaType, SupportedLanguage } from "../types";
import { generatePracticeItem } from "../services/practiceGenerator";
import { generateQuickReviewItems } from "../services/quickReviewGenerator";
import { generatePracticeJSON } from "../ai/openaiClient";
import { getSession, updateSession, createSession } from "../storage/sessionStore";
import { getWeakestConceptTag, getRecentConfusionConceptTag } from "../storage/learnerProfileStore";
import { mapLikeHas, mapLikeSet } from "../utils/mapLike";
import { sendError } from "../http/sendError";

function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === "en" || v === "de" || v === "es" || v === "fr";
}

function isPracticeMetaType(v: unknown): v is PracticeMetaType {
  return v === "variation" || v === "dialogue_turn" || v === "cloze";
}

type PracticeMode = "normal" | "quick_review";

function isPracticeMode(v: unknown): v is PracticeMode {
  return v === "normal" || v === "quick_review";
}

function extractQuestionHints(q: LessonQuestion): { hint?: string; hints?: string[] } {
  const hintTarget =
    typeof (q as any).hintTarget === "string" ? (q as any).hintTarget.trim() : "";
  const hintLegacy = typeof q.hint === "string" ? q.hint.trim() : "";
  const hints = Array.isArray((q as any).hints)
    ? (q as any).hints
        .map((h: unknown) => (typeof h === "string" ? h.trim() : ""))
        .filter(Boolean)
    : [];
  const hint = hintTarget || hintLegacy;
  return {
    ...(hint ? { hint } : {}),
    ...(hints.length ? { hints } : {}),
  };
}

export const generatePractice = async (req: Request, res: Response) => {
  const { userId, lessonId, language, sourceQuestionId, type, conceptTag, mode } = req.body ?? {};

  if (typeof userId !== "string" || userId.trim() === "") {
    return sendError(res, 400, "userId is required", "INVALID_REQUEST");
  }

  if (typeof lessonId !== "string" || lessonId.trim() === "") {
    return sendError(res, 400, "lessonId is required", "INVALID_REQUEST");
  }

  if (!isSupportedLanguage(language)) {
    return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
  }

  const lesson = loadLesson(language, lessonId);
  if (!lesson) {
    return sendError(res, 404, "Lesson not found", "NOT_FOUND");
  }

  const practiceMode: PracticeMode = isPracticeMode(mode) ? mode : "normal";

  if (practiceMode === "quick_review") {
    const session = await getSession(userId);
    if (!session) {
      return sendError(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
    }

    const { items, practiceItems } = generateQuickReviewItems({
      lesson,
      language,
      attemptCountByQuestionId: (session as any).attemptCountByQuestionId,
      maxItems: 3,
    });

    if (items.length === 0) {
      return sendError(res, 404, "Quick review items not found", "NOT_FOUND");
    }

    let pb: any = (session as any).practiceById ?? new Map();
    let pa: any = (session as any).practiceAttempts ?? new Map();

    for (const practiceItem of practiceItems) {
      pb = mapLikeSet(pb, practiceItem.practiceId, practiceItem);
      if (!mapLikeHas(pa, practiceItem.practiceId)) {
        pa = mapLikeSet(pa, practiceItem.practiceId, 0);
      }
    }

    (session as any).practiceById = pb;
    (session as any).practiceAttempts = pa;
    if (typeof (session as any).markModified === "function") {
      (session as any).markModified("practiceById");
      (session as any).markModified("practiceAttempts");
    }

    await updateSession(session as any);

    return res.status(200).json({ items });
  }

  let q =
    typeof sourceQuestionId === "number"
      ? lesson.questions.find((x) => x.id === sourceQuestionId)
      : undefined;

  if (typeof sourceQuestionId === "number" && !q) {
    return sendError(res, 404, "Source question not found", "NOT_FOUND");
  }

  if (!q) {
    const requestedTag =
      typeof conceptTag === "string" && conceptTag.trim() ? conceptTag.trim() : "";

    let recentTag: string | null = null;
    try {
      recentTag =
        typeof getRecentConfusionConceptTag === "function"
          ? await getRecentConfusionConceptTag(userId, language)
          : null;
    } catch {
      recentTag = null;
    }

    const weakest = await getWeakestConceptTag(userId, language);

    if (requestedTag) {
      q = lesson.questions.find((x) => x.conceptTag === requestedTag);
    }

    if (!q && recentTag) {
      q = lesson.questions.find((x) => x.conceptTag === recentTag);
    }

    if (!q && weakest) {
      q = lesson.questions.find((x) => x.conceptTag === weakest);
    }

    if (!q) q = lesson.questions[0];
  }


  if (!q) {
    return sendError(res, 404, "Source question not found", "NOT_FOUND");
  }


  const practiceType: PracticeMetaType = isPracticeMetaType(type) ? type : "variation";
  const tag =
    typeof q.conceptTag === "string" && q.conceptTag.trim()
      ? q.conceptTag.trim()
      : typeof conceptTag === "string" && conceptTag.trim()
        ? conceptTag.trim()
        : `lesson-${lessonId}-q${q.id}`;

  const aiClient = {
    generatePracticeJSON,
  };

  const { item: practiceItem, source } = await generatePracticeItem(
    {
      language,
      lessonId,
      sourceQuestionText: q.question || q.prompt || "",
      expectedAnswerRaw: q.answer,
      examples: q.examples,
      conceptTag: tag,
      type: practiceType,
    },
    aiClient,
    { forceEnabled: true },
  );

  const questionHints = extractQuestionHints(q);
  if (questionHints.hint) practiceItem.hint = questionHints.hint;
  if (questionHints.hints) practiceItem.hints = questionHints.hints;

  const session = await getSession(userId);
  if (!session) {
    return sendError(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
  }

  // ---- Practice persistence (Map or object, depending on runtime) ----
  let pb: any = (session as any).practiceById ?? new Map();
  let pa: any = (session as any).practiceAttempts ?? new Map();

  pb = mapLikeSet(pb, practiceItem.practiceId, practiceItem);
  if (!mapLikeHas(pa, practiceItem.practiceId)) {
    pa = mapLikeSet(pa, practiceItem.practiceId, 0);
  }

  (session as any).practiceById = pb;
  (session as any).practiceAttempts = pa;
  if (typeof (session as any).markModified === "function") {
    (session as any).markModified("practiceById");
    (session as any).markModified("practiceAttempts");
  }

  await updateSession(session as any);

  return res.status(200).json({ practiceItem, source });
};

type ReviewRequestItem = {
  lessonId?: unknown;
  questionId?: unknown;
};

function parseReviewItems(raw: unknown): Array<{ lessonId: string; questionId: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ lessonId: string; questionId: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const lessonId = typeof (entry as any).lessonId === "string" ? (entry as any).lessonId.trim() : "";
    const questionIdRaw = (entry as any).questionId;
    const questionId = typeof questionIdRaw === "string" ? questionIdRaw.trim() : String(questionIdRaw ?? "").trim();
    if (!lessonId || !questionId) continue;
    out.push({ lessonId, questionId });
  }
  return out;
}

export const generateReview = async (req: Request, res: Response) => {
  const { userId, language, items } = req.body ?? {};

  if (typeof userId !== "string" || userId.trim() === "") {
    return sendError(res, 400, "userId is required", "INVALID_REQUEST");
  }

  if (!isSupportedLanguage(language)) {
    return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
  }

  const requested = parseReviewItems(items).slice(0, 2);
  if (requested.length === 0) {
    return sendError(res, 400, "items are required", "INVALID_REQUEST");
  }

  let session = await getSession(userId);
  if (!session) {
    const fallbackLessonId = requested[0]?.lessonId;
    if (!fallbackLessonId) {
      return sendError(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
    }

    await createSession({
      userId,
      lessonId: fallbackLessonId,
      language,
      state: "COMPLETE",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
      attemptCountByQuestionId: new Map(),
      lastAnswerByQuestionId: new Map(),
      practiceById: new Map(),
      practiceAttempts: new Map(),
      practiceCooldownByQuestionId: new Map(),
    } as any);

    session = await getSession(userId);
  }

  if (!session) {
    return sendError(res, 404, "Session not found. Start a lesson first.", "NOT_FOUND");
  }

  const aiClient = { generatePracticeJSON };

  const practiceItems: Array<{
    practiceId: string;
    prompt: string;
    lessonId: string;
    questionId: string;
    conceptTag: string;
  }> = [];

  let pb: any = (session as any).practiceById ?? new Map();
  let pa: any = (session as any).practiceAttempts ?? new Map();

  for (const reqItem of requested) {
    const lesson = loadLesson(language, reqItem.lessonId);
    if (!lesson) continue;

    const q = lesson.questions.find((x) => String(x.id) === reqItem.questionId);
    if (!q) continue;

    const conceptTag =
      typeof q.conceptTag === "string" && q.conceptTag.trim()
        ? q.conceptTag.trim()
        : `lesson-${reqItem.lessonId}-q${q.id}`;

    try {
      const { item: practiceItem } = await generatePracticeItem(
        {
          language,
          lessonId: reqItem.lessonId,
          sourceQuestionText: q.question,
          expectedAnswerRaw: q.answer,
          examples: q.examples,
          conceptTag,
          type: "variation",
        },
        aiClient,
        { forceEnabled: true },
      );

      const questionHints = extractQuestionHints(q);
      if (questionHints.hint) practiceItem.hint = questionHints.hint;
      if (questionHints.hints) practiceItem.hints = questionHints.hints;

      practiceItem.meta = {
        ...practiceItem.meta,
        reviewRef: { lessonId: reqItem.lessonId, questionId: reqItem.questionId },
      };

      pb = mapLikeSet(pb, practiceItem.practiceId, practiceItem);
      if (!mapLikeHas(pa, practiceItem.practiceId)) {
        pa = mapLikeSet(pa, practiceItem.practiceId, 0);
      }

      practiceItems.push({
        practiceId: practiceItem.practiceId,
        prompt: practiceItem.prompt,
        lessonId: practiceItem.lessonId,
        questionId: reqItem.questionId,
        conceptTag: practiceItem.meta.conceptTag,
      });
    } catch {
      // Skip failed item generation (best-effort)
      continue;
    }
  }

  if (practiceItems.length === 0) {
    return sendError(res, 404, "Review items not found", "NOT_FOUND");
  }

  (session as any).practiceById = pb;
  (session as any).practiceAttempts = pa;
  if (typeof (session as any).markModified === "function") {
    (session as any).markModified("practiceById");
    (session as any).markModified("practiceAttempts");
  }
  await updateSession(session as any);

  return res.status(200).json({ practice: practiceItems });
};
