// src/sessionStore.ts

import fs from "fs";
import path from "path";
import { LessonSession } from "./lessonState";

const DATA_FILE = path.join(__dirname, "../../sessions.json");

//Ensure all the files exist
function ensureFile () {
    if(!fs.existsSync(DATA_FILE)){
        fs.writeFileSync(DATA_FILE, JSON.stringify({}), "utf-8");
    }
}

//Load all lessons
function loadSessions(): Record<string, LessonSession> {
    ensureFile();
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
}

//Save all sessions
function saveSessions(sessions: Record<string, LessonSession>) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), "utf-8");
}


// Public API

export function getSession(userId: string): LessonSession | null {
    const sessions = loadSessions();
    return sessions[userId] || null;
}

export function createSession(session: LessonSession): void {
    const sessions = loadSessions();
    sessions[session.userId] = session;
    saveSessions(sessions)
}

export function updateSession(session: LessonSession): void {
    const sessions = loadSessions();
    sessions[session.userId] = session;
    saveSessions(sessions);
}

export function deleteSession(userId: string): void {
    const sessions = loadSessions();
    delete sessions[userId];
    saveSessions(sessions)
}