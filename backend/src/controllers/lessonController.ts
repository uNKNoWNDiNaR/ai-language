// src/controllers/lessonController.ts

import { LessonSession, sessions } from "../state/lessonState";

export const startLesson = (userId: string): LessonSession =>{
    const session: LessonSession = {
        userId,
        lessonId: "basic-1",
        state: "PROMPT",
        attempts: 0,
        maxAttempts: 3,
    };
    sessions[userId] = session;
    return session;
};

// Handle user answer submission
export const submitAnswer = (userId: string, isCorrect: boolean): LessonSession => {
    const session = sessions[userId]
    if (!session) throw new Error("No active sessions");

    if (isCorrect){
        session.state = "ADVANCE";
        session.attempts = 0;
    }
    else{
        session.attempts += 1;
        if(session.attempts >= session.maxAttempts) {
            session.state = "ADVANCE";  //force move forward after maximum retries
            session.attempts = 0;
        }
        else{
            session.state = "RETRY" //asks the user to try again
        }
    }

    return session;
};

