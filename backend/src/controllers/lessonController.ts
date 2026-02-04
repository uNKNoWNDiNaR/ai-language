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
  type ExplanationDepth,
} from "../ai/staticTutorMessages";

import { LessonProgressModel } from "../state/progressState";
import { generatePracticeItem } from "../services/practiceGenerator";
import { PracticeMetaType } from "../types";
import type { SupportedLanguage } from "../types";
import { isTutorMessageAcceptable, buildTutorFallback } from "../ai/tutorOutputGuard";

import {
  recordLessonAttempt,
  getLearnerProfileSummary,
  getLearnerTopFocusReason,
  getConceptMistakeCount,
  getTeachingProfilePrefs,
} from "../storage/learnerProfileStore";

import { isPracticeGenEnabled } from "../config/featureFlags";

import {
  normalizeLanguage,
  isSupportedLanguage,
  getTutorIntent,
  chooseHintForAttempt,
  buildProgressPayload,
} from "./lessonHelpers";

import { mapLikeGetNumber, mapLikeHas, mapLikeSet } from "../utils/mapLike";

const FORCED_ADVANCE_PRACTICE_THRESHOLD = 2;

async function ensureTutorPromptOnResume(session: any): Promise<string | null> {
  const last = session.messages?.[session.messages.length - 1];
  if (last && last.role === "assistant") return null;

  const lesson = loadLesson(session.language, session.lessonId);
  if (!lesson) return null;

  const idx = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
  const q = lesson.questions[idx];
  const questionText = q ? q.question : "";

  let intent: TutorIntent;
  if (session.state === "COMPLETE") intent = "END_LESSON";
  else if (session.state === "ADVANCE") intent = "ADVANCE_LESSON";
  else intent = "ASK_QUESTION";

  const tutorPrompt = buildTutorPrompt(session as any, intent, questionText);

  let tutorMessage: string;
  try {
    tutorMessage = await generateTutorResponse(tutorPrompt, intent, { language: session.language });
  } catch {
    tutorMessage = "I'm having trouble responding right now. Please try again later.";
  }

  if (
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

  session.messages = session.messages || [];
  session.messages.push({ role: "assistant", content: tutorMessage });
  await session.save();

  return tutorMessage;
}

//----------------------
// Start lesson
//----------------------
export const startLesson = async (req: Request, res: Response) => {
  const { userId, language, lessonId, restart } = req.body;

  const lang = normalizeLanguage(language);

  if (!userId) return res.status(400).json({ error: "UserId is required" });
  if (!lang || !lessonId) return res.status(400).json({ error: "Language and lessonId are required" });

  try {
    let session = await LessonSessionModel.findOne({ userId });

    if (session) {
      const sameLesson = session.lessonId === lessonId && session.language === lang;
      if (sameLesson) {
        if (restart === true) {
          await LessonProgressModel.deleteOne({ userId });
          session = null;
        } else {
          const resumeLesson = loadLesson(session.language, session.lessonId);
          const progress = resumeLesson ? buildProgressPayload(session, resumeLesson) : undefined;
          const tutorMessage = await ensureTutorPromptOnResume(session);

          return res.status(200).json({
            session,
            ...(tutorMessage ? { tutorMessage } : {}),
            ...(progress ? { progress } : {}),
          });
        }
      }

      await LessonSessionModel.deleteOne({ userId });
      session = null;
    }

    const lesson: Lesson | null = loadLesson(lang, lessonId);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const newSession: LessonSession = {
      userId,
      lessonId,
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4,
      currentQuestionIndex: 0,
      messages: [],
      language: lang,
    };

    const firstQuestion = lesson.questions[0];
    const intent: TutorIntent = "ASK_QUESTION";
    const tutorPrompt = buildTutorPrompt(newSession, intent, firstQuestion.question);

    let tutorMessage: string;
    try {
      tutorMessage = await generateTutorResponse(tutorPrompt, intent, { language: lang });
    } catch {
      tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }

    if (
      !isTutorMessageAcceptable({
        intent,
        language: lang,
        message: tutorMessage,
        questionText: firstQuestion.question,
      })
    ) {
      tutorMessage = buildTutorFallback({
        intent,
        language: lang,
        message: tutorMessage,
        questionText: firstQuestion.question,
      });
    }

    const intitialMessage = { role: "assistant", content: tutorMessage };
    session = await LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });

    await LessonProgressModel.updateOne(
      { userId, language: lang, lessonId },
      {
        $setOnInsert: { status: "in_progress" },
        $set: {
          currentQuestionIndex: 0,
          lastActiveAt: new Date(),
        },
      },
      { upsert: true }
    );

    const progress = buildProgressPayload(session, lesson);

    return res.status(201).json({ session, tutorMessage, progress });
  } catch (err) {
    console.error("Start lesson error", err);
    return res.status(500).json({ error: "Server error" });
  }
};

//----------------------
// Submit answer
//----------------------
export const submitAnswer = async (req: Request, res: Response) => {
  try {
    const { userId, answer, language, lessonId } = req.body;
    if (!userId || typeof answer !== "string") {
      return res.status(400).json({ error: "Invalid Payload (userId and answer are required)" });
    }

    const session = await LessonSessionModel.findOne({ userId });
    if (!session) return res.status(404).json({ error: "No active session found" });

    if (!session.language && isSupportedLanguage(String(language || "").trim().toLowerCase())) {
      session.language = String(language).trim().toLowerCase();
    }
    if (!session.lessonId && typeof lessonId === "string") session.lessonId = lessonId;

    if (!session.language || !session.lessonId) {
      return res.status(409).json({
        error: "Session missing language/lessonId. Please restart the lesson",
        code: "SESSION_INCMPLETE",
      });
    }

    const lesson: Lesson | null = loadLesson(session.language, session.lessonId);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    if (session.state === "COMPLETE") {
      const progress = buildProgressPayload(session, lesson, "completed");
      return res.status(200).json({ progress, session });
    }

    session.messages.push({ role: "user", content: answer });

    const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const currentQuestion = lesson.questions[currentIndex];

    if (!currentQuestion) {
      return res.status(409).json({
        error: "Session out of sync with lesson content. Please restart the lesson",
        code: "SESSION_OUT_OF_SYNC",
      });
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

    const hintObj = chooseHintForAttempt(currentQuestion, attemptCount);
    const hintForResponse = hintObj;
    const hintTextForPrompt = hintObj ? hintObj.text : "";

    let markNeedsReview = false;

    if (isCorrect) {
      attemptMap.set(qid, 0);

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

    const baseStatus =
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
        conceptTag: currentQuestion?.conceptTag,
      });
    } catch {
      // ignore
    }

    const intent = getTutorIntent(session.state, isCorrect, markNeedsReview);

    const safeIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
    const questionText =
      session.state !== "COMPLETE" && lesson.questions[safeIndex] ? lesson.questions[safeIndex].question : "";

    const revealAnswer = intent === "FORCED_ADVANCE" ? String(currentQuestion.answer || "").trim() : "";

    const retryMessage =
      intent === "ENCOURAGE_RETRY"
        ? getDeterministicRetryMessage({
            reasonCode: evaluation.reasonCode,
            attemptCount,
            repeatedSameWrong,
          })
        : "";

    const forcedAdvanceMessage = intent === "FORCED_ADVANCE" ? getForcedAdvanceMessage() : "";

    const hintLeadIn = intent === "ENCOURAGE_RETRY" && hintTextForPrompt ? getHintLeadIn(attemptCount) : "";

    let teachingPace: "slow" | "normal" = "normal";
    let explanationDepth: ExplanationDepth = "normal";

    try {
      const prefs =
        typeof getTeachingProfilePrefs === "function"
          ? await getTeachingProfilePrefs(session.userId, session.language as SupportedLanguage)
          : null;

      if (prefs) {
        teachingPace = prefs.pace;
        explanationDepth = prefs.explanationDepth;
      }
    } catch {
      // ignore
    }

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
        focusNudge = getFocusNudge(topFocusReason);
      }
    } catch {
      focusNudge = "";
    }

    const pacePrefix = teachingPace === "slow" ? "Take your time." : "";

    const hintLeadInWithFocus =
      intent === "ENCOURAGE_RETRY" && hintTextForPrompt
        ? [pacePrefix, focusNudge, hintLeadIn]
            .filter((s): s is string => Boolean(s && s.trim()))
            .join(" ")
            .trim()
        : hintLeadIn;

    const forcedAdvanceMessageWithFocus = intent === "FORCED_ADVANCE" ? forcedAdvanceMessage : forcedAdvanceMessage;

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

    let tutorPrompt: string;
    try {
      tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
        retryMessage,
        hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        hintLeadIn: hintLeadInWithFocus,
        forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
        revealAnswer: "",
        learnerProfileSummary: learnerProfileSummary ?? undefined,
        explanationText: "",
      });
    } catch {
      tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
        retryMessage,
        hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        hintLeadIn,
        forcedAdvanceMessage,
        revealAnswer: "",
        learnerProfileSummary: learnerProfileSummary ?? undefined,
        explanationText: intent === "FORCED_ADVANCE" ? (currentQuestion?.explanation ?? "") : "",
      });
    }

    let tutorMessage: string;
    try {
      tutorMessage = await generateTutorResponse(tutorPrompt, intent, { language: session.language });
    } catch {
      tutorMessage = "I'm having trouble responding right now. please try again.";
    }

    if (
      !isTutorMessageAcceptable({
        intent,
        language: session.language,
        message: tutorMessage,
        questionText,
        retryMessage,
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
        retryMessage,
        hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
        hintLeadIn: hintLeadInWithFocus,
        forcedAdvanceMessage: forcedAdvanceMessageWithFocus,
        revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
      });
    }

    session.messages.push({ role: "assistant", content: tutorMessage });
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
            sourceQuestionText: currentQuestion.question,
            expectedAnswerRaw: currentQuestion.answer,
            conceptTag: practiceConceptTag,
            type: practiceType,
          },
          aiClient
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
    });
  } catch (err) {
    console.error("Submit answer error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

//----------------------
// Get session (debug)
//----------------------
export const getSessionHandler = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).json({ error: "UserId is required" });

  try {
    const session = await LessonSessionModel.findOne({ userId });
    if (!session) return res.status(404).json({ error: "No active sessions found" });

    const tutorMessage = await ensureTutorPromptOnResume(session);

    const lesson = loadLesson(session.language, session.lessonId);
    const progress = lesson ? buildProgressPayload(session, lesson) : undefined;

    return res.status(200).json({
      session,
      messages: session.messages,
      ...(tutorMessage ? { tutorMessage } : {}),
      ...(progress ? { progress } : {}),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
};
