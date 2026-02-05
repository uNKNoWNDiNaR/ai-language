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

function toConfusedTextOrUndefined(v: unknown): string | undefined {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    if(!t) return undefined;
    //Kepp bounded(privacy and storage safety)
    return t.slice(0, 800);
}

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

  const hasAnyField =
    typeof feltRushed === "boolean" ||
    typeof helpedUnderstand === "number" ||
    typeof confusedText === "string";

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
  });

  return res.status(201).json({ ok: true });
}
