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
    const hasPlaceholder = /\[[^\]]+\]/.test(expectedRaw) || /\{[^]}+\}/.test(expectedRaw) || /<[^>]+>/.test(expectedRaw) || /your name/i.test(expectedRaw);
    if (!hasPlaceholder)
        return null;
    const expectedPrefixRaw = expectedRaw
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\{[^}]+\}/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\byour name\b/gi, "")
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
