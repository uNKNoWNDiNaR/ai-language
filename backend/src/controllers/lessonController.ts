// src/controllers/lessonController.ts
// Day 2 MVP backend lesson loop and retry logic

import { LessonSessionModel } from "../state/sessionState";
import e, { Request, Response } from "express";
import { LessonSession, LessonState } from "../state/lessonState";
import { buildTutorPrompt } from "../ai/promptBuilder";
import { generateTutorResponse } from "../ai/openaiClient";
import { TutorIntent } from "../ai/tutorIntent";
import { Lesson, loadLesson } from "../state/lessonLoader";
import { evaluateAnswer } from "../state/answerEvaluator";
import { getDeterministicRetryMessage, getForcedAdvanceMessage, getHintLeadIn } from "../ai/staticTutorMessages";
import { LessonProgressModel } from "../state/progressState";
import { generatePracticeItem } from "../services/practiceGenerator";
import { generatePracticeJSON } from "../ai/openaiClient";
import { PracticeMetaType } from "../types";
import { isTutorMessageAcceptable, buildTutorFallback } from "../ai/tutorOutputGuard";



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
    tutorMessage = await generateTutorResponse(tutorPrompt, intent, {language: session.language});
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
// Helper: map state ->tutor intent
//----------------------
function getTutorIntent(state: LessonState, isCorrect?: boolean, markNeedsReview?: boolean): TutorIntent {
  if (state === "COMPLETE") return "END_LESSON";
  if (state === "ADVANCE") return markNeedsReview ? "FORCED_ADVANCE" : "ADVANCE_LESSON";
  if (isCorrect === false) return "ENCOURAGE_RETRY";
  return "ASK_QUESTION";
}

type HintResponse = { level: number; text: string };

function chooseHintForAttempt(question: any, attemptCount: number): HintResponse | undefined {
  // Attempt 1 -> no hint
  if (attemptCount <= 1) return undefined;

  // Support BOTH formats:
  // - hint?: string (legacy)
  // - hints?: string[] (new)
  const hintsArr: string[] = Array.isArray(question.hints) ? question.hints : [];
  const legacyHint: string = typeof question.hint === "string" ? question.hint : "";

  // Attempt 2 -> light hint
  // Attempt 3 -> stronger hint
  if (attemptCount === 2) {
    const text = (hintsArr[0] || legacyHint || "").trim();
    if (!text) return undefined;
    return { level: 1, text };
  }

  if (attemptCount === 3) {
    const text = (hintsArr[1] || hintsArr[0] || legacyHint || "").trim();
    if (!text) return undefined;
    return { level: 2, text };
  }

  // Attempt 4+ -> reveal answer + short explanation
  const reveal = `Answer: ${question.answer}. Explanation: this is the expected structure for this question.`;
  return { level: 3, text: reveal };
}


//----------------------
// Start lesson
//----------------------
export const startLesson = async (req: Request, res: Response) => {
  const { userId, language, lessonId, restart } = req.body;

  if (!userId) return res.status(400).json({ error: "UserId is required" });
  if (!language || !lessonId) return res.status(400).json({ error: "Language and lessonId are required" });

  try {
    let session = await LessonSessionModel.findOne({ userId });

    if (session) {
      const sameLesson = session.lessonId === lessonId && session.language === language;
      if (sameLesson) {
        if(restart === true) {
          await LessonProgressModel.deleteOne({userId});
          session = null;
        }
        else if(session.state === "COMPLETE") {
          const tutorMessage = await ensureTutorPromptOnResume(session);
          return res.status(200).json({ session, ...(tutorMessage ? { tutorMessage } : {}) });   
        }
        else{
          const tutorMessage = await ensureTutorPromptOnResume(session);
          return res.status(200).json({session, ...(tutorMessage ? {tutorMessage} : {}) })
        }
      }

      await LessonSessionModel.deleteOne({ userId });
      session = null;
    }

    const lesson: Lesson | null = loadLesson(language, lessonId);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const newSession: LessonSession = {
      userId,
      lessonId,
      state: "USER_INPUT",
      attempts: 0,
      maxAttempts: 4, // Phase 2.2 requires attempt 4+ behavior
      currentQuestionIndex: 0,
      messages: [],
      language,
    };

    const firstQuestion = lesson.questions[0];
    const intent: TutorIntent = "ASK_QUESTION";
    const tutorPrompt = buildTutorPrompt(newSession, intent, firstQuestion.question);

        let tutorMessage: string;
    try {
      tutorMessage = await generateTutorResponse(tutorPrompt, intent, {language: session.language});
    } catch {
      tutorMessage = "I'm having trouble responding right now. Please try again later.";
    }

    if (
      !isTutorMessageAcceptable({
        intent,
        language,
        message: tutorMessage,
        questionText: firstQuestion.question,
      })
    ) {
      tutorMessage = buildTutorFallback({
        intent,
        language,
        message: tutorMessage,
        questionText: firstQuestion.question,
      });
    }


    const intitialMessage = { role: "assistant", content: tutorMessage };
    session = await LessonSessionModel.create({ ...newSession, messages: [intitialMessage] });

    // Progress: first interaction => in_progress
    await LessonProgressModel.updateOne(
      { userId, language: language.trim().toLowerCase(), lessonId },
      {
        $setOnInsert: { status: "in_progress" },
        $set: {
          currentQuestionIndex: 0,
          lastActiveAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(201).json({ session, tutorMessage });
  } catch (err) {
    console.error("Start  lesson error", err);
    return res.status(500).json({ error: "Server error" });
  }
};

//----------------------
// Submit answer
//----------------------
export const submitAnswer = async (req: Request, res: Response) => {
try{
  const { userId, answer, language, lessonId } = req.body;
  if (!userId || typeof answer !== "string") {
    return res.status(400).json({ error: "Invalid Payload (userId and answer are required)" });
  }

  const session = await LessonSessionModel.findOne({ userId });
  if (!session) return res.status(404).json({ error: "No active session found" });

  // Keep legacy behavior: session fields only set if missing
  if (!session.language && typeof language === "string") session.language = language.trim().toLowerCase();
  if (!session.lessonId && typeof lessonId === "string") session.lessonId = lessonId;

  if(!session.language || !session.lessonId) {
    return res.status(409).json({
      error: "Session missing language/lessonId. Please restart the lesson",
      code: "SESSION_INCMPLETE"
    });
  }
  const lesson: Lesson | null = loadLesson(session.language, session.lessonId);

  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  session.messages.push({ role: "user", content: answer });

  const currentIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0 ;
  const currentQuestion = lesson.questions[currentIndex];

  if(!currentQuestion){
    return res.status(409).json({
      error: "Session out of sync with lesson content. Please restart the lesson",
      code: "SESSION_OUT_OF_SYNC"
    })
  }
  // Phase 2.2: per-question attempt count
  const qid = String(currentQuestion.id);
  const practiceCooldown: Map<string, number> = (session as any).practiceCooldownByQuestionId || new Map();
  const practiceCooldownActive = (practiceCooldown.get(qid) || 0) >= 1;
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

  // Evaluation (Phase 2.2)
  const evaluation = evaluateAnswer(currentQuestion, answer, session.language);
  const isCorrect = evaluation.result === "correct";

  // Hint selection (Phase 2.2)
  const hintObj = chooseHintForAttempt(currentQuestion, attemptCount);
  const hintForResponse = hintObj && hintObj.level < 3 ? hintObj : hintObj; // include reveal hint too
  const hintTextForPrompt = hintObj ? hintObj.text : "";

  let markNeedsReview = false;

  // Lesson progression rules:
  // - correct => advance/reset attempt count for this question
  // - wrong/almost:
  //    - attempt 1-3 => stay on question
  //    - attempt 4+ => move on AND mark needs_review AND count mistake
  if (isCorrect) {
    // reset per-question attempt count after correct
    practiceCooldown.set(qid, 0);
    (session as any).practiceCooldownByQuestionId = practiceCooldown as any;
    attemptMap.set(qid, 0);

    if (currentIndex + 1 >= lesson.questions.length) {
      session.state = "COMPLETE";
    } else {
      session.currentQuestionIndex = currentIndex + 1;
      session.state = "ADVANCE";
    }
  } else {
    // treat almost as retry (still not correct)
    if (attemptCount >= 4) {
      practiceCooldown.set(qid, 0);
      (session as any).practiceCooldownByQuestionId = practiceCooldown as any;


      // attempt 4+ => move on & mark review
      markNeedsReview = true;

      if (currentIndex + 1 >= lesson.questions.length) {
        session.state = "COMPLETE";
      } else {
        session.currentQuestionIndex = currentIndex + 1;
        session.state = "ADVANCE";
      }

    } else {
      // attempts 1-3 => retry same question
      session.state = "USER_INPUT";
    }
  }

  // ---- Progress persistence (Phase 2.2) ----
  // First interaction => in_progress
  // Finish last question => completed (unless needs_review triggered)
  // Repeated failures => needs_review
  const baseStatus =
    session.state === "COMPLETE"
      ? (markNeedsReview ? "needs_review" : "completed")
      : "in_progress";

  // mistakesByQuestion: increment when forced move-on at attempt 4+
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

  // ---- Deterministic retry message (Phase 2.2) ----
  const intent = getTutorIntent(session.state, isCorrect, markNeedsReview);

  const safeIndex = 
    typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;

  const questionText = 
    session.state !== "COMPLETE" && lesson.questions[safeIndex]
    ? lesson.questions[safeIndex].question 
    : "";

  const revealAnswer = 
    intent === "FORCED_ADVANCE" ? String(currentQuestion.answer || "").trim() : "";

  const retryMessage =
    intent === "ENCOURAGE_RETRY"
      ? getDeterministicRetryMessage({
          reasonCode: evaluation.reasonCode,
          attemptCount,
          repeatedSameWrong,
        })
      : "";

    const forcedAdvanceMessage =
    intent === "FORCED_ADVANCE" ? getForcedAdvanceMessage() : "";

  const hintLeadIn =
    intent === "ENCOURAGE_RETRY" && hintTextForPrompt
      ? getHintLeadIn(attemptCount)
      : "";

  const tutorPrompt = buildTutorPrompt(session as any, intent, questionText, {
    retryMessage,
    hintText: intent === "ENCOURAGE_RETRY" ? hintTextForPrompt : "",
    hintLeadIn,
    forcedAdvanceMessage,
    revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
  });


    let tutorMessage: string;
  try {
    tutorMessage = await generateTutorResponse(tutorPrompt, intent, {language: session.language});
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
      hintLeadIn,
      forcedAdvanceMessage,
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
      hintLeadIn,
      forcedAdvanceMessage,
      revealAnswer: intent === "FORCED_ADVANCE" ? revealAnswer : "",
    });
  }


  session.messages.push({ role: "assistant", content: tutorMessage });
  await session.save();

  let practice: {practiceId: string; prompt: string} | undefined;

  if(evaluation.result === "almost" && !practiceCooldownActive) {
    try {
      const aiClient = { generatePracticeJSON};

      const conceptTag = `lesson-${session.lessonId}-q${currentQuestion.id}`;
      const practiceType: PracticeMetaType = "variation";

      const { item: practiceItem } = await generatePracticeItem(
        {
          language: session.language,
          lessonId: session.lessonId,
          sourceQuestionText: currentQuestion.question,
          expectedAnswerRaw: currentQuestion.answer,
          conceptTag,
          type: practiceType
        },
        aiClient,
      );

      const pb: any = (session as any).practiceById ?? {};
      const pa: any = (session as any).practiceAttempts ?? {};

      if(typeof pb.set === "function") pb.set(practiceItem.practiceId, practiceItem);
      else pb[practiceItem.practiceId] = practiceItem;

      if(typeof pa.set === "function") {
        if(pa.get(practiceItem.practiceId) === undefined) pa.set(practiceItem.practiceId, 0);
      } else {
        if(pa[practiceItem.practiceId] === undefined) pa[practiceItem.practiceId] = 0;
      }

      (session as any).practiceById = pb;
      (session as any).practiceAttempts = pa;

      practiceCooldown.set(qid, 1);
      (session as any).practiceCooldownByQuestionId = practiceCooldown as any;

      await session.save();

      practice = {practiceId: practiceItem.practiceId, prompt: practiceItem.prompt};
    } catch(e) {
      practice = undefined;
    }
  }
  // Phase 2.2 required response additions:
  return res.status(200).json({
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
    return res.status(500).json({error: "Server error"})
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


    return res.status(200).json({
      session,
      messages: session.messages,
      ...(tutorMessage ? { tutorMessage } : {}),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch session" });
  }
};