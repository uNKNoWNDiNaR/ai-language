"use strict";
// backend/src/state/answerEvaluator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAnswer = evaluateAnswer;
const GERMAN_ARTICLES = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des"]);
const ENGLISH_MARKERS = new Set(["the", "a", "an", "my", "is", "are", "i", "you", "we", "they"]);
const GERMAN_MARKERS = new Set(["ich", "bin", "du", "wir", "sie", "nicht", "mein", "meine", "und", "aber"]);
function normalize(text) {
    return (text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,!?;:"'()\[\]{}]/g, "")
        .trim();
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
function matchesAnyExact(question, userNorm) {
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
function evaluateAnswer(question, userAnswer, language) {
    const userNorm = normalize(userAnswer);
    if (matchesAnyExact(question, userNorm)) {
        return { result: "correct" };
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
    const expectedNorm = normalize(question.answer);
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
