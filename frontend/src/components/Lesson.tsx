// frontend/src/components/Lesson.tsx

import { useEffect, useRef, useMemo, useState } from "react";
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
import {
  LessonShell,
  LessonSetupPanel,
  SessionHeader,
  ChatPane,
  SuggestedReviewCard,
  PracticeCard,
  AnswerBar,
} from "./lesson/index";

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

const REVEAL_PREFIX = "__REVEAL__";

export function Lesson() {
  const [userId] = useState("user-1");
  const [language] = useState<"en" | "de" | "es" | "fr">("en");
  const [lessonId] = useState("basic-1");
  const [session, setSession] = useState<LessonSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [hintText, setHintText] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [practicePrompt, setPracticePrompt] = useState<string | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceTutorMessage, setPracticeTutorMessage] = useState<string | null>(null);
  const [, setPracticeAttemptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "start" | "resume" | "answer" | "practice">(null);
  const [progress, setProgress] = useState<LessonProgressPayload | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [practiceScreenOpen, setPracticeScreenOpen] = useState(false);
  const [teachingPace, setTeachingPace] = useState<TeachingPace>("normal");
  const [explanationDepth, setExplanationDepth] = useState<ExplanationDepth>("normal");
  const [instructionLanguage, setInstructionLanguage] = useState<SupportedLanguage>("en");

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
  const prefsButtonRef = useRef<HTMLButtonElement | null>(null);
  const prefsMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollOnEnterRef = useRef(false);

  const practiceActive = useMemo(() => {
    return Boolean(practiceId && practicePrompt);
  }, [practiceId, practicePrompt]);

  const sessionActive = Boolean(session);
  const showHome = !sessionActive && !practiceScreenOpen;
  const showConversation = sessionActive && !practiceScreenOpen;
  const lessonCompleted = useMemo(() => {
    const status = (progress?.status ?? "").toLowerCase();
    return status === "completed" || status === "needs_review";
  }, [progress]);

  const showPracticeScreen = practiceMode === "review" && practiceScreenOpen;
  const reviewAvailable = practiceMode === "review" && practiceActive;
  const reviewSuggested = suggestedReviewItems.length > 0 && !reviewDismissed;
  const canOpenReview = reviewAvailable || reviewSuggested;
  const showReviewBanner =
    lessonCompleted &&
    sessionActive &&
    !practiceScreenOpen &&
    canOpenReview &&
    !(practiceActive && practiceMode === "lesson");
  const disableStartResume = loading || practiceActive || sessionActive;

  const inProgressSession = Boolean(session) && !lessonCompleted;
  const showSuggestedReview =
    !inProgressSession && !practiceActive && suggestedReviewItems.length > 0 && !reviewDismissed;
  const isReviewPractice = practiceMode === "review";
  const hintMessage = useMemo(() => {
    if (!hintText) return null;
    return `Hint\n${hintText}`;
  }, [hintText]);

  const chatMessages = useMemo(() => {
    if (!hintMessage) return messages;
    const hintMsg: ChatMessage = { role: "assistant", content: hintMessage };
    return [...messages, hintMsg];
  }, [messages, hintMessage]);

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

  useEffect(() => {
    void refreshSuggestedReview();
  }, [userId, language]);

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
    if (!prefsOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPrefsOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (prefsMenuRef.current?.contains(target)) return;
      if (prefsButtonRef.current?.contains(target)) return;

      setPrefsOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [prefsOpen]);

  useEffect(() => {
    if (!showHome) setPrefsOpen(false);
  }, [showHome]);

  useEffect(() => {
    if (!sessionActive) return;
    if (!scrollOnEnterRef.current) return;

    scrollOnEnterRef.current = false;
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "auto" });
      }
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [sessionActive, messages.length]);

  useEffect(() => {
    if (!showConversation) return;
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "auto" });
      }
      chatEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [showConversation, chatMessages.length, pending]);

  async function refreshSuggestedReview(nextUserId?: string, nextLanguage?: SupportedLanguage) {
    const uid = (nextUserId ?? session?.userId ?? userId).trim();
    const lang = (nextLanguage ?? session?.language ?? language) as SupportedLanguage;
    if (!uid || !lang) {
      setSuggestedReviewItems([]);
      return;
    }

    try {
      console.log("[review] fetching suggested", { userId: uid, language: lang });
      const res = await getSuggestedReview({
        userId: uid,
        language: lang,
        maxItems: 3,
      });

      const items = Array.isArray(res.items) ? res.items : [];
      setSuggestedReviewItems(items);
      setReviewDismissed(false);
      console.log("[review] suggested response", {
        userId: uid,
        language: lang,
        suggestedCount: items.length,
        suggestedKeys: items.map((item) => `${item.lessonId}__${item.questionId}`),
      });
    } catch (err) {
      console.warn("[review] suggested fetch failed", err);
      setSuggestedReviewItems([]);
    }
  }

  function stopReview(message?: string) {
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);
    setPracticeScreenOpen(false);

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
      setPracticeScreenOpen(true);
    } catch {
      stopReview("Couldn't load review right now. You can continue the lesson.");
    } finally {
      setLoading(false);
    }
  }

  async function beginSuggestedReview() {
    if (practiceActive) return;
    if (!userId.trim()) return;
    if (suggestedReviewItems.length === 0) return;

    setReviewDismissed(true);
    setReviewQueue(suggestedReviewItems);
    setReviewIndex(0);
    await loadReviewPractice(suggestedReviewItems[0]);
  }

  function handleOpenReview() {
    if (reviewAvailable) {
      setPracticeScreenOpen(true);
      return;
    }
    void beginSuggestedReview();
  }

  async function handleStart() {
    setError(null);

    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
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
    scrollOnEnterRef.current = true;

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
    setPracticeScreenOpen(false);
      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  async function handleResume() {
    setError(null);

    if (!canResume) return;

    setLoading(true);
    setPending("resume");
    scrollOnEnterRef.current = true;

    try {
      const res = await getSession(userId.trim());
      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);
      setHintText(null);
      setPracticeScreenOpen(false);

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
    if (!window.confirm("Restart this lesson? Your current progress will be reset.")) return;

    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
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
    setPracticeScreenOpen(false);

    setLoading(true);
    setPending("start");
    scrollOnEnterRef.current = true;

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
      setHintText(null);
      setProgress(res.progress ?? null);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
      } catch {
        // ignore
      }

      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
    } finally {
      setPending(null);
      setLoading(false);
    }
  }

  function resetToHome({
    confirm,
    preservePractice,
  }: {
    confirm: boolean;
    preservePractice: boolean;
  }) {
    if (confirm && !window.confirm("Exit this lesson? You can resume later.")) return;

    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setAnswer("");

    if (!preservePractice) {
      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeMode(null);
      setPracticeScreenOpen(false);
    } else {
      setPracticeScreenOpen(false);
    }

    setSuggestedReviewItems([]);
    setReviewDismissed(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewBanner(null);

    setPending(null);
    void refreshSuggestedReview();
  }

  function handleExit() {
    resetToHome({ confirm: true, preservePractice: false });
  }

  function handleBack() {
    resetToHome({ confirm: false, preservePractice: true });
  }

  async function handleSendAnswer() {
    if (!session || practiceActive || lessonCompleted) return;

    setError(null);
    setLoading(true);
    setPending("answer");
    setHintText(null);

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
    const isForcedAdvance = res.hint?.level === 3;
        
    let nextMessages = [...(res.session.messages ?? [])];
        
    // On forced advance: split "Next question" into a separate bubble,
    // and insert a reveal card between the two bubbles.
    if (isForcedAdvance && incomingHint) {
      const last = nextMessages[nextMessages.length - 1];
      if (last && last.role === "assistant") {
        const parts = splitNextQuestion(last.content);
          if (parts) {
            const revealPayload =
              parseRevealParts(incomingHint) ?? { explanation: incomingHint, answer: "" };
            const revealMessage: ChatMessage = {
              role: "assistant",
              content: `${REVEAL_PREFIX}${JSON.stringify(revealPayload)}`,
            };
            nextMessages = nextMessages.slice(0, -1);
            nextMessages.push({ ...last, content: parts.before });
            nextMessages.push(revealMessage);
            nextMessages.push({ ...last, content: parts.next });
          } else {
            const revealPayload =
              parseRevealParts(incomingHint) ?? { explanation: incomingHint, answer: "" };
            nextMessages = [
              ...nextMessages,
              {
                role: "assistant",
                content: `${REVEAL_PREFIX}${JSON.stringify(revealPayload)}`,
              },
            ];
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
        // Forced advance: handled via reveal card insertion
        if (isForcedAdvance) {
          setHintText(null);
        } else if (evalResult !== "correct") {
          const hintLower = incomingHint.toLowerCase();
          if (tutorLower.includes(hintLower)) {
            setHintText(null);
          } else {
            setHintText(incomingHint);
          }
        } else {
          setHintText(null);
        }
      } else {
        setHintText(null);
      }

      if (isForcedAdvance || (evalResult && evalResult !== "correct")) {
        void refreshSuggestedReview(res.session.userId, res.session.language);
      }

      if (res.hint?.level !== 3 && res.practice?.practiceId && res.practice?.prompt) {
        setPracticeId(res.practice.practiceId);
        setPracticePrompt(res.practice.prompt);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeMode("lesson");
        setPracticeScreenOpen(false);
      } else if (res.hint?.level === 3) {
        //ensure practice doesnt appear after reveal
        setPracticeId(null);
        setPracticePrompt(null);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
        setPracticeMode(null);
        setPracticeScreenOpen(false);
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
          setPracticeScreenOpen(false);
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
    <LessonShell>
      {showHome ? (
        <div className="lessonHome">
          {error && <div className="lessonError">{error}</div>}

          {reviewBanner && (
            <div
              className="fadeIn"
              style={{
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

          <div className="lessonHomeCard">
            <div className="lessonHomeRow">
              <LessonSetupPanel userId={userId} language={language} lessonId={lessonId} />

              <div className="lessonPrefsArea">
                <button
                  type="button"
                  className="lessonPrefsButton"
                  ref={prefsButtonRef}
                  onClick={() => setPrefsOpen((v) => !v)}
                  aria-expanded={prefsOpen}
                  aria-haspopup="true"
                  title="Teaching preferences"
                >
                  <svg
                    className="lessonPrefsIcon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="11" fill="#E0F2FE" />
                    <path
                      d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8.1 3.8c0-.5-.1-1-.2-1.5l2-1.6-1.9-3.3-2.4 1a8.5 8.5 0 0 0-2.6-1.5l-.4-2.6H9.4L9 5.1c-.9.3-1.8.8-2.6 1.5l-2.4-1-1.9 3.3 2 1.6c-.1.5-.2 1-.2 1.5s.1 1 .2 1.5l-2 1.6 1.9 3.3 2.4-1c.8.7 1.7 1.2 2.6 1.5l.4 2.6h3.8l.4-2.6c.9-.3 1.8-.8 2.6-1.5l2.4 1 1.9-3.3-2-1.6c.1-.5.2-1 .2-1.5Z"
                      fill="#334155"
                    />
                  </svg>
                </button>
                {prefsOpen && (
                  <div className="lessonPrefsMenu" ref={prefsMenuRef}>
                    <label className="lessonPrefsField">
                      <span className="lessonPrefsLabel">Pace</span>
                      <select
                        value={teachingPace}
                        onChange={(e) => setTeachingPace(e.target.value as TeachingPace)}
                        disabled={loading}
                        className="lessonPrefsSelect"
                      >
                        <option value="normal">Normal</option>
                        <option value="slow">Slow</option>
                      </select>
                    </label>

                    <label className="lessonPrefsField">
                      <span className="lessonPrefsLabel">Explanations</span>
                      <select
                        value={explanationDepth}
                        onChange={(e) => setExplanationDepth(e.target.value as ExplanationDepth)}
                        disabled={loading}
                        className="lessonPrefsSelect"
                      >
                        <option value="short">Short</option>
                        <option value="normal">Normal</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </label>

                    {INSTRUCTION_LANGUAGE_ENABLED && (
                      <label className="lessonPrefsField">
                        <span className="lessonPrefsLabel">Instruction language</span>
                        <select
                          value={instructionLanguage}
                          onChange={(e) =>
                            setInstructionLanguage(
                              (normalizeInstructionLanguage(e.target.value) ?? "en") as SupportedLanguage
                            )
                          }
                          disabled={loading}
                          className="lessonPrefsSelect"
                        >
                          <option value="en">English</option>
                          <option value="de">German</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                        </select>
                      </label>
                    )}

                    <button
                      type="button"
                      className="lessonPrefsAction lessonPrefsActionWarm"
                      onClick={() => void handleRestart()}
                      disabled={loading}
                    >
                      Restart lesson
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="lessonHomeRow lessonHomeActionsRow">
              <div className="lessonActionRow lessonActionCenter">
                <div className="lessonActionArea">
                  <div className="lessonActionStack">
                    <button
                      className="lessonPrimaryBtn lessonActionBtn"
                      onClick={() => void handleStart()}
                      disabled={disableStartResume}
                    >
                      Start
                    </button>
                  {canResume && (
                      <button
                        className="lessonSecondaryBtn lessonActionBtn"
                        onClick={() => void handleResume()}
                        disabled={!canResume}
                        title="Continue last session"
                      >
                        Continue last session
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SuggestedReviewCard
            visible={showSuggestedReview}
            items={suggestedReviewItems}
            loading={loading}
            onReviewNow={() => void beginSuggestedReview()}
            onDismiss={() => setReviewDismissed(true)}
          />

        </div>
      ) : (
        <>
          {session && (
            <SessionHeader
              session={session}
              progress={progress}
              loading={loading}
              onBack={showPracticeScreen ? () => setPracticeScreenOpen(false) : handleBack}
            />
          )}

          {showPracticeScreen && (
            <div className="lessonPracticeScreen">
              {!session && (
                <div className="lessonPracticeHeader">
                  <button
                    className="lessonSecondaryBtn"
                    onClick={handleBack}
                  >
                    Back
                  </button>
                  <div className="lessonPracticeTitle">
                    {isReviewPractice ? "Review practice" : "Practice"}
                  </div>
                </div>
              )}

              <div
                className={`lessonPracticeCue ${
                  isReviewPractice ? "review" : "required"
                }`}
              >
                {isReviewPractice
                  ? "Optional review"
                  : "Required to continue"}
              </div>

              <div className="lessonPracticePanel">
                <PracticeCard
                  practicePrompt={practicePrompt}
                  practiceId={practiceId}
                  practiceMode={practiceMode}
                  reviewIndex={reviewIndex}
                  reviewQueueLength={reviewQueue.length}
                  onStopReview={() => stopReview("Review paused. Continue the lesson when you're ready.")}
                  loading={loading}
                  pending={pending}
                  practiceTutorMessage={practiceTutorMessage}
                  practiceAnswer={practiceAnswer}
                  onPracticeAnswerChange={setPracticeAnswer}
                  practiceInputRef={practiceInputRef}
                  canSubmitPractice={canSubmitPractice}
                  onSendPractice={handleSendPractice}
                />
              </div>
            </div>
          )}

          {showConversation && (
            <>
              <ChatPane
                chatRef={chatRef}
                chatEndRef={chatEndRef}
                messages={chatMessages}
                session={session}
                pending={pending}
                showEmptyState={!practiceActive}
              >
                {showReviewBanner && (
                  <div className="lessonPracticeBanner">
                    <div className="lessonPracticeBannerText">
                      Optional review is ready. Want to take a quick look?
                    </div>
                    <button
                      type="button"
                      className="lessonSecondaryBtn lessonReviewBtn"
                      onClick={handleOpenReview}
                      disabled={loading}
                    >
                      Let's review
                    </button>
                  </div>
                )}
                {practiceActive && practiceMode === "lesson" && (
                  <div className="lessonPracticeInline">
                    <PracticeCard
                      practicePrompt={practicePrompt}
                      practiceId={practiceId}
                      practiceMode={practiceMode}
                      reviewIndex={reviewIndex}
                      reviewQueueLength={reviewQueue.length}
                      onStopReview={() => stopReview("Review paused. Continue the lesson when you're ready.")}
                      loading={loading}
                      pending={pending}
                      practiceTutorMessage={practiceTutorMessage}
                      practiceAnswer={practiceAnswer}
                      onPracticeAnswerChange={setPracticeAnswer}
                      practiceInputRef={practiceInputRef}
                      canSubmitPractice={canSubmitPractice}
                      onSendPractice={handleSendPractice}
                    />
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
                    <div style={{ fontSize: 13, opacity: 0.78 }}>
                      You can exit now, or restart anytime.
                    </div>

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
              </ChatPane>
            </>
          )}

          {sessionActive && !practiceScreenOpen && (
            <AnswerBar
              answer={answer}
              onAnswerChange={setAnswer}
              answerInputRef={answerInputRef}
              canSubmitAnswer={canSubmitAnswer}
              onSendAnswer={handleSendAnswer}
              sessionActive={sessionActive}
              loading={loading}
              practiceActive={practiceActive}
              lessonCompleted={lessonCompleted}
            />
          )}
        </>
      )}
    </LessonShell>
  );
}
