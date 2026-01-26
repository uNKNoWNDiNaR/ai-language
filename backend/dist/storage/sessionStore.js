"use strict";
// src/storage/sessionStore.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.createSession = createSession;
exports.updateSession = updateSession;
exports.deleteSession = deleteSession;
const sessionState_1 = require("../state/sessionState");
async function getSession(userId) {
    return await sessionState_1.LessonSessionModel.findOne({ userId });
}
async function createSession(session) {
    await sessionState_1.LessonSessionModel.create(session);
}
async function updateSession(session) {
    const doc = session?.toObject ? session.toObject() : session;
    delete doc._id;
    delete doc._v;
    await sessionState_1.LessonSessionModel.updateOne({ userId: doc.userId }, { $set: doc });
}
async function deleteSession(userId) {
    await sessionState_1.LessonSessionModel.deleteOne({ userId });
}
