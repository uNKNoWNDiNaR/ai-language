import type {
  SupportedLanguage,
  TeachingPace,
  ExplanationDepth,
  TeachingPrefs,
  SupportLevel,
} from "../api/lessonAPI";

export function isInstructionLanguageEnabledFlag(value: unknown): boolean {
  const t = String(value ?? "").trim().toLowerCase();
  return t === "1" || t === "true";
}

export function normalizeInstructionLanguage(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "en" || t === "de" || t === "es" || t === "fr") return t as SupportedLanguage;
  return null;
}

export function buildTeachingPrefsPayload(args: {
  pace: TeachingPace;
  explanationDepth: ExplanationDepth;
  instructionLanguage?: unknown;
  supportLevel?: SupportLevel;
  enableInstructionLanguage?: boolean;
}): TeachingPrefs {
  const base: TeachingPrefs = {
    pace: args.pace,
    explanationDepth: args.explanationDepth,
  };
  if (args.supportLevel === "high" || args.supportLevel === "medium" || args.supportLevel === "low") {
    base.supportLevel = args.supportLevel;
  }
  if (!args.enableInstructionLanguage) return base;
  const normalized = normalizeInstructionLanguage(args.instructionLanguage);
  return normalized ? { ...base, instructionLanguage: normalized } : base;
}

export type UiStrings = {
  hintLabel: string;
  explanationLabel: string;
  answerLabel: string;
  supportLabel: string;
  tutorLabel: string;
  youLabel: string;
  startLessonEmpty: string;
  reviewLabel: string;
  stopLabel: string;
  backToLessons: string;
  lessonCompleteTitle: string;
  lessonCompleteSubtitle: string;
  focusNextLabel: string;
  reviewOptionalButton: string;
  reviewIntroMessage: string;
  continueNextLesson: string;
  continueLabel: string;
  startLabel: string;
  resumeLabel: string;
  optionalReviewLabel: string;
  optionalLabel: string;
  reviewNowLabel: string;
  reviewNotNowLabel: string;
  reviewReadyMessage: string;
  practiceLabel: string;
  practiceCompleteToContinue: string;
  practicePlaceholder: string;
  sendLabel: string;
  finishPracticeLabel: string;
  resumePracticeLabel: string;
  noLessonsLabel: string;
  noReviewItemsLabel: string;
  reviewCompleteLabel: string;
  noNextLessonNote: string;
  reviewPlaceholder: string;
  backLabel: string;
  reviewPracticeTitle: string;
  practiceRequiredLabel: string;
  lessonsTitle: string;
  continueWhenReady: string;
  statusInProgress: string;
  statusPaused: string;
  statusCompleted: string;
  statusNeedsReview: string;
  statusNotStarted: string;
  startLessonFirst: string;
  lessonCompletedMessage: string;
  finishPracticeFirst: string;
  answerPlaceholder: string;
};

const UI_STRINGS: Record<SupportedLanguage, UiStrings> = {
  en: {
    hintLabel: "Hint",
    explanationLabel: "Explanation",
    answerLabel: "Answer",
    supportLabel: "Support",
    tutorLabel: "Tutor",
    youLabel: "You",
    startLessonEmpty: "Start a lesson to begin.",
    reviewLabel: "Review",
    stopLabel: "Stop",
    backToLessons: "Back to lessons",
    lessonCompleteTitle: "Lesson complete",
    lessonCompleteSubtitle: "Nice work. You're done for now.",
    focusNextLabel: "Focus next",
    reviewOptionalButton: "Review (optional)",
    reviewIntroMessage: "Let's do a quick review.",
    continueNextLesson: "Continue to next lesson",
    continueLabel: "Continue",
    startLabel: "Start",
    resumeLabel: "Resume",
    optionalReviewLabel: "Optional review",
    optionalLabel: "Optional",
    reviewNowLabel: "Review now",
    reviewNotNowLabel: "Not now",
    reviewReadyMessage: "Optional review ready ({count} items). Continue when you're ready.",
    practiceLabel: "Practice",
    practiceCompleteToContinue: "Complete this to continue",
    practicePlaceholder: "Answer the practice...",
    sendLabel: "Send",
    finishPracticeLabel: "Finish practice to continue.",
    resumePracticeLabel: "Resume practice",
    noLessonsLabel: "No lessons available yet.",
    noReviewItemsLabel: "No review items are available yet.",
    reviewCompleteLabel: "Review complete. Continue when you're ready.",
    noNextLessonNote: "No next lesson yet. You can restart or exit.",
    reviewPlaceholder: "Type your answer...",
    backLabel: "Back",
    reviewPracticeTitle: "Review practice",
    practiceRequiredLabel: "Required to continue",
    lessonsTitle: "Lessons",
    continueWhenReady: "Continue when you're ready.",
    statusInProgress: "In progress",
    statusPaused: "Paused",
    statusCompleted: "Completed",
    statusNeedsReview: "Needs review",
    statusNotStarted: "Not started",
    startLessonFirst: "Start a lesson first...",
    lessonCompletedMessage: "Lesson completed - restart or exit.",
    finishPracticeFirst: "Finish the practice above first...",
    answerPlaceholder: "Type your answer...",
  },
  de: {
    hintLabel: "Hinweis",
    explanationLabel: "Erklärung",
    answerLabel: "Antwort",
    supportLabel: "Unterstützung",
    tutorLabel: "Tutor",
    youLabel: "Du",
    startLessonEmpty: "Starte eine Lektion, um zu beginnen.",
    reviewLabel: "Wiederholung",
    stopLabel: "Stopp",
    backToLessons: "Zurück zu den Lektionen",
    lessonCompleteTitle: "Lektion abgeschlossen",
    lessonCompleteSubtitle: "Gut gemacht. Für jetzt bist du fertig.",
    focusNextLabel: "Nächster Fokus",
    reviewOptionalButton: "Wiederholen (optional)",
    reviewIntroMessage: "Lass uns kurz wiederholen.",
    continueNextLesson: "Weiter zur nächsten Lektion",
    continueLabel: "Weiter",
    startLabel: "Start",
    resumeLabel: "Fortsetzen",
    optionalReviewLabel: "Optionale Wiederholung",
    optionalLabel: "Optional",
    reviewNowLabel: "Jetzt wiederholen",
    reviewNotNowLabel: "Nicht jetzt",
    reviewReadyMessage: "Optionale Wiederholung bereit ({count} Elemente). Weiter, wenn du bereit bist.",
    practiceLabel: "Übung",
    practiceCompleteToContinue: "Schließe das ab, um fortzufahren",
    practicePlaceholder: "Übung beantworten...",
    sendLabel: "Senden",
    finishPracticeLabel: "Beende die Übung, um fortzufahren.",
    resumePracticeLabel: "Übung fortsetzen",
    noLessonsLabel: "Noch keine Lektionen verfügbar.",
    noReviewItemsLabel: "Noch keine Wiederholungsitems verfügbar.",
    reviewCompleteLabel: "Wiederholung abgeschlossen. Weiter, wenn du bereit bist.",
    noNextLessonNote: "Noch keine nächste Lektion. Du kannst neu starten oder beenden.",
    reviewPlaceholder: "Antwort eingeben...",
    backLabel: "Zurück",
    reviewPracticeTitle: "Wiederholungsübung",
    practiceRequiredLabel: "Zum Fortfahren erforderlich",
    lessonsTitle: "Lektionen",
    continueWhenReady: "Weiter, wenn du bereit bist.",
    statusInProgress: "In Bearbeitung",
    statusPaused: "Pausiert",
    statusCompleted: "Abgeschlossen",
    statusNeedsReview: "Wiederholen",
    statusNotStarted: "Nicht begonnen",
    startLessonFirst: "Starte zuerst eine Lektion...",
    lessonCompletedMessage: "Lektion abgeschlossen – neu starten oder beenden.",
    finishPracticeFirst: "Beende zuerst die Übung oben...",
    answerPlaceholder: "Antwort eingeben...",
  },
  es: {
    hintLabel: "Hint",
    explanationLabel: "Explanation",
    answerLabel: "Answer",
    supportLabel: "Support",
    tutorLabel: "Tutor",
    youLabel: "You",
    startLessonEmpty: "Start a lesson to begin.",
    reviewLabel: "Review",
    stopLabel: "Stop",
    backToLessons: "Back to lessons",
    lessonCompleteTitle: "Lesson complete",
    lessonCompleteSubtitle: "Nice work. You're done for now.",
    focusNextLabel: "Focus next",
    reviewOptionalButton: "Review (optional)",
    reviewIntroMessage: "Let's do a quick review.",
    continueNextLesson: "Continue to next lesson",
    continueLabel: "Continue",
    startLabel: "Start",
    resumeLabel: "Resume",
    optionalReviewLabel: "Optional review",
    optionalLabel: "Optional",
    reviewNowLabel: "Review now",
    reviewNotNowLabel: "Not now",
    reviewReadyMessage: "Optional review ready ({count} items). Continue when you're ready.",
    practiceLabel: "Practice",
    practiceCompleteToContinue: "Complete this to continue",
    practicePlaceholder: "Answer the practice...",
    sendLabel: "Send",
    finishPracticeLabel: "Finish practice to continue.",
    resumePracticeLabel: "Resume practice",
    noLessonsLabel: "No lessons available yet.",
    noReviewItemsLabel: "No review items are available yet.",
    reviewCompleteLabel: "Review complete. Continue when you're ready.",
    noNextLessonNote: "No next lesson yet. You can restart or exit.",
    reviewPlaceholder: "Type your answer...",
    backLabel: "Back",
    reviewPracticeTitle: "Review practice",
    practiceRequiredLabel: "Required to continue",
    lessonsTitle: "Lessons",
    continueWhenReady: "Continue when you're ready.",
    statusInProgress: "In progress",
    statusPaused: "Paused",
    statusCompleted: "Completed",
    statusNeedsReview: "Needs review",
    statusNotStarted: "Not started",
    startLessonFirst: "Start a lesson first...",
    lessonCompletedMessage: "Lesson completed - restart or exit.",
    finishPracticeFirst: "Finish the practice above first...",
    answerPlaceholder: "Type your answer...",
  },
  fr: {
    hintLabel: "Hint",
    explanationLabel: "Explanation",
    answerLabel: "Answer",
    supportLabel: "Support",
    tutorLabel: "Tutor",
    youLabel: "You",
    startLessonEmpty: "Start a lesson to begin.",
    reviewLabel: "Review",
    stopLabel: "Stop",
    backToLessons: "Back to lessons",
    lessonCompleteTitle: "Lesson complete",
    lessonCompleteSubtitle: "Nice work. You're done for now.",
    focusNextLabel: "Focus next",
    reviewOptionalButton: "Review (optional)",
    reviewIntroMessage: "Let's do a quick review.",
    continueNextLesson: "Continue to next lesson",
    continueLabel: "Continue",
    startLabel: "Start",
    resumeLabel: "Resume",
    optionalReviewLabel: "Optional review",
    optionalLabel: "Optional",
    reviewNowLabel: "Review now",
    reviewNotNowLabel: "Not now",
    reviewReadyMessage: "Optional review ready ({count} items). Continue when you're ready.",
    practiceLabel: "Practice",
    practiceCompleteToContinue: "Complete this to continue",
    practicePlaceholder: "Answer the practice...",
    sendLabel: "Send",
    finishPracticeLabel: "Finish practice to continue.",
    resumePracticeLabel: "Resume practice",
    noLessonsLabel: "No lessons available yet.",
    noReviewItemsLabel: "No review items are available yet.",
    reviewCompleteLabel: "Review complete. Continue when you're ready.",
    noNextLessonNote: "No next lesson yet. You can restart or exit.",
    reviewPlaceholder: "Type your answer...",
    backLabel: "Back",
    reviewPracticeTitle: "Review practice",
    practiceRequiredLabel: "Required to continue",
    lessonsTitle: "Lessons",
    continueWhenReady: "Continue when you're ready.",
    statusInProgress: "In progress",
    statusPaused: "Paused",
    statusCompleted: "Completed",
    statusNeedsReview: "Needs review",
    statusNotStarted: "Not started",
    startLessonFirst: "Start a lesson first...",
    lessonCompletedMessage: "Lesson completed - restart or exit.",
    finishPracticeFirst: "Finish the practice above first...",
    answerPlaceholder: "Type your answer...",
  },
};

export function getUiStrings(instructionLanguage?: SupportedLanguage | null): UiStrings {
  const lang = normalizeInstructionLanguage(instructionLanguage) ?? "en";
  return UI_STRINGS[lang] ?? UI_STRINGS.en;
}
