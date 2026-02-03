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
        return res.status(400).json({ error: "userId is required", code: "INVALID_REQUEST" });
    }
    const feltRushed = toBooleanOrUndefined(body.feltRushed);
    const helpedUnderstand = toHelpedUnderstandOrUndefined(body.helpedUnderstand);
    const confusedText = toConfusedTextOrUndefined(body.confusedText);
    const hasAnyField = typeof feltRushed === "boolean" ||
        typeof helpedUnderstand === "number" ||
        typeof confusedText === "string";
    if (!hasAnyField) {
        return res
            .status(400)
            .json({ error: "Please fill at least one feedback field.", code: "EMPTY_FEEDBACK" });
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
        return res.status(400).json({
            error: "lessonId and language are required when no active session exists",
            code: "MISSING_CONTEXT",
        });
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
    });
    return res.status(201).json({ ok: true });
}
