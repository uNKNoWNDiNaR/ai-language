// frontend/src/components/Lesson.tsx

import React, { useEffect, useRef, useMemo, useState } from "react";
import { FeedbackCard } from "./FeedbackCard";
import {
  startLesson,
  submitAnswer,
  getSession,
  submitPractice,
  generateReviewPractice,
  getSuggestedReview,
  toUserSafeErrorMessage,
  getHttpStatus,
  type LessonSession,
  type ChatMessage,
  type SubmitAnswerResponse,
  type SubmitPracticeResponse,
  type LessonProgressPayload,
  type TeachingPace,
  type ExplanationDepth,
  type TeachingPrefs,
  type SuggestedReviewItem,
  type SupportedLanguage,
} from "../api/lessonAPI";
import {
  isInstructionLanguageEnabledFlag,
  normalizeInstructionLanguage,
  buildTeachingPrefsPayload,
} from "../utils/instructionLanguage";

type Role = "user" | "assistant";

const LAST_SESSION_KEY = "ai-language:lastSessionKey";

const TEACHING_PREFS_PREFIX = "ai-language:teachingPrefs:";

const INSTRUCTION_LANGUAGE_ENABLED = isInstructionLanguageEnabledFlag(
  import.meta.env.VITE_FEATURE_INSTRUCTION_LANGUAGE
);

function makeTeachingPrefsKey(userId: string, language: string): string {
  const u = userId.trim();
  const l = language.trim();
  if (!u || !l) return "";
  return `${TEACHING_PREFS_PREFIX}${u}|${l}`;
}

function isTeachingPace(v: unknown): v is TeachingPace {
  return v === "slow" || v === "normal";
}

function isExplanationDepth(v: unknown): v is ExplanationDepth {
  return v === "short" || v === "normal" || v === "detailed";
}

function readTeachingPrefs(key: string): TeachingPrefs | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as { pace?: unknown; explanationDepth?: unknown; instructionLanguage?: unknown };

    const pace: TeachingPace = isTeachingPace(obj.pace) ? obj.pace : "normal";
    const explanationDepth: ExplanationDepth = isExplanationDepth(obj.explanationDepth)
      ? obj.explanationDepth
      : "normal";

    const instructionLanguage =
      normalizeInstructionLanguage(obj.instructionLanguage) ?? "en";

    return { pace, explanationDepth, instructionLanguage };
  } catch {
    return null;
  }
}

function writeTeachingPrefs(key: string, prefs: TeachingPrefs) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

function rowStyle(role: Role): React.CSSProperties {
  const isUser = role === "user";
  return {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
    padding: "0 6px",
  };
}

function bubbleStyle(role: Role, isLastInGroup: boolean): React.CSSProperties {
  const isUser = role === "user";

  const bottomLeft = !isLastInGroup ? 18 : isUser ? 18 : 6;
  const bottomRight = !isLastInGroup ? 18 : isUser ? 6 : 18;

  return {
    maxWidth: "74%",
    padding: "11px 13px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.42,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: bottomLeft,
    borderBottomRightRadius: bottomRight,
    background: isUser ? "var(--accent)" : "var(--surface)",
    color: isUser ? "white" : "var(--text)",
    border: isUser ? "1px solid var(--accent-strong)" : "1px solid var(--border)",
    boxShadow: "var(--shadow-sm)",
  };
}

function bubbleMetaStyle(role: Role): React.CSSProperties {
  const isUser = role === "user";
  return {
    fontSize: 11,
    marginBottom: 4,
    opacity: isUser ? 0.85 : 0.7,
    color: isUser ? "rgba(255,255,255,0.82)" : "var(--text-muted)",
  };
}

function prettyLanguage(lang: string | undefined): string {
  switch (lang) {
    case "en":
      return "English";
    case "de":
      return "German";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    default:
      return lang ?? "—";
  }
}

function prettyStatus(s: string | undefined): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("needs")) return "Needs review";
  if (t.includes("complete")) return "Completed";
  if (t.includes("progress")) return "In progress";
  return s ? s.replace(/_/g, " ") : "—";
}

function splitNextQuestion(text: string): { before: string; next: string } | null {
  const raw = (text ?? "");
  const idx = raw.toLowerCase().indexOf("next question:");
  if (idx === -1) return null;
  const before = raw.slice(0, idx).trim();
  const next = raw.slice(idx).trim();
  if (!before || !next) return null;
  return { before, next };
}

function sanitizePracticeTutorMessage(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";

  const hasDebugLabels = /^result\s*:/im.test(t) || /^reason\s*:/im.test(t);
  if (!hasDebugLabels) return t;

  const lines = t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];

  for (const line of lines) {
    if (/^result\s*:/i.test(line)) continue;

    if (/^reason\s*:/i.test(line)) {
      const rest = line.replace(/^reason\s*:\s*/i, "").trim();
      if (rest) kept.push(rest);
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

function parseRevealParts(text: string): { explanation: string; answer: string } | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  const expMatch = t.match(/Explanation:\s*([\s\S]*?)(?:\nAnswer:|$)/i);
  const ansMatch = t.match(/Answer:\s*([\s\S]*)/i);

  const explanation = expMatch ? expMatch[1].trim() : "";
  const answer = ansMatch ? ansMatch[1].trim() : "";

  if (!explanation && !answer) return null;
  return { explanation, answer };
}

export function Lesson() {
  const [userId, setUserId] = useState("user-1");
  const [language, setLanguage] = useState<"en" | "de" | "es" | "fr">("en");
  const [lessonId, setLessonId] = useState("basic-1");
  const [session, setSession] = useState<LessonSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<number | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [practicePrompt, setPracticePrompt] = useState<string | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceTutorMessage, setPracticeTutorMessage] = useState<string | null>(null);
  const [, setPracticeAttemptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "start" | "resume" | "answer" | "practice">(null);
  const [progress, setProgress] = useState<LessonProgressPayload | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [teachingPace, setTeachingPace] = useState<TeachingPace>("normal");
  const [explanationDepth, setExplanationDepth] = useState<ExplanationDepth>("normal");
  const [instructionLanguage, setInstructionLanguage] = useState<SupportedLanguage>("en");
  const [hintAnchorIndex, setHintAnchorIndex] = useState<number | null>(null);

  const [suggestedReviewItems, setSuggestedReviewItems] = useState<SuggestedReviewItem[]>([]);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<SuggestedReviewItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewBanner, setReviewBanner] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<null | "lesson" | "review">(null);



  const [lastSessionKey, setLastSessionKey] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_SESSION_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const chatRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const practiceInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, hintText, practicePrompt, practiceTutorMessage, pending]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, hintText, practicePrompt, practiceTutorMessage]);

  const practiceActive = useMemo(() => {
    return Boolean(practiceId && practicePrompt);
  }, [practiceId, practicePrompt]);

  const sessionActive = Boolean(session);
  const lockControls = sessionActive || loading;
  const disableStartResume = loading || practiceActive || sessionActive;
  const disableRestart = loading || practiceActive || !sessionActive;

  const lessonCompleted = useMemo(() => {
    const status = (progress?.status ?? "").toLowerCase();
    return status === "completed" || status === "needs_review";
  }, [progress]);

  const inProgressSession = Boolean(session) && !lessonCompleted;
  const showSuggestedReview =
    !inProgressSession && !practiceActive && suggestedReviewItems.length > 0 && !reviewDismissed;
  const isReveal = hintLevel === 3;
  const revealParts = isReveal && hintText ? parseRevealParts(hintText) : null;

  const currentSessionKey = useMemo(() => {
    const u = userId.trim();
    const lid = lessonId.trim();
    if (!u || !lid) return "";
    return `${u}|${language}|${lid}`;
  }, [userId, language, lessonId]);

  const teachingPrefsKey = useMemo(() => {
    return makeTeachingPrefsKey(userId, language);
  }, [userId, language]);

  useEffect(() => {
    const loaded = readTeachingPrefs(teachingPrefsKey);
    if (loaded) {
      setTeachingPace(loaded.pace);
      setExplanationDepth(loaded.explanationDepth);
      setInstructionLanguage(loaded.instructionLanguage ?? "en");
      return;
    }
    setTeachingPace("normal");
    setExplanationDepth("normal");
    setInstructionLanguage("en");
  }, [teachingPrefsKey]);

  useEffect(() => {
    writeTeachingPrefs(teachingPrefsKey, {
      pace: teachingPace,
      explanationDepth,
      instructionLanguage,
    });
  }, [teachingPrefsKey, teachingPace, explanationDepth, instructionLanguage]);

  const teachingPrefsPayload = useMemo(
    () =>
      buildTeachingPrefsPayload({
        pace: teachingPace,
        explanationDepth,
        instructionLanguage,
        enableInstructionLanguage: INSTRUCTION_LANGUAGE_ENABLED,
      }),
    [teachingPace, explanationDepth, instructionLanguage]
  );


  const canResume = useMemo(() => {
    return (
      !loading &&
      !practiceActive &&
      !sessionActive &&
      !lessonCompleted &&
      Boolean(currentSessionKey) &&
      lastSessionKey === currentSessionKey
    );
  }, [loading, practiceActive, sessionActive, lessonCompleted, currentSessionKey, lastSessionKey]);

  const canSubmitAnswer = useMemo(() => {
    return (
      Boolean(session) &&
      answer.trim().length > 0 &&
      !loading &&
      !practiceActive &&
      !lessonCompleted
    );
  }, [session, answer, loading, practiceActive, lessonCompleted]);

  const canSubmitPractice = useMemo(() => {
    return Boolean(practiceId) && practiceAnswer.trim().length > 0 && !loading;
  }, [practiceId, practiceAnswer, loading]);

  useEffect(() => {
    if (loading) return;

    if (practiceActive) {
      practiceInputRef.current?.focus();
      return;
    }

    if (session) {
      answerInputRef.current?.focus();
    }
  }, [session, practiceActive, loading, pending]);

  useEffect(() => {
    if (!moreOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (moreMenuRef.current?.contains(target)) return;
      if (moreButtonRef.current?.contains(target)) return;

      setMoreOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!sessionActive) setMoreOpen(false);
  }, [sessionActive]);

  useEffect(() => {
    if (lessonCompleted) setMoreOpen(false);
  }, [lessonCompleted]);


  async function refreshSuggestedReview(nextUserId?: string, nextLanguage?: SupportedLanguage) {
    const uid = (nextUserId ?? session?.userId ?? userId).trim();
    const lang = (nextLanguage ?? session?.language ?? language) as SupportedLanguage;
    if (!uid || !lang) {
      setSuggestedReviewItems([]);
      return;
    }

    try {
      const res = await getSuggestedReview({
        userId: uid,
        language: lang,
        maxItems: 2,
      });

      const items = Array.isArray(res.items) ? res.items : [];
      setSuggestedReviewItems(items);
      setReviewDismissed(false);
    } catch {
      setSuggestedReviewItems([]);
    }
  }

  function stopReview(message?: string) {
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setPracticeMode(null);
    setReviewQueue([]);
    setReviewIndex(0);

    if (message) setReviewBanner(message);
  }

  async function loadReviewPractice(item: SuggestedReviewItem) {
    const effectiveUserId = (session?.userId ?? userId).trim();
    const effectiveLanguage = (session?.language ?? language) as SupportedLanguage;
    const effectiveLessonId = (session?.lessonId ?? lessonId).trim();
    const requestedLessonId = (item.lessonId || effectiveLessonId || "").trim();
    if (!effectiveUserId || !requestedLessonId) {
      stopReview("Couldn't load review right now. You can continue the lesson.");
      return;
    }

    setReviewBanner(null);
    setError(null);
    setLoading(true);

    try {
      const res = await generateReviewPractice({
        userId: effectiveUserId,
        language: effectiveLanguage,
        items: [
          {
            lessonId: requestedLessonId,
            questionId: item.questionId,
          },
        ],
      });
      const pi = res.practice?.[0];
      if (!pi?.practiceId || !pi?.prompt) throw new Error("Invalid practice item");

      setPracticeId(pi.practiceId);
      setPracticePrompt(pi.prompt);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeMode("review");
    } catch {
      stopReview("Couldn't load review right now. You can continue the lesson.");
    } finally {
      setLoading(false);
    }
  }

  async function beginSuggestedReview() {
    if (practiceActive) return;
    if (session && !lessonCompleted) return;
    if (!userId.trim()) return;
    if (suggestedReviewItems.length === 0) return;

    setReviewDismissed(true);
    setReviewQueue(suggestedReviewItems);
    setReviewIndex(0);
    await loadReviewPractice(suggestedReviewItems[0]);
  }

  async function handleStart() {
    setMoreOpen(false);
    setError(null);

    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setHintLevel(null);
    setAnswer("");
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setSuggestedReviewItems([]);
    setReviewDismissed(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewBanner(null);
    setPracticeMode(null);

    setLoading(true);
    setPending("start");

    try {
      const res = await startLesson({
        userId: userId.trim(),
        language,
        lessonId: lessonId.trim(),
        restart: false,
        teachingPrefs: teachingPrefsPayload,
      });

      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setHintText(null);
      setHintLevel(null);
      setProgress(res.progress ?? null);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
      } catch {
        // ignore
      }

      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeMode(null);
      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleResume() {
    setMoreOpen(false);
    setError(null);

    if (!canResume) return;

    setLoading(true);
    setPending("resume");

    try {
      const res = await getSession(userId.trim());
      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);
      setHintText(null);
      setHintLevel(null);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
      } catch {
        // ignore
      }

      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      const status = getHttpStatus(e);
      if (status === 404) {
        if (lastSessionKey === currentSessionKey) {
          setLastSessionKey("");
          try {
            localStorage.removeItem(LAST_SESSION_KEY);
          } catch {
            // ignore
          }
        }
        setError("No Session started yet found. Please start a lesson first.");
        return;
      } else {
        setError(toUserSafeErrorMessage(e));
      }
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleRestart() {
    setMoreOpen(false);
    if (!window.confirm("Restart this lesson? Your current progres in this session will be reset.")) {
      return;
    }

    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setHintLevel(null);
    setAnswer("");
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setSuggestedReviewItems([]);
    setReviewDismissed(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewBanner(null);
    setPracticeMode(null);

    setLoading(true);
    setPending("start");

    try {
      const res = await startLesson({
        userId: userId.trim(),
        language,
        lessonId: lessonId.trim(),
        restart: true,
        teachingPrefs: teachingPrefsPayload,
      });

      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);
      setHintText(null);
      setHintLevel(null);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
      } catch {
        // ignore
      }

      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeMode(null);
      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  function handleExit() {
    setMoreOpen(false);
    if (!window.confirm("Exit this lesson? You can resume later.")) return;

    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setHintLevel(null);
    setAnswer("");

    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setSuggestedReviewItems([]);
    setReviewDismissed(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewBanner(null);
    setPracticeMode(null);

    setPending(null);
    setMoreOpen(false);
    void refreshSuggestedReview();
  }

  async function handleSendAnswer() {
    setMoreOpen(false);
    if (!session || practiceActive || lessonCompleted) return;

    setError(null);
    setLoading(true);
    setPending("answer");
    setHintText(null);
    setHintLevel(null);

    const userMsg: ChatMessage = { role: "user", content: answer };
    setMessages((prev) => [...prev, userMsg]);

    const toSend = answer;
    setAnswer("");

    try {
      const res: SubmitAnswerResponse = await submitAnswer({
        userId: session.userId,
        answer: toSend,
        language: session.language,
        lessonId: session.lessonId,
        teachingPrefs: teachingPrefsPayload
      });

    setSession(res.session);
      setProgress(res.progress ?? null);
        
    const incomingHint = (res.hint?.text ?? "").trim();
    const nextHintLevel = typeof res.hint?.level === "number" ? res.hint.level : null;
    const isForcedAdvance = res.hint?.level === 3;
        
    let nextMessages = [...(res.session.messages ?? [])];
    setHintAnchorIndex(null);
        
    // On forced advance: split "Next question" into a separate bubble,
    // and anchor the hint card between the two bubbles.
    if (isForcedAdvance && incomingHint) {
      const last = nextMessages[nextMessages.length - 1];
      if (last && last.role === "assistant") {
        const parts = splitNextQuestion(last.content);
        if (parts) {
          nextMessages = nextMessages.slice(0, -1);
          nextMessages.push({ ...last, content: parts.before });
          const anchor = nextMessages.length - 1;
          nextMessages.push({ ...last, content: parts.next });
          setHintAnchorIndex(anchor);
        }
      }
    }
    
    setMessages(nextMessages);


      const evalResult = res.evaluation?.result;

      const lastMsg = (res.session.messages ?? []).slice(-1)[0];
      const tutorText =
        lastMsg && lastMsg.role === "assistant" ? lastMsg.content : res.tutorMessage ?? "";
      const tutorLower = tutorText.toLowerCase();

      if (incomingHint) {
        // Forced advance: always show the reveal hint (we are preventing tutor bubble leakage now)
        if (isForcedAdvance) {
          setHintText(incomingHint);
          setHintLevel(nextHintLevel);
        } else if (evalResult !== "correct") {
          const hintLower = incomingHint.toLowerCase();
          if (tutorLower.includes(hintLower)) {
            setHintText(null);
            setHintLevel(null);
          } else {
            setHintText(incomingHint);
            setHintLevel(nextHintLevel);
          }
        } else {
          setHintText(null);
          setHintLevel(null);
        }
      } else {
        setHintText(null);
        setHintLevel(null);
      }

      if (res.hint?.level !== 3 && res.practice?.practiceId && res.practice?.prompt) {
        setPracticeId(res.practice.practiceId);
        setPracticePrompt(res.practice.prompt);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeMode("lesson");
      } else if (res.hint?.level === 3) {
        //ensure practice doesnt appear after reveal
        setPracticeId(null);
        setPracticePrompt(null);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeMode(null);
      }

      setProgress(res.progress ?? null);

      if (res.progress?.status === "completed" || res.progress?.status === "needs_review") {
        void refreshSuggestedReview(res.session.userId, res.session.language);
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleSendPractice() {
    setMoreOpen(false);
    const effectiveUserId = (session?.userId ?? userId).trim();
    if (!practiceId || !effectiveUserId) return;

    setError(null);
    setLoading(true);
    setPending("practice");

    try {
      const res: SubmitPracticeResponse = await submitPractice({
        userId: effectiveUserId,
        practiceId,
        answer: practiceAnswer,
      });

      setPracticeTutorMessage(sanitizePracticeTutorMessage(res.tutorMessage));
      setPracticeAttemptCount(res.attemptCount);

      if (res.result === "correct") {
        if (practiceMode === "review") {
          const nextIdx = reviewIndex + 1;
          if (nextIdx < reviewQueue.length) {
            setReviewIndex(nextIdx);
            setPracticeId(null);
            setPracticePrompt(null);
            setPracticeAnswer("");
            setPracticeTutorMessage(null);
            setPracticeAttemptCount(null);
            await loadReviewPractice(reviewQueue[nextIdx]);
          } else {
            stopReview("Review complete. Continue when you're ready.");
          }
        } else {
          setPracticeId(null);
          setPracticePrompt(null);
          setPracticeAnswer("");
          setPracticeMode(null);
        }
      } else {
        setPracticeAnswer("");
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  return (
    <div className="lessonPage">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&family=Fraunces:wght@500;600&display=swap");

        :root {
          --bg: #F6F4F0;
          --surface: #FFFFFF;
          --surface-muted: #F3F4F6;
          --surface-quiet: #EEF1F4;
          --border: #E2E6EA;
          --text: #1D2433;
          --text-muted: #5B6675;
          --accent: #2F6F7E;
          --accent-strong: #245E6A;
          --accent-soft: #DCECEF;
          --success: #2F855A;
          --warning: #C9842A;
          --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.08);
          --shadow-md: 0 12px 30px rgba(16, 24, 40, 0.12);
          --hint-bg: #F7F6F2;
          --reveal-bg: #EEF7F8;
        }

        * { box-sizing: border-box; }

        .lessonPage {
          min-height: 100vh;
          background: radial-gradient(1200px circle at 0% 0%, #F6FAFB 0%, #F6F4F0 45%, #F2F3F6 100%);
          color: var(--text);
          font-family: "Source Sans 3", "Avenir Next", "Segoe UI", sans-serif;
        }

        .lessonShell {
          max-width: 920px;
          margin: 0 auto;
          padding: 24px 18px 28px;
        }

        .lessonTitle {
          font-family: "Fraunces", "Palatino Linotype", "Book Antiqua", Palatino, serif;
        }

        .lessonShell button {
          transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease,
            transform 0.1s ease;
        }

        .lessonShell button:active {
          transform: translateY(1px);
        }

        .lessonShell button:focus-visible,
        .lessonShell input:focus-visible,
        .lessonShell select:focus-visible {
          outline: 2px solid var(--accent-soft);
          outline-offset: 2px;
        }

        .lessonShell input:focus-visible,
        .lessonShell select:focus-visible {
          border-color: var(--accent-strong);
        }

        .fadeIn {
          animation: fadeInUp 0.4s ease both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes dotPulse {
          0%, 80%, 100% { transform: translateY(0); opacity: .35; }
          40% { transform: translateY(-2px); opacity: 1; }
        }
        .typingDot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(0,0,0,.35);
          display: inline-block;
          margin-right: 5px;
          animation: dotPulse 1.2s infinite ease-in-out;
        }
        .typingDot:nth-child(2) { animation-delay: .15s; }
        .typingDot:nth-child(3) { animation-delay: .30s; }
      `}</style>

      <div className="lessonShell">

      {/* Controls (only when NOT in a session) */}
      {!sessionActive && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr auto",
              gap: 10,
              alignItems: "end",
              marginBottom: 12,
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Profile</span>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={lockControls}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: lockControls ? "var(--surface-muted)" : "white",
                  cursor: lockControls ? "not-allowed" : "text",
                }}
              />
            </label>
              
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Language (English only)</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "en" | "de" | "es" | "fr")}
                disabled={lockControls}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  backgroundColor: lockControls ? "var(--surface-muted)" : "white",
                  cursor: lockControls ? "not-allowed" : "pointer",
                }}
              >
                <option value="en">English</option>
                <option value="de" disabled>
                  German (coming soon)
                </option>
                <option value="es" disabled>
                  Spanish (coming soon)
                </option>
                <option value="fr" disabled>
                  French (coming soon)
                </option>
              </select>
            </label>
              
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>Lesson</span>
              <input
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                disabled={lockControls}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: lockControls ? "var(--surface-muted)" : "white",
                  cursor: lockControls ? "not-allowed" : "text",
                }}
              />
            </label>
              
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleStart}
                disabled={disableStartResume}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  borderColor: disableStartResume ? "var(--border)" : "var(--accent)",
                  background: disableStartResume ? "var(--surface-muted)" : "var(--accent)",
                  opacity: disableStartResume ? 0.7 : 1,
                  color: disableStartResume ? "var(--text-muted)" : "white",
                  cursor: disableStartResume ? "not-allowed" : "pointer",
                }}
              >
                Start
              </button>
              
              <button
                onClick={handleResume}
                disabled={!canResume}
                title={!canResume ? "No saved session for this profile/language/lesson yet." : "Resume"}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: !canResume ? "var(--surface-muted)" : "white",
                  opacity: !canResume ? 0.7 : 1,
                  cursor: !canResume ? "not-allowed" : "pointer",
                }}
              >
                Resume
              </button>
            </div>
          </div>
              
          {/* Teaching prefs row */}
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "end",
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--surface-muted)",
                width: "fit-content",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Pace</span>
                <select
                  value={teachingPace}
                  onChange={(e) => setTeachingPace(e.target.value as TeachingPace)}
                  disabled={lockControls}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    backgroundColor: lockControls ? "var(--surface-muted)" : "white",
                    cursor: lockControls ? "not-allowed" : "pointer",
                    minWidth: 140,
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="slow">Slow</option>
                </select>
              </label>
                
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Explanations</span>
                <select
                  value={explanationDepth}
                  onChange={(e) => setExplanationDepth(e.target.value as ExplanationDepth)}
                  disabled={lockControls}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    backgroundColor: lockControls ? "var(--surface-muted)" : "white",
                    cursor: lockControls ? "not-allowed" : "pointer",
                    minWidth: 160,
                  }}
                >
                  <option value="short">Short</option>
                  <option value="normal">Normal</option>
                  <option value="detailed">Detailed</option>
                </select>
              </label>

              {INSTRUCTION_LANGUAGE_ENABLED && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                    Instruction language (for explanations)
                  </span>
                  <select
                    value={instructionLanguage}
                    onChange={(e) =>
                      setInstructionLanguage(
                        (normalizeInstructionLanguage(e.target.value) ?? "en") as SupportedLanguage
                      )
                    }
                    disabled={lockControls}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      backgroundColor: lockControls ? "var(--surface-muted)" : "white",
                      cursor: lockControls ? "not-allowed" : "pointer",
                      minWidth: 200,
                    }}
                  >
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        </>
      )}

      {/* Session header */}
      {session && (
        <div
          className="fadeIn"
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 13,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              minWidth: 0,
              alignItems: "center",
              flexWrap: "wrap",
              flex: "1 1 220px",
            }}
          >
            <span className="lessonTitle" style={{ fontWeight: 600 }}>{session.lessonId}</span>
            <span style={{ opacity: 0.45 }}>•</span>
            <span style={{ opacity: 0.85 }}>{prettyLanguage(session.language)}</span>

            {progress && !loading && (
              <>
                <span style={{ opacity: 0.45 }}>•</span>
                <span style={{ fontSize: 12, opacity: 0.75 }}>
                  Q {progress.currentQuestionIndex + 1}/{progress.totalQuestions}
                </span>
              </>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "flex-end",
              flexWrap: "wrap",
              rowGap: 6,
              flex: "1 1 260px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                whiteSpace: "nowrap",
                fontSize: 12,
                opacity: 0.92,
              }}
            >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background:
                      (progress?.status ?? "").includes("needs")
                      ? "var(--warning)"
                      : (progress?.status ?? "").includes("complete")
                        ? "var(--success)"
                        : "var(--accent)",
                    opacity: 0.9,
                  }}
                />
              <div>{prettyStatus(progress?.status ?? session.state)}</div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                whiteSpace: "nowrap",
                fontSize: 12,
                opacity: 0.92,
              }}
            >
              <div style={{ opacity: 0.75 }}>
                Pace: <span style={{ fontWeight: 600 }}>{teachingPace}</span>
              </div>
              <span style={{ opacity: 0.35 }}>•</span>
              <div style={{ opacity: 0.75 }}>
                Depth: <span style={{ fontWeight: 600 }}>{explanationDepth}</span>
              </div>
              {INSTRUCTION_LANGUAGE_ENABLED && (
                <>
                  <span style={{ opacity: 0.35 }}>•</span>
                  <div style={{ opacity: 0.75 }}>
                    Instr: <span style={{ fontWeight: 600 }}>{prettyLanguage(instructionLanguage)}</span>
                  </div>
                </>
              )}
            </div>


            {/* ⋯ menu (now visible during session) */}
            <div style={{ position: "relative" }}>
              <button
                ref={moreButtonRef}
                onClick={() => setMoreOpen((v) => !v)}
                disabled={disableRestart}
                aria-label="More"
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: disableRestart ? "var(--surface-muted)" : "white",
                  color: "var(--text)",
                  cursor: disableRestart ? "not-allowed" : "pointer",
                  minWidth: 40,
                }}
              >
                ⋯
              </button>
              
              {moreOpen && !disableRestart && (
                <div
                  ref={moreMenuRef}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    background: "white",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    minWidth: 200,
                    zIndex: 50,
                  }}
                >
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      void handleRestart();
                    }}
                    disabled={disableRestart}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      background: "white",
                      border: "none",
                      cursor: disableRestart ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: disableRestart ? "var(--text-muted)" : "#ff3b30",
                    }}
                  >
                    Restart lesson
                  </button>
                  
                  <div style={{ height: 1, background: "#f0f0f0" }} />
                  
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      handleExit();
                    }}
                    disabled={disableRestart}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      background: "white",
                      border: "none",
                      cursor: disableRestart ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: disableRestart ? "var(--text-muted)" : "var(--text)",
                    }}
                  >
                    Exit lesson
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #f1c0c0",
            background: "#fff5f5",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginBottom: 12,
          padding: 10,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface-muted)",
          fontSize: 12,
          color: "#444",
        }}
      >
        English only for now. Additional languages will be enabled in a later phase.
      </div>



      {reviewBanner && (
        <div
          className="fadeIn"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.85 }}>{reviewBanner}</div>
        </div>
      )}

      {showSuggestedReview && (
        <div
          className="fadeIn"
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75 }}>Suggested review</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Optional</div>
          </div>

          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
            Want to review {Math.min(2, suggestedReviewItems.length)} item
            {Math.min(2, suggestedReviewItems.length) === 1 ? "" : "s"} you struggled with last time?
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {suggestedReviewItems.slice(0, 2).map((it, idx) => (
              <div
                key={`${it.lessonId}-${it.questionId}-${idx}`}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  opacity: 0.92,
                }}
              >
                {(it.conceptTag && it.conceptTag.replace(/_/g, " ")) || "Review item"}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
            <button
              onClick={() => void beginSuggestedReview()}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid",
                borderColor: loading ? "var(--border)" : "var(--accent)",
                background: loading ? "var(--surface-muted)" : "var(--accent)",
                color: loading ? "var(--text-muted)" : "white",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Review now
            </button>
            <button
              onClick={() => setReviewDismissed(true)}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "white",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Chat */}
      <div
        ref={chatRef}
        className="fadeIn"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 16,
          height: 620,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: "var(--surface-muted)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {!session && <div style={{ opacity: 0.7 }}>Start a lesson to begin.</div>}

        {messages.map((m, i) => {
          const prevRole = i > 0 ? messages[i - 1]?.role : null;
          const nextRole = i < messages.length - 1 ? messages[i + 1]?.role : null;

          const isFirstInGroup = prevRole !== m.role;
          const isLastInGroup = nextRole !== m.role;

          return (
            <React.Fragment key={`${m.role}-${i}`}>
            <div style={{ ...rowStyle(m.role),marginTop: isFirstInGroup ? 10 : 2,}}>
              <div style={bubbleStyle(m.role, isLastInGroup)}>
                {isFirstInGroup && (
                  <div style={bubbleMetaStyle(m.role)}>{m.role === "assistant" ? "Tutor" : "You"}</div>
                )}
                <div>{m.content}</div>
              </div>
            </div>

            {hintText && hintAnchorIndex === i && (
              <div
                style={{
                  marginTop: 6,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${isReveal ? "var(--accent-soft)" : "var(--border)"}`,
                  background: isReveal ? "var(--reveal-bg)" : "var(--hint-bg)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  {isReveal ? "Reveal" : "Hint"}
                </div>
                {isReveal && revealParts ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {revealParts.explanation && (
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.6,
                            color: "var(--text-muted)",
                            marginBottom: 4,
                          }}
                        >
                          Explanation
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{revealParts.explanation}</div>
                      </div>
                    )}
                    {revealParts.answer && (
                      <div
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: "var(--surface)",
                          border: "1px dashed var(--accent)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.6,
                            color: "var(--text-muted)",
                            marginBottom: 4,
                          }}
                        >
                          Answer
                        </div>
                        <div style={{ fontWeight: 600 }}>{revealParts.answer}</div>
                      </div>
                    )}
                    {!revealParts.explanation && !revealParts.answer && (
                      <div style={{ whiteSpace: "pre-wrap" }}>{hintText}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ whiteSpace: "pre-wrap" }}>{hintText}</div>
                )}
              </div>
            )}
            </React.Fragment>
          );
        })}

        {Boolean(session) && pending === "answer" && (
          <div style={rowStyle("assistant")}>
            <div style={bubbleStyle("assistant", true)}>
              <div style={{ display: "flex", alignItems: "center", padding: "2px 2px" }}>
                <span className="typingDot" />
                <span className="typingDot" />
                <span className="typingDot" />
              </div>
            </div>
          </div>
        )}

        {hintText && hintAnchorIndex === null && (
          <div
            style={{
              marginTop: 6,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${isReveal ? "var(--accent-soft)" : "var(--border)"}`,
              background: isReveal ? "var(--reveal-bg)" : "var(--hint-bg)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
              {isReveal ? "Reveal" : "Hint"}
            </div>
            {isReveal && revealParts ? (
              <div style={{ display: "grid", gap: 8 }}>
                {revealParts.explanation && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        color: "var(--text-muted)",
                        marginBottom: 4,
                      }}
                    >
                      Explanation
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{revealParts.explanation}</div>
                  </div>
                )}
                {revealParts.answer && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "var(--surface)",
                      border: "1px dashed var(--accent)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        color: "var(--text-muted)",
                        marginBottom: 4,
                      }}
                    >
                      Answer
                    </div>
                    <div style={{ fontWeight: 600 }}>{revealParts.answer}</div>
                  </div>
                )}
                {!revealParts.explanation && !revealParts.answer && (
                  <div style={{ whiteSpace: "pre-wrap" }}>{hintText}</div>
                )}
              </div>
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{hintText}</div>
            )}
          </div>
        )}

        {practicePrompt && practiceId && (
          <div
            className="fadeIn"
            style={{
              marginTop: 6,
              padding: 12,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {practiceMode === "review"
                    ? `Review ${reviewIndex + 1}/${Math.max(1, reviewQueue.length)}`
                    : "Practice"}
                </div>

                {practiceMode === "review" && (
                  <button
                    onClick={() =>
                      stopReview("Review paused. Continue the lesson when you're ready.")
                    }
                    disabled={loading}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "white",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontSize: 12,
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    Stop
                  </button>
                )}
              </div>

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {practiceMode === "review" ? "Optional review" : "Complete this to continue"}
              </div>
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{practicePrompt}</div>

            {pending === "practice" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tutor</div>
                <div style={{ display: "flex", alignItems: "center", padding: "2px 2px" }}>
                  <span className="typingDot" />
                  <span className="typingDot" />
                  <span className="typingDot" />
                </div>
              </div>
            )}

            {practiceTutorMessage && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tutor</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{practiceTutorMessage}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <input
                ref={practiceInputRef}
                value={practiceAnswer}
                onChange={(e) => setPracticeAnswer(e.target.value)}
                placeholder="Answer the practice..."
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmitPractice) void handleSendPractice();
                }}
              />
              <button
                onClick={handleSendPractice}
                disabled={!canSubmitPractice}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid",
                  borderColor: canSubmitPractice ? "var(--accent)" : "var(--border)",
                  background: canSubmitPractice ? "var(--accent)" : "var(--surface-muted)",
                  color: canSubmitPractice ? "white" : "var(--text-muted)",
                  cursor: canSubmitPractice ? "pointer" : "not-allowed",
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {lessonCompleted && !practiceActive && (
          <>
            <div
            style={{
              alignSelf: "center",
              maxWidth: 520,
              background: "rgba(0,0,0,0.04)",
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: 14,
              padding: "10px 12px",
              textAlign: "center",
            }}
            >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Lesson Complete.</div>
            <div style={{ fontSize: 13, opacity: 0.78 }}>You can exit now, or restart anytime.</div>

            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleExit}
                disabled={loading}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: loading ? "var(--surface-muted)" : "white",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                Exit Lesson
              </button>
            </div>
              </div>

              <FeedbackCard
                userId={userId.trim()}
                language={language}
                lessonId={lessonId.trim()}
                sessionKey={currentSessionKey}
                disabled={loading}
              />
            </>
          )}

        <div ref={chatEndRef} />
      </div>

      {/* Answer input */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          ref={answerInputRef}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={
            !session
              ? "Start a lesson first..."
              : lessonCompleted
                ? "Lesson completed - restart or exit."
                : practiceActive
                  ? "Finish the practice above first..."
                  : "Type your answer..."
          }
          disabled={!session || loading || practiceActive || lessonCompleted}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 14,
            border: "1px solid var(--border)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmitAnswer && !practiceActive) void handleSendAnswer();
          }}
        />
        <button
          onClick={handleSendAnswer}
          disabled={!canSubmitAnswer}
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid",
            borderColor: canSubmitAnswer ? "var(--accent)" : "var(--border)",
            background: canSubmitAnswer ? "var(--accent)" : "var(--surface-muted)",
            color: canSubmitAnswer ? "white" : "var(--text-muted)",
            cursor: canSubmitAnswer ? "pointer" : "not-allowed",
          }}
        >
          Send
        </button>
      </div>
    </div>
  </div>
  );
}
