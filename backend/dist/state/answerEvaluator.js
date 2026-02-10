"use strict";
// backend/src/state/answerEvaluator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAnswer = evaluateAnswer;
const GERMAN_ARTICLES = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des"]);
const ENGLISH_MARKERS = new Set(["the", "a", "an", "my", "is", "are", "i", "you", "we", "they"]);
const GERMAN_MARKERS = new Set(["ich", "bin", "du", "wir", "sie", "nicht", "mein", "meine", "und", "aber"]);
const SMART_APOSTROPHES = /[’‘]/g;
function normalize(text) {
    return (text || "")
        .toLowerCase()
        .replace(SMART_APOSTROPHES, "'")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,!?;:"'()\[\]{}]/g, "")
        .trim();
}
function getPromptText(question) {
    const promptRaw = typeof question.prompt === "string" ? question.prompt.trim() : "";
    if (promptRaw)
        return promptRaw;
    const questionRaw = typeof question.question === "string" ? question.question.trim() : "";
    return questionRaw;
}
function getExpectedInput(question) {
    const raw = typeof question.expectedInput === "string" ? question.expectedInput.trim().toLowerCase() : "";
    if (raw === "blank" || raw === "sentence")
        return raw;
    return "";
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripPromptPrefix(prompt) {
    const raw = (prompt || "").trim();
    if (!raw)
        return raw;
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx !== -1) {
        const after = raw.slice(colonIdx + 1).trim();
        if (after.includes("___"))
            return after;
    }
    return raw;
}
function deriveBlankAnswers(prompt, answer) {
    if (!prompt.includes("___"))
        return [];
    const template = stripPromptPrefix(prompt);
    if (!template.includes("___"))
        return [];
    const pattern = escapeRegExp(template).replace(/_+/g, "(.+?)");
    const re = new RegExp(`^${pattern}$`, "i");
    const match = (answer || "").trim().match(re);
    if (!match || match.length < 2)
        return [];
    const candidate = match[1]?.trim() ?? "";
    return candidate ? [candidate] : [];
}
function getBlankAnswers(question, promptText, expectedInput) {
    const raw = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
    const cleaned = raw
        .filter((x) => typeof x === "string" && x.trim().length > 0)
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean);
    if (cleaned.length > 0)
        return cleaned;
    const answerText = typeof question.answer === "string" || typeof question.answer === "number"
        ? String(question.answer)
        : "";
    if (!answerText)
        return [];
    if (expectedInput === "blank" || promptText.includes("___")) {
        return deriveBlankAnswers(promptText, answerText);
    }
    return [];
}
function tokenize(text) {
    const norm = normalize(text);
    return norm ? norm.split(" ") : [];
}
function levenshtein(a, b) {
    const s = a;
    const t = b;
    const m = s.length;
    const n = t.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}
function matchesAnyExact(question, userNorm) {
    const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];
    for (const a of accepted) {
        if (userNorm === normalize(a))
            return true;
    }
    const primary = normalize(question.answer);
    if (userNorm === primary)
        return true;
    const examples = Array.isArray(question.examples) ? question.examples : [];
    for (const ex of examples) {
        if (userNorm === normalize(ex))
            return true;
    }
    return false;
}
function matchPlaceholderTemplate(expectedRaw, userNorm) {
    const hasPlaceholder = /\[[^\]]+\]/.test(expectedRaw) ||
        /\{[^}]+\}/.test(expectedRaw) ||
        /<[^>]+>/.test(expectedRaw);
    if (!hasPlaceholder)
        return null;
    const expectedPrefixRaw = expectedRaw
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\{[^}]+\}/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
    const prefix = normalize(expectedPrefixRaw);
    if (!prefix)
        return null;
    if (userNorm === prefix)
        return "almost";
    if (!userNorm.startsWith(prefix + " "))
        return null;
    const remainder = userNorm.slice(prefix.length).trim();
    return remainder.length > 0 ? "correct" : "almost";
}
function matchIntroduceYourselfEquivalent(userNorm) {
    const prefix = "i am";
    if (userNorm === prefix)
        return "almost";
    if (userNorm.startsWith(prefix + " ")) {
        const rest = userNorm.slice(prefix.length).trim();
        return rest.length > 0 ? "correct" : "almost";
    }
    const prefix2 = "im";
    if (userNorm === prefix2)
        return "almost";
    if (userNorm.startsWith(prefix2 + " ")) {
        const rest = userNorm.slice(prefix2.length).trim();
        return rest.length > 0 ? "correct" : "almost";
    }
    return null;
}
function isWrongLanguageHeuristic(language, userAnswer) {
    const lang = (language || "").trim().toLowerCase();
    const tokens = tokenize(userAnswer);
    if (tokens.length === 0)
        return false;
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
function detectGermanArticleMismatch(expected, user) {
    const expTokens = tokenize(expected);
    const usrTokens = tokenize(user);
    if (expTokens.length < 2 || usrTokens.length < 2)
        return false;
    const expArt = expTokens[0];
    const usrArt = usrTokens[0];
    if (!GERMAN_ARTICLES.has(expArt))
        return false;
    if (!GERMAN_ARTICLES.has(usrArt))
        return false;
    if (expArt === usrArt)
        return false;
    // If the rest matches exactly, it's an article issue
    const expRest = expTokens.slice(1).join(" ");
    const usrRest = usrTokens.slice(1).join(" ");
    return expRest === usrRest;
}
function detectWordOrderMismatch(expected, user) {
    const expTokens = tokenize(expected);
    const usrTokens = tokenize(user);
    if (expTokens.length < 2 || usrTokens.length < 2)
        return false;
    if (expTokens.length !== usrTokens.length)
        return false;
    if (expTokens.join(" ") === usrTokens.join(" "))
        return false;
    const expSorted = [...expTokens].sort().join("|");
    const usrSorted = [...usrTokens].sort().join("|");
    return expSorted === usrSorted;
}
const ruleIntroduceYourself = (question, _userAnswer, _language, userNorm, expectedNorm) => {
    const isIntroduceYourself = /\[your name\]/i.test(question.answer) &&
        expectedNorm.startsWith("my name is");
    if (!isIntroduceYourself)
        return null;
    const eq = matchIntroduceYourselfEquivalent(userNorm);
    if (eq === "correct")
        return { result: "correct" };
    if (eq === "almost")
        return { result: "almost", reasonCode: "MISSING_SLOT" };
    return null;
};
const ruleAskName = (_question, _userAnswer, _language, userNorm, expectedNorm) => {
    const isAskName = expectedNorm === "what is your name" || expectedNorm === "whats your name";
    if (!isAskName)
        return null;
    if (userNorm === "what is your name" || userNorm === "whats your name") {
        return { result: "correct" };
    }
    return null;
};
const ruleHowAreYouShortFine = (question, _userAnswer, _language, userNorm, expectedNorm) => {
    const isHowAreYouReply = expectedNorm === "i am fine" &&
        Array.isArray(question.examples) &&
        question.examples.some((e) => normalize(e).includes("doing well"));
    if (!isHowAreYouReply)
        return null;
    if (userNorm === "fine")
        return { result: "correct" };
    return null;
};
const ruleGreetingThere = (question, _userAnswer, _language, userNorm, expectedNorm) => {
    const isGreetingHello = expectedNorm === "hello" &&
        Array.isArray(question.examples) &&
        question.examples.some((e) => {
            const n = normalize(e);
            return n === "hi" || n === "hey";
        });
    if (!isGreetingHello)
        return null;
    if (userNorm === "hi there" || userNorm === "hey there")
        return { result: "correct" };
    return null;
};
const ruleGoodMorningShort = (question, _userAnswer, _language, userNorm, expectedNorm) => {
    const isGoodMorning = expectedNorm === "good morning" &&
        ((question.hint && normalize(question.hint).includes("before noon")) ||
            (Array.isArray(question.examples) && question.examples.some((e) => normalize(e) === "morning")));
    if (!isGoodMorning)
        return null;
    if (userNorm === "morning")
        return { result: "correct" };
    return null;
};
const SPECIAL_EQUIVALENCE_RULES = [
    ruleIntroduceYourself,
    ruleAskName,
    ruleHowAreYouShortFine,
    ruleGreetingThere,
    ruleGoodMorningShort,
];
function evaluateAnswer(question, userAnswer, language) {
    const userNorm = normalize(userAnswer);
    const expectedNorm = normalize(question.answer);
    const promptText = getPromptText(question);
    const expectedInput = getExpectedInput(question);
    const isBlank = expectedInput === "blank" || promptText.includes("___");
    if (isBlank) {
        const blankAnswers = getBlankAnswers(question, promptText, expectedInput);
        for (const blank of blankAnswers) {
            if (userNorm === normalize(blank)) {
                return { result: "correct" };
            }
        }
    }
    if (matchesAnyExact(question, userNorm)) {
        return { result: "correct" };
    }
    const templateMatch = matchPlaceholderTemplate(question.answer, userNorm);
    if (templateMatch === "correct")
        return { result: "correct" };
    if (templateMatch === "almost")
        return { result: "almost", reasonCode: "MISSING_SLOT" };
    for (const rule of SPECIAL_EQUIVALENCE_RULES) {
        const out = rule(question, userAnswer, language, userNorm, expectedNorm);
        if (out)
            return out;
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
        if (d > 0 && d <= allow)
            return { result: "almost", reasonCode: "TYPO" };
    }
    return { result: "wrong", reasonCode: "OTHER" };
}
