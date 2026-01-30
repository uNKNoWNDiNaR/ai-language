//backend/src/controllers/practiceSubmitController.ts

import type { Request, Response } from "express";
import { getSession, updateSession } from "../storage/sessionStore";
import { evaluateAnswer } from "../state/answerEvaluator";
import type { LessonQuestion } from "../state/lessonLoader";
import type { PracticeItem } from "../types";
import { explainPracticeResult } from "../ai/practiceTutorEplainer";

function parseQuestionIdFromConceptTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const m = tag.match(/\bq(\d+)\b/i);
  return m ? String(Number(m[1])) : null;
}


function getHintForAttempt(item: PracticeItem, attemptCount: number): string | null {
  // attemptCount is 1-based
  if (attemptCount <= 1) return null;

  const hints = Array.isArray(item.hints)
    ? item.hints.map((h) => (typeof h === "string" ? h.trim() : "")).filter(Boolean)
    : [];
  const hint = typeof item.hint === "string" ? item.hint.trim() : "";

  if (attemptCount === 2) return hints[0] || hint || null;
  if (attemptCount === 3) return hints[1] || hints[0] || hint || null;

  // Attempt 4+
  return `Answer: ${item.expectedAnswerRaw}`;
}

function buildTutorMessage(result: "correct" | "almost" | "wrong", hint: string | null): string {
  if (result === "correct") return "Nice — that’s correct.";
  if (result === "almost") return hint ? `Almost. ${hint}` : "Almost. Try again.";
  return hint ? `Not quite. ${hint}` : "Not quite. Try again.";
}

function stripDebugPrefixes(text: string): string {
  if (!text) return text;
  // Strip common internal/debug label prefixes (colon, dash, arrow variants)
  const prefix =
    /^(\s*(Result|Reason|Expected\s*Answer|Expected|User\s*Answer|Your\s*Answer)\s*[:\-–—>]+\s*)/i;

  const cleaned = text
    .split(/\r?\n/)
    .map((line) => {
      const l = line.trimEnd();
      if (!l.trim()) return "";
      const without = l.replace(prefix, "").trim();
      return without;
    })
    .filter((l) => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

function looksInternal(text: string): boolean {
  if (!text) return true;
  const labelLeak =
    /(^|\n)\s*(result|reason|expected(\s*answer)?|user\s*answer|your\s*answer)\s*[:\-–—>]/i;
  if (labelLeak.test(text)) return true;
  // Too-short outputs are usually not user-facing (e.g. "almost")
  if (text.trim().length < 8) return true;
  return false;
}


export const submitPractice = async (req: Request, res: Response) => {
  const { userId, practiceId, answer } = req.body ?? {};

  if (typeof userId !== "string" || userId.trim() === "") {
    return res.status(400).json({ error: "userId is required" });
  }
  if (typeof practiceId !== "string" || practiceId.trim() === "") {
    return res.status(400).json({ error: "practiceId is required" });
  }
  if (typeof answer !== "string" || answer.trim() === "") {
    return res.status(400).json({ error: "answer is required" });
  }

  const session = await getSession(userId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }


  const practiceById: any = (session as any).practiceById ?? {};
  const item: PracticeItem | undefined =
   typeof practiceById.get === "function" ? practiceById.get(practiceId) : practiceById[practiceId];


  if (!item) {
    return res.status(404).json({ error: "Practice item not found" });
  }

  const practiceAttempts: any = (session as any).practiceAttempts ?? {};
  const prev = 
    typeof practiceAttempts.get === "function"
    ? (practiceAttempts.get(practiceId) ?? 0)
    : (typeof practiceAttempts[practiceId] === "number" ? practiceAttempts[practiceId] : 0);

  const attemptCount = prev + 1;

  if(typeof practiceAttempts.set === "function") practiceAttempts.set(practiceId, attemptCount);
  else practiceAttempts[practiceId] = attemptCount;

  (session as any).practiceAttempts = practiceAttempts;

  // Adapt PracticeItem -> LessonQuestion for your existing evaluator
  const q: LessonQuestion = {
    id: 0,
    question: item.prompt,
    answer: item.expectedAnswerRaw,
    hint: typeof item.hint === "string" ? item.hint : undefined,
    examples: item.examples,
  };

  const evalRes = evaluateAnswer(q, answer, item.language);

  const hint = getHintForAttempt(item, attemptCount);

  const baseMessage = buildTutorMessage(evalRes.result, hint);

let explanation: string | null = null;

// Only add an explanation when it helps learning without overpacking:
// - correct: short "why it works"
// - almost/wrong: only after attempt 2/3 (attempt 1 stays "try again"; attempt 4+ reveals answer)
const shouldExplain =
  evalRes.result === "correct" ||
  ((evalRes.result === "almost" || evalRes.result === "wrong") && attemptCount >= 2 && attemptCount <= 3);

if (shouldExplain) {
  try {
    explanation = await explainPracticeResult({
      language: item.language,
      result: evalRes.result,
      reasonCode: evalRes.reasonCode,
      expectedAnswer: item.expectedAnswerRaw,
      userAnswer: answer,
      hint,
      attemptCount,
    });
  } catch {
    explanation = null;
  }
}

const rawLabelLeak =
  /(^|\n)\s*(result|reason|expected(\s*answer)?|user\s*answer|your\s*answer)\s*[:\-–—>]/i;

// If the explainer output looks like internal/debug formatting, reject it entirely.
// (Do NOT try to "strip" and salvage it.)
const explainerText = explanation && !rawLabelLeak.test(explanation) ? explanation : null;

const cleanedExplanation = explainerText ? stripDebugPrefixes(explainerText) : "";
const safeExplanation = cleanedExplanation && !looksInternal(cleanedExplanation) ? cleanedExplanation : "";

// Keep the deterministic base (with hint escalation), and add a short user-facing explanation if available.
const tutorMessage = safeExplanation ? `${baseMessage} ${safeExplanation}`.trim() : baseMessage;





  if (evalRes.result === "correct") {
    // 1) Clear cooldown for the source question (so future "almost" can generate again)
    const qid = parseQuestionIdFromConceptTag((item as any)?.meta?.conceptTag);
    if (qid) {
      const cd: any = (session as any).practiceCooldownByQuestionId ?? new Map();
      if (typeof cd.set === "function") cd.set(qid, 0);
      else cd[qid] = 0;
      (session as any).practiceCooldownByQuestionId = cd;
    }

    // 2) Consume practice item (remove it + its attempts counter)
    if (typeof practiceById.delete === "function") practiceById.delete(practiceId);
    else delete practiceById[practiceId];

    if (typeof practiceAttempts.delete === "function") practiceAttempts.delete(practiceId);
    else delete practiceAttempts[practiceId];

    (session as any).practiceById = practiceById;
    (session as any).practiceAttempts = practiceAttempts;
  }

  await updateSession(session as any);

  return res.status(200).json({
    result: evalRes.result,
    reasonCode: evalRes.reasonCode,
    attemptCount,
    tutorMessage,
  });
};
