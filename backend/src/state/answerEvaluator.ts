// backend/src/state/answerEvaluator.ts

import type { LessonQuestion } from "./lessonLoader";

export type ReasonCode =
  | "TYPO"
  | "UMLAUT"
  | "ARTICLE"
  | "WORD_ORDER"
  | "WRONG_LANGUAGE"
  | "OTHER"
  | "MISSING_SLOT"
  | "CAPITALIZATION";
export type EvalResult = "correct" | "almost" | "wrong";

export type AnswerEvaluation = {
  result: EvalResult;
  reasonCode?: ReasonCode;
};

const GERMAN_ARTICLES = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des"]);
const ENGLISH_MARKERS = new Set(["the", "a", "an", "my", "is", "are", "i", "you", "we", "they"]);
const GERMAN_MARKERS = new Set(["ich", "bin", "du", "wir", "sie", "nicht", "mein", "meine", "und", "aber"]);
const SMART_APOSTROPHES = /[’‘]/g;

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(SMART_APOSTROPHES, "'")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:"'()\[\]{}]/g, "")
    .trim();
}

function normalizeForCompare(text: string, language: string): string {
  const base = normalize(text);
  const lang = (language || "").trim().toLowerCase();
  if (lang === "de") return foldGerman(base);
  return base;
}

function normalizeCaseSensitive(text: string): string {
  return (text || "")
    .replace(SMART_APOSTROPHES, "'")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:"'()\[\]{}]/g, "")
    .trim();
}

function foldGerman(text: string): string {
  return text
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function foldGermanUmlautToBase(text: string): string {
  return text.replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
}

function normalizeGermanUmlautBase(text: string): string {
  return foldGermanUmlautToBase(normalize(text));
}

function stripPunctKeepSpaces(text: string): string {
  return normalizeCaseSensitive(text);
}

function tokenStartsUpper(token: string): boolean {
  return /^[A-ZÄÖÜẞ]/.test(token);
}

function tokenStartsLower(token: string): boolean {
  return /^[a-zäöü]/.test(token);
}

function hasGermanCapitalizationMismatch(expectedRaw: string, userRaw: string): boolean {
  const expected = stripPunctKeepSpaces(expectedRaw);
  const user = stripPunctKeepSpaces(userRaw);
  if (!expected || !user) return false;

  const expectedTokens = expected.split(" ");
  const userTokens = user.split(" ");

  if (expectedTokens.length !== userTokens.length) return false;
  if (expectedTokens.length <= 1) return false;

  for (let i = 1; i < expectedTokens.length; i += 1) {
    const exp = expectedTokens[i];
    const usr = userTokens[i];
    if (!exp || !usr) continue;
    if (normalizeForCompare(exp, "de") !== normalizeForCompare(usr, "de")) continue;
    if (tokenStartsUpper(exp) && tokenStartsLower(usr)) return true;
  }

  return false;
}

function getPromptText(question: LessonQuestion): string {
  const promptRaw = typeof question.prompt === "string" ? question.prompt.trim() : "";
  if (promptRaw) return promptRaw;
  const questionRaw = typeof question.question === "string" ? question.question.trim() : "";
  return questionRaw;
}

function getExpectedInput(question: LessonQuestion): "" | "blank" | "sentence" {
  const raw = typeof question.expectedInput === "string" ? question.expectedInput.trim().toLowerCase() : "";
  if (raw === "blank" || raw === "sentence") return raw as "blank" | "sentence";
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPromptPrefix(prompt: string): string {
  const raw = (prompt || "").trim();
  if (!raw) return raw;
  const colonIdx = raw.lastIndexOf(":");
  if (colonIdx !== -1) {
    const after = raw.slice(colonIdx + 1).trim();
    if (after.includes("___")) return after;
  }
  return raw;
}

function deriveBlankAnswers(prompt: string, answer: string): string[] {
  if (!prompt.includes("___")) return [];
  const template = stripPromptPrefix(prompt);
  if (!template.includes("___")) return [];
  const pattern = escapeRegExp(template).replace(/_+/g, "(.+?)");
  const re = new RegExp(`^${pattern}$`, "i");
  const match = (answer || "").trim().match(re);
  if (!match || match.length < 2) return [];
  const candidate = match[1]?.trim() ?? "";
  return candidate ? [candidate] : [];
}

function getBlankAnswers(
  question: LessonQuestion,
  promptText: string,
  expectedInput: "" | "blank" | "sentence"
): string[] {
  const raw = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
  const cleaned = raw
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (cleaned.length > 0) return cleaned;
  const answerText =
    typeof question.answer === "string" || typeof question.answer === "number"
      ? String(question.answer)
      : "";
  if (!answerText) return [];
  if (expectedInput === "blank" || promptText.includes("___")) {
    return deriveBlankAnswers(promptText, answerText);
  }
  return [];
}

function tokenize(text: string): string[] {
  const norm = normalize(text);
  return norm ? norm.split(" ") : [];
}

function levenshtein(a: string, b: string): number {
  const s = a;
  const t = b;

  const m = s.length;
  const n = t.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function matchesAnyExact(question: LessonQuestion, userNorm: string, language: string): boolean {
  const normalizeCandidate = (text: string): string => normalizeForCompare(text, language);
  const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
  for (const a of accepted) {
    if (userNorm === normalizeCandidate(a)) return true;
  }

  const primary = normalizeCandidate(question.answer);
  if (userNorm === primary) return true;

  const examples = Array.isArray(question.examples) ? question.examples : [];
  for (const ex of examples) {
    if (userNorm === normalizeCandidate(ex)) return true;
  }

  return false;
}

function matchGermanCandidate(
  userAnswer: string,
  candidate: string,
  userCompare: string
): AnswerEvaluation | null {
  const candCompare = normalizeForCompare(candidate, "de");
  if (!candCompare || userCompare !== candCompare) return null;
  if (hasGermanCapitalizationMismatch(candidate, userAnswer)) {
    return { result: "almost", reasonCode: "CAPITALIZATION" };
  }
  return { result: "correct" };
}

function matchGermanCandidates(userAnswer: string, candidates: string[]): AnswerEvaluation | null {
  const userCompare = normalizeForCompare(userAnswer, "de");
  if (!userCompare) return null;
  let foundCapitalization = false;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = matchGermanCandidate(userAnswer, candidate, userCompare);
    if (!match) continue;
    if (match.result === "correct") return match;
    if (match.result === "almost") foundCapitalization = true;
  }
  return foundCapitalization ? { result: "almost", reasonCode: "CAPITALIZATION" } : null;
}

function matchesGermanUmlautMissing(userAnswer: string, candidates: string[]): boolean {
  const userBase = normalizeGermanUmlautBase(userAnswer);
  if (!userBase) return false;
  const userCompare = normalizeForCompare(userAnswer, "de");
  for (const candidate of candidates) {
    if (!candidate) continue;
    const candBase = normalizeGermanUmlautBase(candidate);
    if (!candBase) continue;
    if (userBase !== candBase) continue;
    if (userCompare === normalizeForCompare(candidate, "de")) continue;
    return true;
  }
  return false;
}

function matchPlaceholderTemplate(
  expectedRaw: string,
  userAnswer: string,
  language: string
): "correct" | "almost" | null {
  const hasPlaceholder =
    /\[[^\]]+\]/.test(expectedRaw) ||
    /\{[^}]+\}/.test(expectedRaw) ||
    /<[^>]+>/.test(expectedRaw);

  if (!hasPlaceholder) return null;

  const expectedPrefixRaw = expectedRaw
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  
  const prefix = normalizeForCompare(expectedPrefixRaw, language);
  if(!prefix) return null;

  const userNorm = normalizeForCompare(userAnswer, language);
  if(userNorm === prefix) return "almost";
  if(!userNorm.startsWith(prefix + " ")) return null;

  const remainder = userNorm.slice(prefix.length).trim();
  return remainder.length > 0 ? "correct" : "almost";
}

function matchIntroduceYourselfEquivalent(userNorm: string): "correct" | "almost" | null {
  const prefix = "i am";
  if(userNorm === prefix) return "almost";
  if(userNorm.startsWith(prefix + " ")) {
    const rest = userNorm.slice(prefix.length).trim();
    return rest.length > 0 ? "correct" : "almost";
  }

  const prefix2 = "im";
  if(userNorm === prefix2) return "almost";
  if(userNorm.startsWith(prefix2 + " ")) {
    const rest = userNorm.slice(prefix2.length).trim();
    return rest.length > 0 ? "correct" : "almost";
  }

  return null;
}

function isWrongLanguageHeuristic(language: string, userAnswer: string): boolean {
  const lang = (language || "").trim().toLowerCase();
  const tokens = tokenize(userAnswer);

  if (tokens.length === 0) return false;

  const hitsEnglish = tokens.filter((t) => ENGLISH_MARKERS.has(t)).length;
  const hitsGerman = tokens.filter((t) => GERMAN_MARKERS.has(t) || GERMAN_ARTICLES.has(t)).length;

  if (lang === "en") {
    // If German markers dominate, likely wrong language
    return hitsGerman >= 2 && hitsGerman > hitsEnglish;
  }

  if (lang === "de") {
    // If English markers dominate, likely wrong language
    return hitsEnglish >= 2 && hitsEnglish > hitsGerman;
  }

  // For es/fr: conservative. Only flag if very obvious English answer.
  if (lang === "es" || lang === "fr") {
    return hitsEnglish >= 3;
  }

  return false;
}

function detectGermanArticleMismatch(expected: string, user: string): boolean {
  const expTokens = tokenize(expected);
  const usrTokens = tokenize(user);

  if (expTokens.length < 2 || usrTokens.length < 2) return false;

  const expArt = expTokens[0];
  const usrArt = usrTokens[0];

  if (!GERMAN_ARTICLES.has(expArt)) return false;
  if (!GERMAN_ARTICLES.has(usrArt)) return false;

  if (expArt === usrArt) return false;

  // If the rest matches exactly, it's an article issue
  const expRest = expTokens.slice(1).join(" ");
  const usrRest = usrTokens.slice(1).join(" ");

  return expRest === usrRest;
}

function detectWordOrderMismatch(expected: string, user: string): boolean {
  const expTokens = tokenize(expected);
  const usrTokens = tokenize(user);

  if (expTokens.length < 2 || usrTokens.length < 2) return false;
  if (expTokens.length !== usrTokens.length) return false;

  if (expTokens.join(" ") === usrTokens.join(" ")) return false;

  const expSorted = [...expTokens].sort().join("|");
  const usrSorted = [...usrTokens].sort().join("|");

  return expSorted === usrSorted;
}

type EvalRule = (
  question: LessonQuestion,
  userAnswer: string,
  language: string,
  userNorm: string,
  expectedNorm: string
) => AnswerEvaluation | null;

const ruleIntroduceYourself: EvalRule = (question, _userAnswer, _language, userNorm, expectedNorm) => {
  const isIntroduceYourself =
    /\[your name\]/i.test(question.answer) &&
    expectedNorm.startsWith("my name is");

  if (!isIntroduceYourself) return null;

  const eq = matchIntroduceYourselfEquivalent(userNorm);
  if (eq === "correct") return { result: "correct" };
  if (eq === "almost") return { result: "almost", reasonCode: "MISSING_SLOT" };
  return null;
};

const ruleAskName: EvalRule = (_question, _userAnswer, _language, userNorm, expectedNorm) => {
  const isAskName = expectedNorm === "what is your name" || expectedNorm === "whats your name";
  if (!isAskName) return null;

  if (userNorm === "what is your name" || userNorm === "whats your name") {
    return { result: "correct" };
  }
  return null;
};

const ruleHowAreYouShortFine: EvalRule = (question, _userAnswer, _language, userNorm, expectedNorm) => {
  const isHowAreYouReply =
    expectedNorm === "i am fine" &&
    Array.isArray(question.examples) &&
    question.examples.some((e) => normalize(e).includes("doing well"));

  if (!isHowAreYouReply) return null;
  if (userNorm === "fine") return { result: "correct" };
  return null;
};

const ruleGreetingThere: EvalRule = (question, _userAnswer, _language, userNorm, expectedNorm) => {
  const isGreetingHello =
    expectedNorm === "hello" &&
    Array.isArray(question.examples) &&
    question.examples.some((e) => {
      const n = normalize(e);
      return n === "hi" || n === "hey";
    });

  if (!isGreetingHello) return null;
  if (userNorm === "hi there" || userNorm === "hey there") return { result: "correct" };
  return null;
};

const ruleGoodMorningShort: EvalRule = (question, _userAnswer, _language, userNorm, expectedNorm) => {
  const isGoodMorning =
    expectedNorm === "good morning" &&
    ((question.hint && normalize(question.hint).includes("before noon")) ||
      (Array.isArray(question.examples) && question.examples.some((e) => normalize(e) === "morning")));

  if (!isGoodMorning) return null;
  if (userNorm === "morning") return { result: "correct" };
  return null;
};

const SPECIAL_EQUIVALENCE_RULES: EvalRule[] = [
  ruleIntroduceYourself,
  ruleAskName,
  ruleHowAreYouShortFine,
  ruleGreetingThere,
  ruleGoodMorningShort,
];

export function evaluateAnswer(
  question: LessonQuestion,
  userAnswer: string,
  language: string
): AnswerEvaluation {
  const lang = (language || "").trim().toLowerCase();
  const userNorm = normalize(userAnswer);
  const userCompare = normalizeForCompare(userAnswer, lang);
  const expectedNorm = normalize(question.answer);
  const promptText = getPromptText(question);
  const expectedInput = getExpectedInput(question);
  const isBlank = expectedInput === "blank" || promptText.includes("___");
  const isGerman = lang === "de";

  if (isBlank) {
    const blankAnswers = getBlankAnswers(question, promptText, expectedInput);
    if (isGerman) {
      const blankMatch = matchGermanCandidates(userAnswer, blankAnswers);
      if (blankMatch) return blankMatch;
      if (matchesGermanUmlautMissing(userAnswer, blankAnswers)) {
        return { result: "almost", reasonCode: "UMLAUT" };
      }
    } else {
      for (const blank of blankAnswers) {
        if (userCompare === normalizeForCompare(blank, lang)) {
          return { result: "correct" };
        }
      }
    }
  }

  if (isGerman) {
    const candidates = [
      ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []),
      question.answer,
      ...(Array.isArray(question.examples) ? question.examples : []),
    ];
    const germanMatch = matchGermanCandidates(userAnswer, candidates);
    if (germanMatch) return germanMatch;
    if (matchesGermanUmlautMissing(userAnswer, candidates)) {
      return { result: "almost", reasonCode: "UMLAUT" };
    }
  } else {
    if (matchesAnyExact(question, userCompare, lang)) {
      return { result: "correct" };
    }
  }

  const templateMatch = matchPlaceholderTemplate(question.answer, userAnswer, language);
  if (templateMatch === "correct") return { result: "correct" };
  if (templateMatch === "almost") return { result: "almost", reasonCode: "MISSING_SLOT" };

  for (const rule of SPECIAL_EQUIVALENCE_RULES) {
    const out = rule(question, userAnswer, language, userNorm, expectedNorm);
    if (out) return out;
  }

  // Wrong language (deterministic heuristic)
  if (isWrongLanguageHeuristic(language, userAnswer)) {
    return { result: "wrong", reasonCode: "WRONG_LANGUAGE" };
  }

  // German article mismatch
  if ((language || "").trim().toLowerCase() === "de") {
    if (detectGermanArticleMismatch(question.answer, userAnswer)) {
      return { result: "almost", reasonCode: "ARTICLE" };
    }
  }

  // Word order mismatch
  if (detectWordOrderMismatch(question.answer, userAnswer)) {
    return { result: "almost", reasonCode: "WORD_ORDER" };
  }

  // Typo: small edit distance against expected or any example
  const dist = levenshtein(userNorm, expectedNorm);

  const length = Math.max(1, expectedNorm.length);
  const allowed = length <= 6 ? 1 : 2;

  if (dist > 0 && dist <= allowed) {
    return { result: "almost", reasonCode: "TYPO" };
  }

  const examples = Array.isArray(question.examples) ? question.examples : [];
  for (const ex of examples) {
    const exNorm = normalize(ex);
    const d = levenshtein(userNorm, exNorm);
    const len = Math.max(1, exNorm.length);
    const allow = len <= 6 ? 1 : 2;
    if (d > 0 && d <= allow) return { result: "almost", reasonCode: "TYPO" };
  }

  return { result: "wrong", reasonCode: "OTHER" };
}
