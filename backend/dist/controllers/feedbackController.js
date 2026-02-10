"use strict";
//backend/src/controllers/feedbackController.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitFeedback = submitFeedback;
const node_crypto_1 = __importDefault(require("node:crypto"));
const sessionStore_1 = require("../storage/sessionStore");
const lessonLoader_1 = require("../state/lessonLoader");
const feedbackState_1 = require("../state/feedbackState");
const sendError_1 = require("../http/sendError");
function sha256Short(input) {
    return node_crypto_1.default.createHash("sha256").update(input).digest("hex").slice(0, 16);
}
function toBooleanOrUndefined(v) {
    return typeof v === "boolean" ? v : undefined;
}
function toHelpedUnderstandOrUndefined(v) {
    if (typeof v !== "number")
        return undefined;
    if (!Number.isFinite(v))
        return undefined;
    const n = Math.trunc(v);
    if (n < 1 || n > 5)
        return undefined;
    return n;
}
function toConfusedTextOrUndefined(v) {
    if (typeof v !== "string")
        return undefined;
    const t = v.trim();
    if (!t)
        return undefined;
    //Kepp bounded(privacy and storage safety)
    return t.slice(0, 800);
}
function toShortTextOrUndefined(v, max = 120) {
    if (typeof v !== "string")
        return undefined;
    const t = v.trim();
    if (!t)
        return undefined;
    return t.slice(0, max);
}
function toEnumOrUndefined(v, allowed) {
    if (typeof v !== "string")
        return undefined;
    const t = v.trim();
    return allowed.has(t) ? t : undefined;
}
function toStringArrayOrUndefined(v, allowed, maxItems = 6, maxLen = 40) {
    if (!Array.isArray(v))
        return undefined;
    const next = [];
    for (const entry of v) {
        if (typeof entry !== "string")
            continue;
        const t = entry.trim();
        if (!t || t.length > maxLen)
            continue;
        if (!allowed.has(t))
            continue;
        if (!next.includes(t))
            next.push(t);
        if (next.length >= maxItems)
            break;
    }
    return next.length ? next : undefined;
}
const SCREEN_OPTIONS = new Set(["home", "lesson", "review", "other"]);
const INTENT_OPTIONS = new Set(["start", "continue", "review", "change_settings", "exploring"]);
const CROWD_OPTIONS = new Set(["not_at_all", "a_little", "yes_a_lot"]);
const FELT_BEST_OPTIONS = new Set([
    "continue_card",
    "units",
    "optional_review",
    "calm_tone",
    "other",
]);
function toAnonSessionIdOrGenerated(v) {
    if (typeof v === "string") {
        const t = v.trim();
        if (t.length >= 8 && t.length <= 80 && /^[A-Za-z0-9_-]+$/.test(t))
            return t;
    }
    return node_crypto_1.default.randomUUID();
}
async function submitFeedback(req, res) {
    const body = (req.body ?? {});
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
        return (0, sendError_1.sendError)(res, 400, "userId is required", "INVALID_REQUEST");
    }
    const feltRushed = toBooleanOrUndefined(body.feltRushed);
    const helpedUnderstand = toHelpedUnderstandOrUndefined(body.helpedUnderstand);
    const confusedText = toConfusedTextOrUndefined(body.confusedText);
    const improveText = toConfusedTextOrUndefined(body.improveText);
    const screen = toEnumOrUndefined(body.screen, SCREEN_OPTIONS);
    const intent = toEnumOrUndefined(body.intent, INTENT_OPTIONS);
    const crowdedRating = toEnumOrUndefined(body.crowdedRating, CROWD_OPTIONS);
    const feltBest = toStringArrayOrUndefined(body.feltBest, FELT_BEST_OPTIONS);
    const hasAnyField = typeof feltRushed === "boolean" ||
        typeof helpedUnderstand === "number" ||
        typeof confusedText === "string" ||
        typeof improveText === "string" ||
        typeof intent === "string" ||
        typeof crowdedRating === "string" ||
        (Array.isArray(feltBest) && feltBest.length > 0);
    if (!hasAnyField) {
        return (0, sendError_1.sendError)(res, 400, "Please fill at least one feedback field.", "EMPTY_FEEDBACK");
    }
    const anonSessionId = toAnonSessionIdOrGenerated(body.anonSessionId);
    const userAnonId = sha256Short(userId);
    // Prefer server-derived context from the active session.
    const session = await (0, sessionStore_1.getSession)(userId);
    const languageFromBody = typeof body.language === "string" ? body.language.trim() : "";
    const lessonIdFromBody = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
    const conceptTagFromBody = typeof body.conceptTag === "string" ? body.conceptTag.trim() : "";
    const lessonId = session?.lessonId || lessonIdFromBody;
    const language = (session?.language || languageFromBody).toString();
    if (!lessonId || !language) {
        return (0, sendError_1.sendError)(res, 400, "lessonId and language are required when no active session exists", "MISSING_CONTEXT");
    }
    let conceptTag = conceptTagFromBody || undefined;
    // Derive conceptTag from the current question when possible.
    if (!conceptTag && session) {
        const lesson = (0, lessonLoader_1.loadLesson)(String(session.language), String(session.lessonId));
        if (lesson && Array.isArray(lesson.questions) && lesson.questions.length > 0) {
            const rawIndex = typeof session.currentQuestionIndex === "number" ? session.currentQuestionIndex : 0;
            const idx = Math.min(Math.max(0, rawIndex), lesson.questions.length - 1);
            const q = lesson.questions[idx];
            const ct = q?.conceptTag;
            if (typeof ct === "string" && ct.trim())
                conceptTag = ct.trim();
        }
    }
    const instructionLanguage = toShortTextOrUndefined(body.instructionLanguage, 12);
    const sessionKey = toShortTextOrUndefined(body.sessionKey, 120);
    const appVersion = toShortTextOrUndefined(body.appVersion, 80);
    const clientTimestamp = toShortTextOrUndefined(body.timestamp, 40);
    const targetLanguage = toShortTextOrUndefined(body.targetLanguage, 12);
    await feedbackState_1.LessonFeedbackModel.create({
        userAnonId,
        anonSessionId,
        lessonId,
        language,
        conceptTag,
        sessionState: session?.state,
        currentQuestionIndex: session?.currentQuestionIndex,
        feltRushed,
        helpedUnderstand,
        confusedText,
        improveText,
        screen,
        intent,
        crowdedRating,
        feltBest,
        targetLanguage,
        instructionLanguage,
        sessionKey,
        appVersion,
        clientTimestamp,
    });
    return res.status(201).json({ ok: true });
}
