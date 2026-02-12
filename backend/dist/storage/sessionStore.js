"use strict";
// backend/src/storage/sessionStore.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.createSession = createSession;
exports.updateSession = updateSession;
exports.deleteSession = deleteSession;
const sessionState_1 = require("../state/sessionState");
async function getSession(userId, language, lessonId) {
    const query = { userId };
    if (typeof language === "string" && language.trim()) {
        query.language = language.trim();
    }
    if (typeof lessonId === "string" && lessonId.trim()) {
        query.lessonId = lessonId.trim();
    }
    return await sessionState_1.LessonSessionModel.findOne(query, undefined, { sort: { updatedAt: -1 } });
}
async function createSession(session) {
    await sessionState_1.LessonSessionModel.create(session);
}
async function updateSession(session) {
    // If it's a mongoose document, save it (best for Map fields)
    const anySession = session;
    if (anySession && typeof anySession.save === "function") {
        await anySession.save();
        return;
    }
    const query = { userId: session.userId };
    if (typeof session.language === "string" && session.language.trim()) {
        query.language = session.language.trim();
    }
    if (typeof session.lessonId === "string" && session.lessonId.trim()) {
        query.lessonId = session.lessonId.trim();
    }
    await sessionState_1.LessonSessionModel.updateOne(query, session);
}
async function deleteSession(userId, language) {
    const query = { userId };
    if (typeof language === "string" && language.trim()) {
        query.language = language.trim();
    }
    await sessionState_1.LessonSessionModel.deleteOne(query);
}
