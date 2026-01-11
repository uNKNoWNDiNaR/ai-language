// src/state/sessionState.ts

import { Session } from "node:inspector";

export type LessonSessionState = 
| "PROMPT"
|"ANSWER"
|"RETRY"
|"COMPLETE";

export interface LessonSession {
    sessionId: string;
    userId: string;
    lessonId: string;
    state: LessonSessionState;
    attempts: number;
}

/* 
* In-Memory session store (MVP-Only)
* Key: sessionId
* Value: LessonSession
*/

const sessions = new Map<string, LessonSession>();
export function getSession(sessionId: string): LessonSession | undefined{
    return sessions.get(sessionId);
}

export function createSession(
    sessionId: string,
    userId: string,
    lessonId: string
): LessonSession {
    const session: LessonSession = {
        sessionId,
        userId,
        lessonId,
        state: "PROMPT",
        attempts: 0
    };
    sessions.set(sessionId, session);
    return session;
}

export function updateSession(
    sessionId: string,
    updates:Partial<LessonSession>
): LessonSession | undefined {
    const session = sessions.get(sessionId);
    if(!session) return undefined;

    const updatedSession = { ...session, ...updates};
    sessions.set(sessionId, updatedSession);

    return updatedSession;
}


