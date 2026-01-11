// src/ai/promptBuiler.ts


import { basicLesson1 } from "../lessons/basic-1";
import { LessonSession } from "../state/lessonState";
import { TutorIntent } from "./tutorIntent";

export function buildTutorPrompt (

    
    session: LessonSession,
    intent: TutorIntent
): string {



    const baseContext = `
You are a friendly, patient language tutor.
The student is learning the basic concepts.
Keep responses short and encouraging.
Do not ask multiple questions at once.
`;

    switch(intent) {
        case "ASK_QUESTION": 

            return `${baseContext}
Ask the student the next question for the lesson. Wait for their answer
`;
       
        case "ENCOURAGE_RETRY": 
            return`${baseContext}
The student answered incorrectly. Encourage them to try again without giving the answer.
`;

        case "ADVANCE_LESSON":
            return `${baseContext}
The student is moving to the next question in the lesson. Ask the next question briefly.
`;

        case "END_LESSON": 
            return `${baseContext}
The student answered correctly. Praise them briefly and end the lesson politely.
`;
        
        default:
            return baseContext;
    }
}