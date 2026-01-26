//backend/src/controllers/practiceController.ts

import type { Request, Response } from "express";
import { loadLesson } from "../state/lessonLoader";
import type { PracticeMetaType, SupportedLanguage } from "../types";
import { generatePracticeItem } from "../services/practiceGenerator";
import { generatePracticeJSON } from "../ai/openaiClient";
import { getSession, updateSession } from "../storage/sessionStore";

function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === "en" || v === "de" || v === "es" || v === "fr";
}

function isPracticeMetaType(v: unknown): v is PracticeMetaType {
  return v === "variation" || v === "dialogue_turn" || v === "cloze";
}

export const generatePractice = async (req: Request, res: Response) => {
  const { userId, lessonId, language, sourceQuestionId, type, conceptTag } = req.body ?? {};

  if (typeof userId !== "string" || userId.trim() === "") {
    return res.status(400).json({ error: "userId is required" });
  }

  if (typeof lessonId !== "string" || lessonId.trim() === "") {
    return res.status(400).json({ error: "LessonId is required" });
  }

  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ error: "language must be one of en, de, es, fr" });
  }

  const lesson = loadLesson(language, lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }

  const q =
    typeof sourceQuestionId === "number"
      ? lesson.questions.find((x) => x.id === sourceQuestionId)
      : lesson.questions[0];

  if (!q) {
    return res.status(404).json({ error: "Source question not found" });
  }

  const practiceType: PracticeMetaType = isPracticeMetaType(type) ? type : "variation";
  const tag = typeof conceptTag === "string" && conceptTag.trim() ? conceptTag.trim() : `q${q.id}`;

  const aiClient = {
    generatePracticeJSON,
  };

  const { item: practiceItem, source } = await generatePracticeItem(
    {
      language,
      lessonId,
      sourceQuestionText: q.question,
      expectedAnswerRaw: q.answer,
      examples: q.examples,
      conceptTag: tag,
      type: practiceType,
    },
    aiClient,
  );

  const session = await getSession(userId);
  if (!session) {
    return res.status(404).json({ error: "Session not found. Start a lesson first." });
  }

  // ---- Map-based persistence (primary path) ----
  const pb: any = (session as any).practiceById ?? new Map();
  if (typeof pb.set === "function") pb.set(practiceItem.practiceId, practiceItem);
  else pb[practiceItem.practiceId] = practiceItem;
  (session as any).practiceById = pb;

  const pa: any = (session as any).practiceAttempts ?? new Map();
  if (typeof pa.get === "function") {
    if (pa.get(practiceItem.practiceId) === undefined) pa.set(practiceItem.practiceId, 0);
  } else {
    if (pa[practiceItem.practiceId] === undefined) pa[practiceItem.practiceId] = 0;
  }
  (session as any).practiceAttempts = pa;

  await updateSession(session as any);

  return res.status(200).json({ practiceItem, source });
};
