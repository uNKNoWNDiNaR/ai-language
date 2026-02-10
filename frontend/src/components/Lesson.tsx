// frontend/src/components/Lesson.tsx

import { useEffect, useRef, useMemo, useState } from "react";
import {
  startLesson,
  submitAnswer,
  getSession,
  submitPractice,
  getSuggestedReview,
  getReviewCandidates,
  generateReviewQueue,
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
  type LessonQuestionMeta,
  type LessonTaskType,
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
  getUiStrings,
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
import { Badge, Chip, cn, type BadgeVariant } from "./ui";
import { FeedbackCard } from "./FeedbackCard";

const LAST_SESSION_KEY = "ai-language:lastSessionKey";
const LAST_SESSION_STATUS_KEY = "ai-language:lastSessionStatus";
const LAST_COMPLETED_LESSON_KEY = "ai-language:lastCompletedLessonId";

const TEACHING_PREFS_PREFIX = "ai-language:teachingPrefs:";

const INSTRUCTION_LANGUAGE_ENABLED = isInstructionLanguageEnabledFlag(
  import.meta.env.VITE_FEATURE_INSTRUCTION_LANGUAGE
);
const SUPPORT_LEVEL_ENABLED = isInstructionLanguageEnabledFlag(
  (import.meta as any).env?.VITE_FEATURE_SUPPORT_LEVEL ??
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

function isSupportMode(v: unknown): v is "auto" | "manual" {
  return v === "auto" || v === "manual";
}

function clampSupportLevel(v: unknown, fallback = 0.85): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function readTeachingPrefs(key: string): TeachingPrefs | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as {
      pace?: unknown;
      explanationDepth?: unknown;
      instructionLanguage?: unknown;
      supportLevel?: unknown;
      supportMode?: unknown;
    };

    const pace: TeachingPace = isTeachingPace(obj.pace) ? obj.pace : "normal";
    const explanationDepth: ExplanationDepth = isExplanationDepth(obj.explanationDepth)
      ? obj.explanationDepth
      : "normal";

    const instructionLanguage =
      normalizeInstructionLanguage(obj.instructionLanguage) ?? "en";

    const supportLevel = clampSupportLevel(obj.supportLevel);
    const supportMode: "auto" | "manual" = isSupportMode(obj.supportMode) ? obj.supportMode : "auto";

    return { pace, explanationDepth, instructionLanguage, supportLevel, supportMode };
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

const LESSON_CONCEPTS: Record<string, string[]> = {
  "basic-1": ["greetings", "introductions", "polite phrases"],
  "basic-2": ["to be", "pronouns", "basic nouns"],
  "basic-3": ["articles", "simple statements", "word order"],
  "basic-4": ["negation", "adjectives", "numbers"],
  "basic-5": ["questions", "wh-words", "yes/no"],
  "basic-6": ["requests", "clarification", "help"],
  "basic-7": ["daily routines", "time phrases", "verbs"],
  "basic-8": ["directions", "locations", "prepositions"],
  "basic-9": ["food & drinks", "ordering", "quantities"],
  "basic-10": ["shopping", "prices", "preferences"],
  "basic-11": ["travel", "transport", "tickets"],
  "basic-12": ["plans", "future", "invitations"],
};

type LessonUnitDef = {
  key: string;
  label: string;
  order: number;
  range: [number, number];
};

const LESSON_UNITS: LessonUnitDef[] = [
  { key: "introductions", label: "Introductions", order: 1, range: [1, 1] },
  { key: "simple-sentences", label: "Simple sentences", order: 2, range: [2, 4] },
  { key: "questions", label: "Questions", order: 3, range: [5, 6] },
  { key: "everyday-use", label: "Everyday use", order: 4, range: [7, 12] },
];

const STATUS_ACCENT: Record<string, string> = {
  not_started: "#E5E7EB",
  in_progress: "#2563EB",
  completed: "#16A34A",
  needs_review: "#D97706",
};

function getLessonNumber(lessonId: string): number | null {
  const match = lessonId.trim().match(/basic-(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLessonConcepts(lessonId: string): string[] {
  return LESSON_CONCEPTS[lessonId] ?? [];
}

function getLessonUnitDef(lessonId: string): LessonUnitDef {
  const lessonNumber = getLessonNumber(lessonId);
  if (lessonNumber !== null) {
    const match = LESSON_UNITS.find(
      (unit) => lessonNumber >= unit.range[0] && lessonNumber <= unit.range[1]
    );
    if (match) return match;
  }
  return { key: "other", label: "More lessons", order: 99, range: [0, 0] };
}

type LessonUnit = {
  key: string;
  label: string;
  order: number;
  lessons: LessonCatalogItem[];
};

function buildLessonUnits(lessons: LessonCatalogItem[]): LessonUnit[] {
  const grouped = new Map<string, LessonUnit>();
  const safeLessons = lessons.filter(
    (lesson) => lesson && typeof lesson.lessonId === "string" && lesson.lessonId.trim().length > 0
  );
  safeLessons.forEach((lesson) => {
    const unit = getLessonUnitDef(lesson.lessonId);
    const existing = grouped.get(unit.key);
    if (existing) {
      existing.lessons.push(lesson);
      return;
    }
    grouped.set(unit.key, {
      key: unit.key,
      label: unit.label,
      order: unit.order,
      lessons: [lesson],
    });
  });
  grouped.forEach((unit) => {
    unit.lessons.sort((a, b) => {
      const aNum = getLessonNumber(a.lessonId) ?? 0;
      const bNum = getLessonNumber(b.lessonId) ?? 0;
      return aNum - bNum;
    });
  });
  return Array.from(grouped.values()).sort((a, b) => a.order - b.order);
}

function clampSupport(value: number): number {
  if (!Number.isFinite(value)) return 0.85;
  return Math.max(0, Math.min(1, value));
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

function formatPromptForTaskType(prompt: string, taskType?: LessonTaskType): string {
  const raw = (prompt ?? "").trim();
  if (!raw) return raw;
  const sayPrefix = /^say\s*:/i;
  const speakPrefix = /\b(say|ask|reply)\s*:/gi;

  if (taskType === "speaking") {
    let lastIndex = -1;
    let lastMatch = "";
    let match: RegExpExecArray | null;
    while ((match = speakPrefix.exec(raw)) !== null) {
      lastIndex = match.index;
      lastMatch = match[0];
    }
    if (lastIndex >= 0) {
      const rest = raw.slice(lastIndex + lastMatch.length).trim();
      return rest ? `Say: ${rest}` : "Say:";
    }
    return `Say: ${raw}`;
  }

  if (sayPrefix.test(raw)) {
    return raw.replace(sayPrefix, "").trim();
  }

  return raw;
}

function replacePromptInText(text: string, rawPrompt: string, formattedPrompt: string): string {
  if (!text) return text;
  const raw = (rawPrompt ?? "").trim();
  const formatted = (formattedPrompt ?? "").trim();
  if (!raw || !formatted) return text;

  const candidates = [raw, `"${raw}"`, `“${raw}”`];
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const lineTrim = lines[i].trim();
    if (candidates.includes(lineTrim)) {
      lines[i] = lines[i].replace(lines[i].trim(), formatted);
      return lines.join("\n");
    }
  }

  const idx = text.lastIndexOf(raw);
  if (idx !== -1) {
    return text.slice(0, idx) + formatted + text.slice(idx + raw.length);
  }

  return text;
}

function applyQuestionMetaToMessages(
  messages: ChatMessage[],
  meta: LessonQuestionMeta | null
): ChatMessage[] {
  if (!meta?.prompt || messages.length === 0) return messages;
  const formattedPrompt = formatPromptForTaskType(meta.prompt, meta.taskType);
  if (!formattedPrompt) return messages;

  const lastAssistantIndex = [...messages]
    .map((m, idx) => (m.role === "assistant" ? idx : -1))
    .filter((idx) => idx >= 0)
    .slice(-1)[0];
  if (lastAssistantIndex === undefined) return messages;

  const msg = messages[lastAssistantIndex];
  if ((msg.content ?? "").startsWith(REVEAL_PREFIX)) return messages;

  const updatedContent = replacePromptInText(msg.content ?? "", meta.prompt, formattedPrompt);
  const updatedPrimary = msg.primaryText
    ? replacePromptInText(msg.primaryText, meta.prompt, formattedPrompt)
    : undefined;

  if (updatedContent === msg.content && updatedPrimary === msg.primaryText) return messages;

  const next = messages.slice();
  next[lastAssistantIndex] = {
    ...msg,
    content: updatedContent,
    ...(updatedPrimary !== undefined ? { primaryText: updatedPrimary } : {}),
  };
  return next;
}

export function Lesson() {
  const [userId] = useState("user-1");
  const [language] = useState<"en" | "de" | "es" | "fr">("en");
  const [lessonId, setLessonId] = useState("basic-1");
  const [session, setSession] = useState<LessonSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questionMeta, setQuestionMeta] = useState<LessonQuestionMeta | null>(null);
  const [answer, setAnswer] = useState("");
  const [clozeEmptyError, setClozeEmptyError] = useState<string | null>(null);
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
  const [supportLevel, setSupportLevel] = useState(0.85);
  const [supportMode, setSupportMode] = useState<"auto" | "manual">("auto");

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
  const [practiceMode, setPracticeMode] = useState<null | "lesson" | "review">(null);

  const clozeInputRef = useRef<HTMLInputElement | null>(null);

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
  const [homeDataError, setHomeDataError] = useState<string | null>(null);
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

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
  const lessonListRef = useRef<HTMLDivElement | null>(null);

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
  const busy = loading || pending !== null;
  const disableStartResume = busy || practiceActive || sessionActive;

  const inProgressSession = Boolean(session) && !lessonCompleted;
  const showSuggestedReview =
    !inProgressSession && !practiceActive && reviewItemsAvailable && !reviewDismissed;
  const isReviewPractice = practiceMode === "review";
  const uiStrings = useMemo(
    () => getUiStrings(instructionLanguage ?? null),
    [instructionLanguage]
  );

  const lessonUnits = useMemo(() => buildLessonUnits(catalog), [catalog]);

  const heroLesson = useMemo(() => {
    if (!catalog.length) return null;
    return catalog.find((lesson) => lesson.lessonId === lessonId) ?? catalog[0] ?? null;
  }, [catalog, lessonId]);

  const heroConcepts = useMemo(() => {
    if (!heroLesson) return [];
    return getLessonConcepts(heroLesson.lessonId).slice(0, 3);
  }, [heroLesson]);

  const inProgressLessonId = useMemo(() => {
    if (resumeLessonId) return resumeLessonId;
    const match = Object.values(progressMap).find(
      (doc) => doc?.status?.toLowerCase() === "in_progress"
    );
    return match?.lessonId ?? "";
  }, [progressMap, resumeLessonId]);

  const hintMessage = useMemo(() => {
    if (!hintText) return null;
    return `${uiStrings.hintLabel}\n${hintText}`;
  }, [hintText, uiStrings]);

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

  const feedbackSessionKey = useMemo(() => {
    if (sessionActive) return currentSessionKey;
    return lastSessionKey || currentSessionKey;
  }, [sessionActive, currentSessionKey, lastSessionKey]);

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
      setSupportLevel(clampSupportLevel(loaded.supportLevel));
      setSupportMode(loaded.supportMode ?? "auto");
      return;
    }
    setTeachingPace("normal");
    setExplanationDepth("normal");
    setInstructionLanguage("en");
    setSupportLevel(0.85);
    setSupportMode("auto");
  }, [teachingPrefsKey]);

  useEffect(() => {
    writeTeachingPrefs(teachingPrefsKey, {
      pace: teachingPace,
      explanationDepth,
      instructionLanguage,
      supportLevel,
      supportMode,
    });
  }, [teachingPrefsKey, teachingPace, explanationDepth, instructionLanguage, supportLevel, supportMode]);

  useEffect(() => {
    void refreshSuggestedReview();
  }, [userId, language]);

  useEffect(() => {
    setReviewDismissed(false);
  }, [userId, language]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshHomeData(userId, language);
    })();
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

  useEffect(() => {
    if (!lessonUnits.length) return;
    const inProgressUnitKey = inProgressLessonId
      ? getLessonUnitDef(inProgressLessonId).key
      : "";
    setOpenUnits((prev) => {
      let changed = false;
      const next = { ...prev };
      lessonUnits.forEach((unit, idx) => {
        if (next[unit.key] === undefined) {
          next[unit.key] = idx === 0;
          changed = true;
        }
      });
      if (inProgressUnitKey && !next[inProgressUnitKey]) {
        next[inProgressUnitKey] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [lessonUnits, inProgressLessonId]);

  const teachingPrefsPayload = useMemo(
    () =>
      buildTeachingPrefsPayload({
        pace: teachingPace,
        explanationDepth,
        instructionLanguage,
        supportLevel,
        supportMode,
        enableInstructionLanguage: INSTRUCTION_LANGUAGE_ENABLED,
      }),
    [teachingPace, explanationDepth, instructionLanguage, supportLevel, supportMode]
  );


  const canResume =
    !busy && !practiceActive && !sessionActive && lastSessionStatus !== "completed";

  function isLessonResumable(lessonIdValue: string): boolean {
    if (!canResume) return false;
    const lid = lessonIdValue.trim();
    if (!lid) return false;
    const key = `${userId.trim()}|${language}|${lid}`;
    return (lastSessionKey && lastSessionKey === key) || resumeLessonId === lid;
  }

  const canResumeSelected = isLessonResumable(lessonId);

  const heroPrimaryLabel = canResumeSelected
    ? uiStrings.continueLabel ?? "Continue"
    : uiStrings.startLabel;
  const primaryActionDisabled = canResumeSelected ? false : disableStartResume;

  function getLessonStatusInfo(lessonIdValue: string): {
    status: string;
    statusLabel: string;
    resumable: boolean;
    accent: string;
  } {
    const status = progressMap[lessonIdValue]?.status?.toLowerCase() ?? "not_started";
    const resumable = isLessonResumable(lessonIdValue);
    const statusLabel =
      status === "in_progress"
        ? resumable
          ? uiStrings.statusInProgress
          : uiStrings.statusPaused
        : status === "completed"
          ? uiStrings.statusCompleted
          : status === "needs_review"
            ? uiStrings.statusNeedsReview
            : uiStrings.statusNotStarted;
    return {
      status,
      resumable,
      statusLabel,
      accent: STATUS_ACCENT[status] ?? STATUS_ACCENT.not_started,
    };
  }

  function getBadgeVariant(status: string): BadgeVariant {
    switch (status) {
      case "in_progress":
        return "progress";
      case "completed":
        return "success";
      case "needs_review":
        return "warning";
      default:
        return "neutral";
    }
  }

  const heroStatus = heroLesson ? getLessonStatusInfo(heroLesson.lessonId) : null;

  const formattedPrompt = useMemo(() => {
    if (!questionMeta?.prompt) return "";
    return formatPromptForTaskType(questionMeta.prompt, questionMeta.taskType);
  }, [questionMeta]);

  const isClozePrompt = useMemo(() => {
    if (!questionMeta?.prompt) return false;
    if (questionMeta.taskType === "speaking") return false;
    return (
      questionMeta.expectedInput === "blank" || questionMeta.prompt.includes("___")
    );
  }, [questionMeta]);

  const canSubmitAnswer = useMemo(() => {
    return (
      Boolean(session) &&
      answer.trim().length > 0 &&
      !loading &&
      !practiceActive &&
      !lessonCompleted
    );
  }, [session, answer, loading, practiceActive, lessonCompleted]);

  const clozeHelperText = isClozePrompt ? "Type the missing word." : "";

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
    Boolean(nextLessonAfterLastCompleted) && !canResumeSelected && !practiceActive;

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
    if (!isClozePrompt) return;
    if (loading || practiceActive || lessonCompleted) return;
    setTimeout(() => {
      clozeInputRef.current?.focus();
    }, 0);
  }, [isClozePrompt, formattedPrompt, loading, practiceActive, lessonCompleted]);

  useEffect(() => {
    setAnswer("");
    setClozeEmptyError(null);
  }, [formattedPrompt]);

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

      let items = Array.isArray(queueRes.items) ? queueRes.items : [];
      setSuggestedReviewItems(items);
      setReviewSummary(queueRes.summary ?? null);

      const candidatesRaw = Array.isArray(candidateRes.items) ? candidateRes.items : [];
      const candidates = candidatesRaw.filter(
        (item) => typeof item.confidence !== "number" || item.confidence < 0.9
      );
      setReviewCandidates(candidates);

      if (items.length === 0 && candidates.length > 0) {
        const candidateLessonIds = Array.from(
          new Set(
            candidates
              .map((item) => (typeof item.lessonId === "string" ? item.lessonId.trim() : ""))
              .filter(Boolean)
          )
        ).slice(0, 3);

        try {
          if (candidateLessonIds.length > 0) {
            await Promise.all(
              candidateLessonIds.map((lessonId) =>
                generateReviewQueue({ userId: uid, language: lang, lessonId })
              )
            );
          }

          const refreshedQueue = await getSuggestedReview({
            userId: uid,
            language: lang,
            maxItems: 5,
          });
          items = Array.isArray(refreshedQueue.items) ? refreshedQueue.items : [];
          setSuggestedReviewItems(items);
          setReviewSummary(refreshedQueue.summary ?? null);
        } catch {
          // ignore: keep empty queue
        }
      }

      return { items, candidates };
    } catch {
      setSuggestedReviewItems([]);
      setReviewSummary(null);
      setReviewCandidates([]);
    }
  }

  async function refreshHomeData(nextUserId?: string, nextLanguage?: SupportedLanguage) {
    const uid = (nextUserId ?? userId).trim();
    const lang = (nextLanguage ?? language) as SupportedLanguage;
    if (!uid || !lang) {
      setCatalog([]);
      setProgressMap({});
      setResumeLessonId(null);
      setHomeDataError("Couldn’t load lessons. Check the server and try again.");
      return;
    }

    setHomeDataError(null);

    try {
      const [catalogRes, progressRes] = await Promise.all([
        getLessonCatalog(lang),
        getUserProgress(uid, lang),
      ]);

      const lessons = Array.isArray(catalogRes.lessons)
        ? catalogRes.lessons.filter(
            (lesson): lesson is LessonCatalogItem =>
              Boolean(lesson && typeof lesson.lessonId === "string" && lesson.lessonId.trim())
          )
        : [];
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
        sessionKeyParts[0] === uid &&
        sessionKeyParts[1] === lang
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
      setHomeDataError("Couldn’t load lessons. Check the server and try again.");
      setCatalog([]);
      setProgressMap({});
      setResumeLessonId(null);
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
      try {
        const candidateLessonIds = Array.from(
          new Set(
            reviewCandidates
              .map((item) => (typeof item.lessonId === "string" ? item.lessonId.trim() : ""))
              .filter(Boolean)
          )
        ).slice(0, 3);

        if (candidateLessonIds.length > 0) {
          await Promise.all(
            candidateLessonIds.map((lessonId) =>
              generateReviewQueue({ userId: userId.trim(), language, lessonId })
            )
          );
        }
      } catch {
        // ignore and fall back to refresh
      }

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

  function toggleUnit(unitKey: string) {
    setOpenUnits((prev) => ({ ...prev, [unitKey]: !prev[unitKey] }));
  }

  function handleChooseAnotherLesson() {
    const target = lessonListRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }

  async function startLessonFlow(targetLessonId: string, restart: boolean) {
    setError(null);

    setSession(null);
    setMessages([]);
    setQuestionMeta(null);
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
      const questionMeta = res.question ?? null;
      setMessages(applyQuestionMetaToMessages(res.session.messages ?? [], questionMeta));
      setQuestionMeta(questionMeta);
      setHintText(null);
      setProgress(res.progress ?? null);
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

      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
      setPracticeMode(null);
      setPracticeScreenOpen(false);
      void refreshSuggestedReview(res.session.userId, res.session.language);
      void refreshHomeData(res.session.userId, res.session.language);
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

    if (!canResumeSelected) return;

    setLoading(true);
    setPending("resume");
    scrollOnEnterRef.current = true;

    try {
      const res = await getSession(userId.trim());
      setSession(res.session);
      setLessonId(res.session.lessonId);
      const questionMeta = res.question ?? null;
      setMessages(applyQuestionMetaToMessages(res.session.messages ?? [], questionMeta));
      setQuestionMeta(questionMeta);
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
      void refreshHomeData(res.session.userId, res.session.language);
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
    updateLocalProgress(lessonId, "in_progress");
    setResumeLessonId(lessonId);
    setLastSessionStatus("in_progress");
    void refreshHomeData(userId, language);
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
    setQuestionMeta(null);
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
    void refreshHomeData(userId, language);
  }

  function handleBack() {
    resetToHome({ confirm: false, preservePractice: true });
  }

  function adjustSupport(delta: number) {
    setSupportMode("manual");
    setSupportLevel((prev) => clampSupport(prev + delta));
  }

  function handleAnswerChange(value: string) {
    setAnswer(value);
    if (clozeEmptyError) setClozeEmptyError(null);
  }

  async function handleSendAnswer() {
    if (!session || practiceActive || lessonCompleted) return;
    if (isClozePrompt && !answer.trim()) {
      setClozeEmptyError("Please type the missing word.");
      return;
    }

    setError(null);
    setLoading(true);
    setPending("answer");
    setHintText(null);

    const trimmedAnswer = answer.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmedAnswer };
    setMessages((prev) => [...prev, userMsg]);

    const toSend = trimmedAnswer;
    setAnswer("");
    setClozeEmptyError(null);

    const previousStatus = progress?.status ?? "";

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
      const questionMeta = res.question ?? null;
        
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

      setMessages(applyQuestionMetaToMessages(nextMessages, questionMeta));
      setQuestionMeta(questionMeta);

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

      const nextStatus = res.progress?.status ?? "";
      const statusChanged = Boolean(nextStatus && nextStatus !== previousStatus);

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
        if (statusChanged) {
          void refreshHomeData(res.session.userId, res.session.language);
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
          className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10"
          data-last-completed={lastCompletedLessonId || undefined}
          data-resume-lesson={resumeLessonId || undefined}
          data-next-lesson={nextLessonId || undefined}
        >
          <div className="mx-auto w-full max-w-5xl">
            <div className="rounded-2xl bg-white/90 shadow-lg ring-1 ring-slate-300/60 backdrop-blur p-6 sm:p-8">
              <div className="space-y-6">
                {error && <div className="lessonError">{error}</div>}

                {reviewBanner && (
                  <div className="rounded-2xl border border-slate-300/60 bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/50">
                    {reviewBanner}
                  </div>
                )}

                <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <LessonSetupPanel
                      userId={userId}
                      language={language}
                      lessonId={lessonId}
                      lessons={catalog}
                      onLessonChange={setLessonId}
                      disabled={loading || practiceActive}
                    />

                    <div className="lessonPrefsArea self-start lg:self-auto">
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
                                <option value="es" disabled>
                                  Spanish (will be implemented later)
                                </option>
                                <option value="fr" disabled>
                                  French (will be implemented later)
                                </option>
                              </select>
                            </label>
                          )}

                          {SUPPORT_LEVEL_ENABLED && (
                            <div className="lessonPrefsField">
                              <span className="lessonPrefsLabel">
                                Support level ({supportMode === "manual" ? "Manual" : "Auto"})
                              </span>
                              <div className="lessonPrefsSupportActions">
                                <button
                                  type="button"
                                  className="lessonPrefsSupportBtn"
                                  onClick={() => adjustSupport(0.15)}
                                  disabled={loading}
                                >
                                  More support
                                </button>
                                <button
                                  type="button"
                                  className="lessonPrefsSupportBtn"
                                  onClick={() => adjustSupport(-0.15)}
                                  disabled={loading}
                                >
                                  Less support
                                </button>
                              </div>
                              <div className="lessonPrefsHelp">
                                More support = more help in your instruction language
                              </div>
                              <div className="lessonPrefsHelp">
                                Less support = more target-language immersion
                              </div>
                            </div>
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
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
                <aside className="space-y-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1">
                  <div className="rounded-2xl border border-blue-200/80 bg-white p-5 shadow-sm ring-1 ring-blue-100/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="mt-0.5 text-xs text-slate-500">
                        {uiStrings.continueWhenReady}
                      </div>
                      {heroStatus && (
                        <Badge className="shrink-0" variant={getBadgeVariant(heroStatus.status)}>
                          {heroStatus.statusLabel}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3">
                      <span className="inline-block rounded-xl border border-blue-200/70 bg-blue-100/60 px-3 py-2 text-lg font-semibold text-blue-900 shadow-sm">
                        {heroLesson?.title || heroLesson?.lessonId || uiStrings.lessonsTitle}
                      </span>
                    </div>

                    {heroConcepts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {heroConcepts.map((chip) => (
                          <Chip key={chip}>{chip}</Chip>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>~6-10 min</span>
                    </div>

                    <button
                      className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                      onClick={() =>
                        canResumeSelected ? void handleResume() : void handleStart()
                      }
                      disabled={primaryActionDisabled}
                    >
                      {heroPrimaryLabel}
                    </button>
                    <button
                      type="button"
                      className="mt-3 inline-flex text-sm font-medium text-blue-700 hover:text-blue-800"
                      onClick={handleChooseAnotherLesson}
                    >
                      Choose another lesson
                    </button>
                  </div>

                  {showResumePractice && (
                    <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                      <div className="text-sm text-slate-600">{uiStrings.finishPracticeLabel}</div>
                      <div className="mt-3">
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
                          uiStrings={uiStrings}
                        />
                      </div>
                      <button
                        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        onClick={() => void handleResumePractice()}
                        disabled={loading}
                      >
                        {uiStrings.resumePracticeLabel}
                      </button>
                    </div>
                  )}

                  <SuggestedReviewCard
                    visible={showSuggestedReview}
                    items={suggestedReviewItems}
                    loading={loading}
                    onReviewNow={() => void beginSuggestedReview()}
                    onDismiss={() => setReviewDismissed(true)}
                    uiStrings={uiStrings}
                  />

                  <div className="rounded-2xl border border-slate-300/70 bg-white p-5 shadow-sm ring-1 ring-slate-200/50">
                    <div className="text-sm font-semibold text-slate-800">What's next</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Choose one lesson and settle in for a calm, focused session.
                    </div>
                  </div>

                  <div className="pt-1">
                    <FeedbackCard
                      screen="home"
                      userId={userId}
                      language={language}
                      lessonId={lessonId}
                      sessionKey={feedbackSessionKey || undefined}
                      instructionLanguage={instructionLanguage}
                      currentQuestionIndex={session?.currentQuestionIndex ?? undefined}
                      disabled={loading}
                      triggerLabel="Optional feedback"
                      triggerClassName="inline-flex text-sm font-medium text-slate-600 hover:text-slate-800"
                    />
                  </div>
                </aside>

                <section
                  className="space-y-4"
                  ref={lessonListRef}
                  tabIndex={-1}
                  aria-label="Lesson list"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-base font-semibold text-slate-900">
                        {uiStrings.lessonsTitle}
                      </div>
                      {showContinueNextLessonCTA && nextLessonAfterLastCompleted && (
                        <button
                          className="rounded-xl border border-slate-300/70 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                          onClick={() => void handleStart(nextLessonAfterLastCompleted)}
                          disabled={loading}
                          title={`Continue to ${nextLessonAfterLastCompleted}`}
                        >
                          {uiStrings.continueNextLesson}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-slate-500">{uiStrings.continueWhenReady}</div>
                  </div>

                  {homeDataError && (
                    <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4 text-sm text-slate-700 shadow-sm ring-1 ring-amber-100/60">
                      <div>{homeDataError}</div>
                      <button
                        type="button"
                        className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                        onClick={() => void refreshHomeData()}
                        disabled={busy}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    {lessonUnits.map((unit, idx) => {
                      const isOpen = openUnits[unit.key] ?? idx === 0;
                      const panelId = `unit-panel-${unit.key}`;
                      return (
                        <div key={unit.key} className="rounded-2xl border border-slate-300/70 bg-white p-4 shadow-sm ring-1 ring-slate-200/60 sm:p-5">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-4 border-b border-slate-200/70 pb-3"
                            onClick={() => toggleUnit(unit.key)}
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                          >
                            <div className="text-left">
                              <div className="text-xs font-semibold tracking-wide text-slate-500">
                                {`Unit ${idx + 1}`}
                              </div>
                              <div className="mt-0.5 text-sm font-semibold text-slate-900">
                                {unit.label}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <span>{unit.lessons.length} lessons</span>
                              <span className={cn("transition", isOpen ? "rotate-180" : "")}>▾</span>
                            </div>
                          </button>

                          <div
                            id={panelId}
                            className={cn(
                              "overflow-hidden transition-all duration-200 ease-out",
                              isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                            )}
                          >
                            <div className="mt-4 space-y-3">
                              {unit.lessons.map((lesson) => {
                                if (!lesson?.lessonId) return null;
                                const { status, statusLabel, accent } = getLessonStatusInfo(
                                  lesson.lessonId
                                );
                                const selected = lesson.lessonId === lessonId;
                                const isCompact = status === "completed";
                                const conceptChips = getLessonConcepts(lesson.lessonId).slice(0, 3);
                                const lessonReviewAvailable = suggestedReviewItems.some(
                                  (item) => item.lessonId === lesson.lessonId
                                );
                                return (
                                  <div
                                    key={lesson.lessonId}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "rounded-xl border border-slate-300/70 bg-slate-50/80 p-4 shadow-sm transition-colors hover:bg-slate-100/70",
                                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200",
                                      selected ? "ring-2 ring-blue-200" : ""
                                    )}
                                    onClick={() => setLessonId(lesson.lessonId)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setLessonId(lesson.lessonId);
                                      }
                                    }}
                                    style={{ borderLeftWidth: 4, borderLeftColor: accent }}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="text-sm font-semibold text-slate-900">
                                        {lesson.title || lesson.lessonId}
                                      </div>
                                      <Badge className="shrink-0" variant={getBadgeVariant(status)}>
                                        {statusLabel}
                                      </Badge>
                                    </div>
                                    {!isCompact && (
                                      <div className="mt-1 text-sm text-slate-600">
                                        {lesson.description || uiStrings.continueWhenReady}
                                      </div>
                                    )}
                                    {!isCompact && conceptChips.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {conceptChips.map((chip) => (
                                          <Chip key={chip}>{chip}</Chip>
                                        ))}
                                      </div>
                                    )}
                                    {isCompact && lessonReviewAvailable && (
                                      <button
                                        type="button"
                                        className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void beginSuggestedReview();
                                        }}
                                      >
                                        Review
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {lessonUnits.length === 0 && (
                      <div className="text-sm text-slate-500">{uiStrings.noLessonsLabel}</div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : showReviewScreen ? (
        <div className="lessonPracticeScreen">
          {error && <div className="lessonError">{error}</div>}
          <div className="lessonPracticeHeader">
            <button className="lessonSecondaryBtn" onClick={handleBack}>
              {uiStrings.backToLessons}
            </button>
            <div className="lessonPracticeTitle">{uiStrings.reviewLabel}</div>
          </div>
          <div className="lessonPracticeCue review">{uiStrings.optionalReviewLabel}</div>
          <div className="lessonPracticePanel">
            <div className="lessonReviewCard">
              {!reviewComplete && currentReviewItem ? (
                <>
                  <div className="lessonReviewHeader">
                      <div className="lessonReviewStep">
                      {uiStrings.reviewLabel} {Math.min(reviewIndex + 1, Math.max(1, reviewItems.length))}/
                      {Math.max(1, reviewItems.length)}
                    </div>
                    <button
                      type="button"
                      className="lessonSecondaryBtn"
                      onClick={() => stopReview("Review paused. Continue when you're ready.")}
                      disabled={loading}
                    >
                      {uiStrings.stopLabel}
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
                      placeholder={uiStrings.reviewPlaceholder}
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
                      {uiStrings.sendLabel}
                    </button>
                  </div>
                </>
            ) : reviewItems.length === 0 ? (
              <div className="lessonReviewComplete">
                <div className="lessonReviewCompleteTitle">
                  {uiStrings.noReviewItemsLabel}
                </div>
                <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                  {uiStrings.backToLessons}
                </button>
              </div>
            ) : (
                <div className="lessonReviewComplete">
                  <div className="lessonReviewCompleteTitle">
                    {uiStrings.reviewCompleteLabel}
                  </div>
                  <button type="button" className="lessonPrimaryBtn" onClick={handleBack}>
                    {uiStrings.backToLessons}
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
              uiStrings={uiStrings}
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
                    {uiStrings.backLabel}
                  </button>
                  <div className="lessonPracticeTitle">
                    {isReviewPractice ? uiStrings.reviewPracticeTitle : uiStrings.practiceLabel}
                  </div>
                </div>
              )}

              <div
                className={`lessonPracticeCue ${
                  isReviewPractice ? "review" : "required"
                }`}
              >
                {isReviewPractice
                  ? uiStrings.optionalReviewLabel
                  : uiStrings.practiceRequiredLabel}
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
                  uiStrings={uiStrings}
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
            uiStrings={uiStrings}
            instructionLanguage={instructionLanguage}
            clozeActive={isClozePrompt}
            clozePrompt={formattedPrompt}
            clozeValue={answer}
            onClozeChange={handleAnswerChange}
            onClozeSubmit={handleSendAnswer}
            clozeDisabled={!sessionActive || loading || practiceActive || lessonCompleted}
            clozeInputRef={clozeInputRef}
            clozeHelperText={isClozePrompt ? clozeHelperText : ""}
            clozeErrorText={clozeEmptyError ?? ""}
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
                          uiStrings={uiStrings}
                        />
                  </div>
                )}
                {lessonCompleted && !practiceActive && (
                  <>
                    <div className="lessonCompletionCard">
                      <div className="lessonCompletionTitle">{uiStrings.lessonCompleteTitle}</div>
                      <div className="lessonCompletionSummary">
                        {reviewFocusNext.length > 0 && (
                          <div className="lessonCompletionBlock">
                            <div className="lessonCompletionLabel">{uiStrings.focusNextLabel}</div>
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
                            {uiStrings.reviewOptionalButton}
                          </button>
                        )}
                        {nextLessonId && (
                          <button
                            className="lessonPrimaryBtn"
                            onClick={() => void handleStart(nextLessonId)}
                            disabled={loading}
                          >
                            {uiStrings.continueNextLesson}
                          </button>
                        )}
                        <button
                          className={completionBackButtonClass}
                          onClick={handleBack}
                          disabled={loading}
                        >
                          {uiStrings.backToLessons}
                        </button>
                      </div>

                      {!nextLessonId && (
                        <div className="lessonCompletionNote">
                          {uiStrings.noNextLessonNote}
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
              onAnswerChange={handleAnswerChange}
              answerInputRef={answerInputRef}
              canSubmitAnswer={canSubmitAnswer}
              onSendAnswer={handleSendAnswer}
              sessionActive={sessionActive}
              loading={loading}
              practiceActive={practiceActive}
              lessonCompleted={lessonCompleted}
              hideInput={isClozePrompt}
              helperText=""
              errorText=""
              uiStrings={uiStrings}
            />
          )}
        </>
      )}
    </LessonShell>
  );
}
