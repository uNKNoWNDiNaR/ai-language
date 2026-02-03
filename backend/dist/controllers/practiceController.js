"use strict";
//backend/src/controllers/practiceController.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePractice = void 0;
const lessonLoader_1 = require("../state/lessonLoader");
const practiceGenerator_1 = require("../services/practiceGenerator");
const openaiClient_1 = require("../ai/openaiClient");
const sessionStore_1 = require("../storage/sessionStore");
const learnerProfileStore_1 = require("../storage/learnerProfileStore");
function isSupportedLanguage(v) {
    return v === "en" || v === "de" || v === "es" || v === "fr";
}
function isPracticeMetaType(v) {
    return v === "variation" || v === "dialogue_turn" || v === "cloze";
}
const generatePractice = async (req, res) => {
    const { userId, lessonId, language, sourceQuestionId, type, conceptTag } = req.body ?? {};
    if (typeof userId !== "string" || userId.trim() === "") {
        return res.status(400).json({ error: "userId is required" });
    }
    if (typeof lessonId !== "string" || lessonId.trim() === "") {
        return res.status(400).json({ error: "LessonId is required" });
    }
    if (!isSupportedLanguage(language)) {
        return res.status(400).json({ error: "language must be one of en, de, es, fr" });
    }
    const lesson = (0, lessonLoader_1.loadLesson)(language, lessonId);
    if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
    }
    let q = typeof sourceQuestionId === "number"
        ? lesson.questions.find((x) => x.id === sourceQuestionId)
        : undefined;
    if (typeof sourceQuestionId === "number" && !q) {
        return res.status(404).json({ error: "Source question not found" });
    }
    if (!q) {
        const requestedTag = typeof conceptTag === "string" && conceptTag.trim() ? conceptTag.trim() : "";
        let recentTag = null;
        try {
            recentTag =
                typeof learnerProfileStore_1.getRecentConfusionConceptTag === "function"
                    ? await (0, learnerProfileStore_1.getRecentConfusionConceptTag)(userId, language)
                    : null;
        }
        catch {
            recentTag = null;
        }
        const weakest = await (0, learnerProfileStore_1.getWeakestConceptTag)(userId, language);
        if (requestedTag) {
            q = lesson.questions.find((x) => x.conceptTag === requestedTag);
        }
        if (!q && recentTag) {
            q = lesson.questions.find((x) => x.conceptTag === recentTag);
        }
        if (!q && weakest) {
            q = lesson.questions.find((x) => x.conceptTag === weakest);
        }
        if (!q)
            q = lesson.questions[0];
    }
    if (!q) {
        return res.status(404).json({ error: "Source question not found" });
    }
    const practiceType = isPracticeMetaType(type) ? type : "variation";
    const tag = typeof q.conceptTag === "string" && q.conceptTag.trim()
        ? q.conceptTag.trim()
        : typeof conceptTag === "string" && conceptTag.trim()
            ? conceptTag.trim()
            : `lesson-${lessonId}-q${q.id}`;
    const aiClient = {
        generatePracticeJSON: openaiClient_1.generatePracticeJSON,
    };
    const { item: practiceItem, source } = await (0, practiceGenerator_1.generatePracticeItem)({
        language,
        lessonId,
        sourceQuestionText: q.question,
        expectedAnswerRaw: q.answer,
        examples: q.examples,
        conceptTag: tag,
        type: practiceType,
    }, aiClient);
    const session = await (0, sessionStore_1.getSession)(userId);
    if (!session) {
        return res.status(404).json({ error: "Session not found. Start a lesson first." });
    }
    // ---- Map-based persistence (primary path) ----
    const pb = session.practiceById ?? new Map();
    if (typeof pb.set === "function")
        pb.set(practiceItem.practiceId, practiceItem);
    else
        pb[practiceItem.practiceId] = practiceItem;
    session.practiceById = pb;
    const pa = session.practiceAttempts ?? new Map();
    if (typeof pa.get === "function") {
        if (pa.get(practiceItem.practiceId) === undefined)
            pa.set(practiceItem.practiceId, 0);
    }
    else {
        if (pa[practiceItem.practiceId] === undefined)
            pa[practiceItem.practiceId] = 0;
    }
    session.practiceAttempts = pa;
    await (0, sessionStore_1.updateSession)(session);
    return res.status(200).json({ practiceItem, source });
};
exports.generatePractice = generatePractice;
