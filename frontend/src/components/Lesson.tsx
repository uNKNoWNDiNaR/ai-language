// frontend/src/components/Lesson.tsx

import { useEffect, useRef, useMemo, useState } from "react";
import { FeedbackCard } from "./FeedbackCard";
import {
  startLesson,
  submitAnswer,
  getSession,
  submitPractice,
  getSuggestedReview,
  getReviewCandidates,
  submitReview,
  getLessonCatalog,
  getUserProgress,
  toUserSafeErrorMessage,
  getHttpStatus,
  type LessonSession,
  type ChatMessage,
  type SubmitAnswerResponse,
  type SubmitPracticeResponse,
  type LessonCatalogItem,
  type ProgressDoc,
  type LessonProgressPayload,
  type TeachingPace,
  type ExplanationDepth,
  type TeachingPrefs,
  type SuggestedReviewItem,
  type ReviewCandidateItem,
  type ReviewSummary,
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
import settingsIcon from "../assets/settings.svg";

const LAST_SESSION_KEY = "ai-language:lastSessionKey";
const LAST_SESSION_STATUS_KEY = "ai-language:lastSessionStatus";
const LAST_COMPLETED_LESSON_KEY = "ai-language:lastCompletedLessonId";

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
  const [lessonId, setLessonId] = useState("basic-1");
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
  const [pending, setPending] = useState<
    null | "start" | "resume" | "answer" | "practice" | "review"
  >(null);
  const [progress, setProgress] = useState<LessonProgressPayload | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [practiceScreenOpen, setPracticeScreenOpen] = useState(false);
  const [teachingPace, setTeachingPace] = useState<TeachingPace>("normal");
  const [explanationDepth, setExplanationDepth] = useState<ExplanationDepth>("normal");
  const [instructionLanguage, setInstructionLanguage] = useState<SupportedLanguage>("en");

  const [suggestedReviewItems, setSuggestedReviewItems] = useState<SuggestedReviewItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [reviewItems, setReviewItems] = useState<SuggestedReviewItem[]>([]);
  const [reviewCandidates, setReviewCandidates] = useState<ReviewCandidateItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewTutorMessage, setReviewTutorMessage] = useState<string | null>(null);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [reviewScreenOpen, setReviewScreenOpen] = useState(false);
  const [reviewBanner, setReviewBanner] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<null | "lesson">(null);

  const [catalog, setCatalog] = useState<LessonCatalogItem[]>([]);
  const [lastCompletedLessonId, setLastCompletedLessonId] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_COMPLETED_LESSON_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressDoc>>({});
  const [resumeLessonId, setResumeLessonId] = useState<string | null>(null);

  const [lastSessionStatus, setLastSessionStatus] = useState<"in_progress" | "completed" | "">(
    () => {
      try {
        const raw = localStorage.getItem(LAST_SESSION_STATUS_KEY);
        return raw === "completed" || raw === "in_progress" ? raw : "";
      } catch {
        return "";
      }
    }
  );


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
  const reviewInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const prefsButtonRef = useRef<HTMLButtonElement | null>(null);
  const prefsMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollOnEnterRef = useRef(false);

  const practiceActive = useMemo(() => {
    return Boolean(practiceId && practicePrompt);
  }, [practiceId, practicePrompt]);

  const sessionActive = Boolean(session);
  const showHome = !sessionActive && !practiceScreenOpen && !reviewScreenOpen;
  const showConversation = sessionActive && !practiceScreenOpen && !reviewScreenOpen;
  const lessonCompleted = useMemo(() => {
    const status = (progress?.status ?? "").toLowerCase();
    return status === "completed" || status === "needs_review";
  }, [progress]);

  const showPracticeScreen = practiceScreenOpen;
  const showReviewScreen = reviewScreenOpen;
  const reviewItemsAvailable = suggestedReviewItems.length > 0;
  const showResumePractice = practiceActive && !practiceScreenOpen;
  const disableStartResume = loading || practiceActive || sessionActive;

  const inProgressSession = Boolean(session) && !lessonCompleted;
  const showSuggestedReview =
    !inProgressSession && !practiceActive && reviewCandidates.length > 0 && !reviewDismissed;
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
  }, [userId, language, lastSessionKey, lastSessionStatus]);

  const currentLessonMeta = useMemo(() => {
    if (!session?.lessonId) return null;
    return catalog.find((lesson) => lesson.lessonId === session.lessonId) ?? null;
  }, [catalog, session?.lessonId]);

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

  useEffect(() => {
    setReviewDismissed(false);
  }, [userId, language]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalogAndProgress() {
      try {
        const [catalogRes, progressRes] = await Promise.all([
          getLessonCatalog(language),
          getUserProgress(userId.trim(), language),
        ]);

        if (cancelled) return;

        const lessons = Array.isArray(catalogRes.lessons) ? catalogRes.lessons : [];
        setCatalog(lessons);

        const progressDocs: ProgressDoc[] = Array.isArray(progressRes.progress)
          ? progressRes.progress
          : [];
        const nextProgressMap: Record<string, ProgressDoc> = {};
        progressDocs.forEach((doc) => {
          if (doc?.lessonId) nextProgressMap[doc.lessonId] = doc;
        });
        setProgressMap(nextProgressMap);

        const inProgressDocs = progressDocs.filter((doc) => doc?.status === "in_progress");
        inProgressDocs.sort((a, b) => {
          const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
          const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
          return tb - ta;
        });
        const resumeId = inProgressDocs[0]?.lessonId ?? null;
        setResumeLessonId(resumeId);

        const completedDocs = progressDocs.filter(
          (doc) => doc && (doc.status === "completed" || doc.status === "needs_review")
        );
        completedDocs.sort((a, b) => {
          const ta = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
          const tb = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
          return tb - ta;
        });
        const lastCompleted = completedDocs[0]?.lessonId ?? "";
        if (lastCompleted) {
          setLastCompletedLessonId(lastCompleted);
          try {
            localStorage.setItem(LAST_COMPLETED_LESSON_KEY, lastCompleted);
          } catch {
            // ignore
          }
        }

        let selectedLessonId = lessonId;

        const sessionKeyParts = lastSessionKey.split("|");
        const sessionLessonId =
          sessionKeyParts.length >= 3 &&
          sessionKeyParts[0] === userId &&
          sessionKeyParts[1] === language
            ? sessionKeyParts[2]
            : "";

        if (resumeId && lessons.some((l) => l.lessonId === resumeId)) {
          selectedLessonId = resumeId;
        } else if (
          lastSessionStatus !== "completed" &&
          sessionLessonId &&
          lessons.some((l) => l.lessonId === sessionLessonId)
        ) {
          selectedLessonId = sessionLessonId;
        } else if (lastCompleted) {
          const idx = lessons.findIndex((l) => l.lessonId === lastCompleted);
          const next = idx >= 0 ? lessons[idx + 1]?.lessonId ?? null : null;
          if (next) selectedLessonId = next;
          else if (lessons[0]) selectedLessonId = lessons[0].lessonId;
        } else if (lessons[0]) {
          selectedLessonId = lessons[0].lessonId;
        }

        if (selectedLessonId && selectedLessonId !== lessonId) {
          setLessonId(selectedLessonId);
        }
      } catch {
        if (cancelled) return;
        setCatalog([]);
        setProgressMap({});
        setResumeLessonId(null);
      }
    }

    void loadCatalogAndProgress();
    return () => {
      cancelled = true;
    };
  }, [userId, language]);

  useEffect(() => {
    if (!catalog.length) {
      setNextLessonId(null);
      return;
    }
    const idx = catalog.findIndex((l) => l.lessonId === lessonId);
    setNextLessonId(idx >= 0 ? catalog[idx + 1]?.lessonId ?? null : null);
  }, [catalog, lessonId]);

  const nextLessonAfterLastCompleted = useMemo(() => {
    if (!lastCompletedLessonId || !catalog.length) return null;
    const idx = catalog.findIndex((l) => l.lessonId === lastCompletedLessonId);
    return idx >= 0 ? catalog[idx + 1]?.lessonId ?? null : null;
  }, [catalog, lastCompletedLessonId]);

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
      lastSessionStatus !== "completed" &&
      Boolean(currentSessionKey) &&
      lastSessionKey === currentSessionKey
    );
  }, [
    loading,
    practiceActive,
    sessionActive,
    lessonCompleted,
    lastSessionStatus,
    currentSessionKey,
    lastSessionKey,
  ]);

  const selectedProgressStatus =
    progressMap[lessonId]?.status?.toLowerCase() ?? "not_started";
  const primaryActionLabel = selectedProgressStatus === "in_progress" ? "Resume" : "Start";
  const primaryActionDisabled =
    selectedProgressStatus === "in_progress" ? !canResume : disableStartResume;

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

  const currentReviewItem = useMemo(() => {
    if (reviewComplete) return null;
    return reviewItems[reviewIndex] ?? null;
  }, [reviewItems, reviewIndex, reviewComplete]);

  const canSubmitReview = Boolean(currentReviewItem) && reviewAnswer.trim().length > 0 && !loading;

  const reviewFocusNext = useMemo(() => {
    const raw = reviewSummary?.focusNext ?? [];
    return raw.filter(Boolean).slice(0, 2);
  }, [reviewSummary]);

  const completionButtonCount =
    (reviewItemsAvailable ? 1 : 0) + (nextLessonId ? 1 : 0) + 1;
  const completionBackButtonClass =
    completionButtonCount === 1 ? "lessonPrimaryBtn" : "lessonSecondaryBtn";

  const showContinueNextLessonCTA =
    Boolean(nextLessonAfterLastCompleted) && !canResume && !practiceActive;

  function updateLocalProgress(lessonIdValue: string, status: string) {
    const now = new Date().toISOString();
    setProgressMap((prev) => ({
      ...prev,
      [lessonIdValue]: {
        userId,
        language,
        lessonId: lessonIdValue,
        status,
        lastActiveAt: now,
      },
    }));
  }


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
    if (!reviewScreenOpen || loading) return;
    reviewInputRef.current?.focus();
  }, [reviewScreenOpen, reviewIndex, loading]);

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
      setReviewCandidates([]);
      return;
    }

    try {
      const [queueRes, candidateRes] = await Promise.all([
        getSuggestedReview({
          userId: uid,
          language: lang,
          maxItems: 5,
        }),
        getReviewCandidates({
          userId: uid,
          language: lang,
          maxItems: 5,
        }),
      ]);

      const items = Array.isArray(queueRes.items) ? queueRes.items : [];
      setSuggestedReviewItems(items);
      setReviewSummary(queueRes.summary ?? null);

      const candidatesRaw = Array.isArray(candidateRes.items) ? candidateRes.items : [];
      const candidates = candidatesRaw.filter(
        (item) => typeof item.confidence !== "number" || item.confidence < 0.9
      );
      setReviewCandidates(candidates);
      return { items, candidates };
    } catch {
      setSuggestedReviewItems([]);
      setReviewSummary(null);
      setReviewCandidates([]);
    }
  }

  function stopReview(message?: string) {
    setReviewScreenOpen(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);

    if (message) setReviewBanner(message);
  }

  async function beginSuggestedReview() {
    if (practiceActive) return;
    if (!userId.trim()) return;
    let reviewQueue = suggestedReviewItems;
    if (reviewQueue.length === 0) {
      const refreshed = await refreshSuggestedReview(userId.trim(), language);
      reviewQueue = refreshed?.items ?? [];
    }
    if (reviewQueue.length === 0) return;

    setReviewDismissed(true);
    setReviewItems(reviewQueue);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewScreenOpen(true);
  }

  async function startLessonFlow(targetLessonId: string, restart: boolean) {
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
    setReviewSummary(null);
    setReviewCandidates([]);
    setReviewSummary(null);
    setReviewDismissed(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewBanner(null);
    setReviewScreenOpen(false);
    setPracticeMode(null);
    setPracticeScreenOpen(false);

    setLoading(true);
    setPending("start");
    scrollOnEnterRef.current = true;

    const normalizedLessonId = targetLessonId.trim();

    try {
      const res = await startLesson({
        userId: userId.trim(),
        language,
        lessonId: normalizedLessonId,
        restart,
        teachingPrefs: teachingPrefsPayload,
      });

      setSession(res.session);
      setLessonId(res.session.lessonId);
      setMessages(res.session.messages ?? []);
      setHintText(null);
      setProgress(res.progress ?? null);
      if (!restart) {
        updateLocalProgress(res.session.lessonId, "in_progress");
        setResumeLessonId(res.session.lessonId);
      }

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      setLastSessionStatus("in_progress");
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
        localStorage.setItem(LAST_SESSION_STATUS_KEY, "in_progress");
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

  async function handleResumePractice() {
    if (!sessionActive) {
      await handleResume();
    }
    setPracticeScreenOpen(true);
  }

  async function handleStart(overrideLessonId?: string) {
    const effectiveLessonId = (overrideLessonId ?? lessonId).trim();
    if (!effectiveLessonId) return;
    await startLessonFlow(effectiveLessonId, false);
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
      setLessonId(res.session.lessonId);
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);
      setHintText(null);
      setPracticeScreenOpen(false);
      updateLocalProgress(res.session.lessonId, "in_progress");
      setResumeLessonId(res.session.lessonId);

      const key = `${res.session.userId}|${res.session.language}|${res.session.lessonId}`;
      setLastSessionKey(key);
      setLastSessionStatus("in_progress");
      try {
        localStorage.setItem(LAST_SESSION_KEY, key);
        localStorage.setItem(LAST_SESSION_STATUS_KEY, "in_progress");
      } catch {
        // ignore
      }

      void refreshSuggestedReview(res.session.userId, res.session.language);
    } catch (e: unknown) {
      const status = getHttpStatus(e);
      if (status === 404) {
        if (lastSessionKey === currentSessionKey) {
          setLastSessionKey("");
          setLastSessionStatus("");
          try {
            localStorage.removeItem(LAST_SESSION_KEY);
            localStorage.removeItem(LAST_SESSION_STATUS_KEY);
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

    updateLocalProgress(lessonId, "not_started");
    setResumeLessonId(null);

    await startLessonFlow(lessonId, true);
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
    setReviewCandidates([]);
    setReviewDismissed(false);
    setReviewItems([]);
    setReviewIndex(0);
    setReviewAnswer("");
    setReviewTutorMessage(null);
    setReviewComplete(false);
    setReviewBanner(null);
    setReviewScreenOpen(false);

    setPending(null);
    void refreshSuggestedReview();
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
        updateLocalProgress(res.session.lessonId, res.progress.status);
        if (resumeLessonId === res.session.lessonId) {
          setResumeLessonId(null);
        }
        setLastSessionStatus("completed");
        setLastCompletedLessonId(res.session.lessonId);
        setLastSessionKey("");
        try {
          localStorage.setItem(LAST_SESSION_STATUS_KEY, "completed");
          localStorage.setItem(LAST_COMPLETED_LESSON_KEY, res.session.lessonId);
          localStorage.removeItem(LAST_SESSION_KEY);
        } catch {
          // ignore
        }
      } else if (res.progress?.status === "in_progress") {
        updateLocalProgress(res.session.lessonId, "in_progress");
        setResumeLessonId(res.session.lessonId);
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
        setPracticeId(null);
        setPracticePrompt(null);
        setPracticeAnswer("");
        setPracticeMode(null);
        setPracticeScreenOpen(false);
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

  async function handleSubmitReview() {
    const uid = userId.trim();
    if (!uid || !currentReviewItem) return;

    setError(null);
    setLoading(true);
    setPending("review");

    const toSend = reviewAnswer;
    setReviewAnswer("");

    try {
      const res = await submitReview({
        userId: uid,
        language,
        itemId: currentReviewItem.id,
        answer: toSend,
      });

      setReviewTutorMessage(res.tutorMessage);

      if (res.result === "correct") {
        const nextIdx = reviewIndex + 1;
        if (nextIdx < reviewItems.length) {
          setReviewIndex(nextIdx);
          setReviewTutorMessage(null);
        } else {
          setReviewComplete(true);
          setReviewTutorMessage(null);
          void refreshSuggestedReview(uid, language);
        }
      } else {
        if (res.nextItem && res.nextItem.id === currentReviewItem.id) {
          setReviewItems((prev) => {
            const next = [...prev];
            next[reviewIndex] = res.nextItem!;
            return next;
          });
        }
      }
    } catch (e: unknown) {
      setError(toUserSafeErrorMessage(e));
      setReviewAnswer(toSend);
    } finally {
      setPending(null);
      setLoading(false);
    }
  }


  return (
    <LessonShell>
      {showHome ? (
        <div
          className="lessonHome"
          data-last-completed={lastCompletedLessonId || undefined}
          data-resume-lesson={resumeLessonId || undefined}
          data-next-lesson={nextLessonId || undefined}
        >
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
              <LessonSetupPanel
                userId={userId}
                language={language}
                lessonId={lessonId}
                lessons={catalog}
                onLessonChange={setLessonId}
                disabled={loading || practiceActive}
              />

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
                  <img className="lessonPrefsIcon" src={settingsIcon} alt="Settings" />
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

            <div className="lessonCatalogHeader">
              <div className="lessonCatalogTitle">Lessons</div>
              <div className="lessonCatalogSubtitle">Continue when you're ready.</div>
            </div>

            <div className="lessonCatalogList">
              {catalog.map((lesson) => {
                const status = progressMap[lesson.lessonId]?.status?.toLowerCase() ?? "not_started";
                const selected = lesson.lessonId === lessonId;
                return (
                  <button
                    key={lesson.lessonId}
                    type="button"
                    className={`lessonCatalogItem ${selected ? "isSelected" : ""}`}
                    onClick={() => setLessonId(lesson.lessonId)}
                  >
                    <div className="lessonCatalogContent">
                      <div className="lessonCatalogTitleRow">
                        <div className="lessonCatalogLessonTitle">
                          {lesson.title || lesson.lessonId}
                        </div>
                        <span className={`lessonStatusPill status-${status}`}>
                          {status === "in_progress"
                            ? "In progress"
                            : status === "completed"
                              ? "Completed"
                              : status === "needs_review"
                                ? "Needs review"
                                : "Not started"}
                        </span>
                      </div>
                      <div className="lessonCatalogDescription">
                        {lesson.description || "Continue when you're ready."}
                      </div>
                    </div>
                  </button>
                );
              })}
              {catalog.length === 0 && (
                <div className="lessonCatalogEmpty">No lessons available yet.</div>
              )}
            </div>

            <div className="lessonHomeRow lessonHomeActionsRow">
              <div className="lessonActionRow lessonActionCenter">
                <div className="lessonActionArea">
                  <div className="lessonActionStack">
                    {showResumePractice && (
                      <div className="lessonHomePracticeCard">
                        <div className="lessonResumePracticeText">Finish practice to continue.</div>
                        <PracticeCard
                          practicePrompt={practicePrompt}
                          practiceId={practiceId}
                          practiceMode={practiceMode}
                          reviewIndex={reviewIndex}
                          reviewQueueLength={reviewItems.length}
                          onStopReview={() => stopReview("Review paused. Continue when you're ready.")}
                          loading={loading}
                          pending={pending}
                          practiceTutorMessage={practiceTutorMessage}
                          practiceAnswer={practiceAnswer}
                          onPracticeAnswerChange={setPracticeAnswer}
                          practiceInputRef={practiceInputRef}
                          canSubmitPractice={canSubmitPractice}
                          onSendPractice={handleSendPractice}
                        />
                        <button
                          className="lessonPrimaryBtn lessonResumeBtn"
                          onClick={() => void handleResumePractice()}
                          disabled={loading}
                        >
                          Resume practice
                        </button>
                      </div>
                    )}
                    <button
                      className="lessonPrimaryBtn lessonActionBtn"
                      onClick={() =>
                        selectedProgressStatus === "in_progress"
                          ? void handleResume()
                          : void handleStart()
                      }
                      disabled={primaryActionDisabled}
                    >
                      {primaryActionLabel}
                    </button>
                  {showContinueNextLessonCTA && nextLessonAfterLastCompleted && (
                    <button
                      className="lessonSecondaryBtn lessonActionBtn"
                      onClick={() => void handleStart(nextLessonAfterLastCompleted)}
                      disabled={loading}
                      title={`Continue to ${nextLessonAfterLastCompleted}`}
                    >
                      Continue to next lesson
                    </button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <SuggestedReviewCard
            visible={showSuggestedReview}
            items={reviewCandidates.length > 0 ? reviewCandidates : suggestedReviewItems}
            loading={loading}
            onReviewNow={() => void beginSuggestedReview()}
            onDismiss={() => setReviewDismissed(true)}
          />

        </div>
      ) : showReviewScreen ? (
        <div className="lessonPracticeScreen">
          {error && <div className="lessonError">{error}</div>}
          <div className="lessonPracticeHeader">
            <button className="lessonSecondaryBtn" onClick={handleBack}>
              Back to lessons
            </button>
            <div className="lessonPracticeTitle">Review</div>
          </div>
          <div className="lessonPracticeCue review">Optional review</div>
          <div className="lessonPracticePanel">
            <div className="lessonReviewCard">
              {!reviewComplete && currentReviewItem ? (
                <>
                  <div className="lessonReviewHeader">
                    <div className="lessonReviewStep">
                      Review {Math.min(reviewIndex + 1, Math.max(1, reviewItems.length))}/
                      {Math.max(1, reviewItems.length)}
                    </div>
                    <button
                      type="button"
                      className="lessonSecondaryBtn"
                      onClick={() => stopReview("Review paused. Continue when you're ready.")}
                      disabled={loading}
                    >
                      Stop
                    </button>
                  </div>

                  <div className="lessonReviewPrompt">
                    <div className="lessonReviewLabel">Tutor</div>
                    <div className="lessonReviewPromptBubble">
                      {currentReviewItem.prompt}
                    </div>
                  </div>

                  {pending === "review" && (
                    <div className="lessonReviewTyping">
                      <div className="lessonReviewDots">
                        <span className="typingDot" />
                        <span className="typingDot" />
                        <span className="typingDot" />
                      </div>
                    </div>
                  )}

                  {reviewTutorMessage && (
                    <div className="lessonReviewFeedback">
                      <div className="lessonReviewMessage">{reviewTutorMessage}</div>
                    </div>
                  )}

                  <div className="lessonReviewInputRow">
                    <input
                      ref={reviewInputRef}
                      value={reviewAnswer}
                      onChange={(e) => setReviewAnswer(e.target.value)}
                      placeholder="Type your answer..."
                      className="lessonReviewInput"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmitReview) void handleSubmitReview();
                      }}
                    />
                    <button
                      type="button"
                      className="lessonPrimaryBtn"
                      onClick={() => void handleSubmitReview()}
                      disabled={!canSubmitReview}
                    >
                      Send
                    </button>
                  </div>
                </>
            ) : reviewItems.length === 0 ? (
              <div className="lessonReviewComplete">
                <div className="lessonReviewCompleteTitle">
                  No review items are available yet.
                </div>
                <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                  Back to lessons
                </button>
              </div>
            ) : (
                <div className="lessonReviewComplete">
                  <div className="lessonReviewCompleteTitle">
                    Review complete. Continue when you're ready.
                  </div>
                  <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                    Back to lessons
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {session && (
            <SessionHeader
              session={session}
              progress={progress}
              loading={loading}
              lessonTitle={currentLessonMeta?.title}
              lessonDescription={currentLessonMeta?.description}
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
                  reviewQueueLength={reviewItems.length}
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
                {practiceActive && practiceMode === "lesson" && (
                  <div className="lessonPracticeInline">
                    <PracticeCard
                      practicePrompt={practicePrompt}
                      practiceId={practiceId}
                      practiceMode={practiceMode}
                      reviewIndex={reviewIndex}
                      reviewQueueLength={reviewItems.length}
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
                    <div className="lessonCompletionCard">
                      <div className="lessonCompletionTitle">Lesson complete</div>
                      <div className="lessonCompletionSummary">
                        {reviewFocusNext.length > 0 && (
                          <div className="lessonCompletionBlock">
                            <div className="lessonCompletionLabel">Focus next</div>
                            <ul className="lessonCompletionList">
                              {reviewFocusNext.map((item, idx) => (
                                <li key={`${item}-${idx}`}>{item.replace(/_/g, " ")}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="lessonCompletionActions">
                        {reviewItemsAvailable && (
                          <button
                            className="lessonSecondaryBtn"
                            onClick={() => beginSuggestedReview()}
                            disabled={loading}
                          >
                            Review (optional)
                          </button>
                        )}
                        {nextLessonId && (
                          <button
                            className="lessonPrimaryBtn"
                            onClick={() => void handleStart(nextLessonId)}
                            disabled={loading}
                          >
                            Continue to next lesson
                          </button>
                        )}
                        <button
                          className={completionBackButtonClass}
                          onClick={handleBack}
                          disabled={loading}
                        >
                          Back to lessons
                        </button>
                      </div>

                      {!nextLessonId && (
                        <div className="lessonCompletionNote">
                          No next lesson yet. You can restart or exit.
                        </div>
                      )}
                    </div>

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
