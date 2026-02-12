// src/ai/staticTutorMessages.ts

import type { ReasonCode } from "../state/answerEvaluator";
import type { SupportedLanguage } from "../types";

function normalizeLang(lang?: SupportedLanguage | string | null): SupportedLanguage {
  if (!lang) return "en";
  const t = String(lang).trim().toLowerCase();
  if (t === "de" || t === "es" || t === "fr" || t === "en") return t as SupportedLanguage;
  return "en";
}

function pickByLang(lang: SupportedLanguage, en: string, de: string, es: string, fr: string): string {
  switch (lang) {
    case "de":
      return de;
    case "es":
      return es;
    case "fr":
      return fr;
    default:
      return en;
  }
}

export function getFocusNudge(
  reasonCode?: ReasonCode | string | null,
  language?: SupportedLanguage | string | null
): string {
  const c = String(reasonCode || "").trim().toUpperCase();
  if (!c) return "";
  const lang = normalizeLang(language);

  switch (c) {
    case "WORD_ORDER":
      return pickByLang(lang, "Check word order.", "Wortstellung prüfen.", "Orden de palabras.", "Ordre des mots.");
    case "ARTICLE":
      return pickByLang(lang, "Check the article.", "Artikel prüfen.", "Revisa el artículo.", "Vérifie l'article.");
    case "TYPO":
      return pickByLang(lang, "Check spelling.", "Rechtschreibung prüfen.", "Revisa la ortografía.", "Vérifie l'orthographe.");
    case "UMLAUT":
      return pickByLang(lang, "Check the umlaut.", "Umlaut prüfen.", "Revisa el umlaut.", "Vérifie l'umlaut.");
    case "CAPITALIZATION":
      return pickByLang(lang, "Check capitalization.", "Großschreibung prüfen.", "Revisa mayúsculas.", "Vérifie les majuscules.");
    case "WRONG_LANGUAGE":
      return pickByLang(
        lang,
        "Use the lesson language.",
        "Lektionssprache nutzen.",
        "Usa la lengua.",
        "Utilise la langue."
      );
    case "MISSING_SLOT":
      return pickByLang(
        lang,
        "Add the missing part.",
        "Fehlendes ergänzen.",
        "Falta una parte.",
        "Ajoute la partie."
      );
    default:
      return "";
  }
}

export function getEndLessonMessage(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Lesson complete.", "Lektion abgeschlossen.", "Lección completa.", "Leçon terminée.");
}

export function getStartTransition(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Let's begin.", "Los geht's.", "Empecemos.", "On commence.");
}

export function getAdvanceTransition(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Nice work.", "Gut gemacht.", "Buen trabajo.", "Bien joué.");
}

export function getNextQuestionLabel(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Next question:", "Nächste Frage:", "Siguiente pregunta:", "Question suivante :");
}

export function getHintLabel(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Hint:", "Hinweis:", "Pista:", "Indice:");
}

export function getPacePrefix(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Take your time.", "Lass dir Zeit.", "Tómate tu tiempo.", "Prends ton temps.");
}

type RetryMessageArgs = {
  reasonCode?: ReasonCode;
  attemptCount: number;
  repeatedSameWrong: boolean;
  language?: SupportedLanguage | string | null;
};

export function getForcedAdvanceMessage(language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  return pickByLang(lang, "Let's continue.", "Weiter geht's.", "Sigamos.", "On continue.");
}

export function getDeterministicRetryMessage(args: RetryMessageArgs): string {
  const { reasonCode, attemptCount, repeatedSameWrong } = args;
  const lang = normalizeLang((args as any).language);

  // If user repeats the same wrong answer, change strategy (still deterministic).
  if (repeatedSameWrong) {
    if(attemptCount <= 2) {
      return pickByLang(lang, "Change one part.", "Ändere einen Teil.", "Cambia una parte.", "Change une partie.");
    }
    if(attemptCount === 3) {
      return pickByLang(lang, "Use the hint.", "Nutze den Hinweis.", "Usa la pista.", "Utilise l'indice.");
    }
    return pickByLang(lang, "Let's move on.", "Weiter geht's.", "Sigamos.", "On continue.");
  }

  switch (reasonCode) {
    case "TYPO":
      return pickByLang(lang, "Check spelling.", "Rechtschreibung prüfen.", "Revisa la ortografía.", "Vérifie l'orthographe.");
    case "UMLAUT":
      return pickByLang(lang, "Check the umlaut.", "Umlaut prüfen.", "Revisa el umlaut.", "Vérifie l'umlaut.");
    case "CAPITALIZATION":
      return pickByLang(lang, "Check capitalization.", "Großschreibung prüfen.", "Revisa mayúsculas.", "Vérifie les majuscules.");
    case "ARTICLE":
      return pickByLang(lang, "Check the article.", "Artikel prüfen.", "Revisa el artículo.", "Vérifie l'article.");
    case "WORD_ORDER":
      return pickByLang(lang, "Check word order.", "Wortstellung prüfen.", "Orden de palabras.", "Ordre des mots.");
    case "WRONG_LANGUAGE":
      return pickByLang(
        lang,
        "Use the lesson language.",
        "Lektionssprache nutzen.",
        "Usa la lengua.",
        "Utilise la langue."
      );
    case "MISSING_SLOT":
      return pickByLang(
        lang,
        "Add the missing part.",
        "Fehlendes ergänzen.",
        "Falta una parte.",
        "Ajoute la partie."
      );
    default:
      return pickByLang(lang, "Try again.", "Versuch's nochmal.", "Intenta otra vez.", "Essaie encore.");
  }
}

export function getHintLeadIn(attemptCount: number, language?: SupportedLanguage | string | null): string {
  const lang = normalizeLang(language);
  if(attemptCount === 3) {
    return pickByLang(lang, "Stronger hint.", "Stärkerer Hinweis.", "Pista más clara.", "Indice plus clair.");
  }
  if(attemptCount <= 2) {
    return pickByLang(lang, "Small hint.", "Kleiner Hinweis.", "Pequeña pista.", "Petit indice.");
  }
  return pickByLang(lang, "Answer below.", "Antwort unten.", "Respuesta abajo.", "Réponse ci-dessous.");
}

export type ExplanationDepth = "short" | "normal" | "detailed";

type RetryExplanationArgs = {
  reasonCode: unknown;
  attemptCount: number;
  depth: ExplanationDepth;
};

// Deterministic micro-explanations (privacy-safe, token-bounded).
export function getDeterministicRetryExplanation(args: RetryExplanationArgs): string {
  const { reasonCode, attemptCount, depth } = args;

  if (depth === "short") return "";
  if (depth === "normal" && attemptCount < 3) return "";
  if (depth === "detailed" && attemptCount < 2) return "";

  const c = typeof reasonCode === "string" ? reasonCode.trim().toUpperCase() : "";

  switch (c) {
    case "ARTICLE":
      return "Pay attention to the article that belongs with the noun (like the/a).";
    case "WORD_ORDER":
      return "Try keeping the same word order as the example or expected structure.";
    case "WRONG_LANGUAGE":
      return "Answer in the selected lesson language.";
    case "MISSING_SLOT":
      return "Make sure you include the missing part the question expects.";
    case "TYPO":
      return "Small spelling differences can make the answer wrong — check carefully.";
    case "UMLAUT":
      return "Check the umlaut (ä/ö/ü) in that word.";
    case "CAPITALIZATION":
      return "Check capitalization, especially for nouns and formal forms.";
    default:
      return "Try matching the expected structure closely.";
  }
}
