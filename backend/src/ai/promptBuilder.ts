// src/ai/promptBuiler.ts


import { LessonSession } from "../state/lessonState";
import { TutorIntent } from "./tutorIntent";

export function buildTutorPrompt (session: LessonSession,intent: TutorIntent, questionText: string): string {

    return`
You are alesson tutor engine.
You must follow theinstructions exactly.
Do not invent new lesson content.
Do not repeat preious questions.
Do not ask extra questions.
Do not change the lesson order.
Do not add side explanation.

You must only do the following based on the Intent: 

ASK_QUESTION:
say: "Let's begin."
Then ask exactly this question: 
"${questionText}"

ENCOURAGE_RETRY:
Say: "Almost! Try again."
Then ask exactly this question: 
"${questionText}"

ADVANCE_LESSON:
Say: "Nice work! Next question:"
Then ask exactly this question: 
"${questionText}"

END_LESSON:
Say: "Great job! 🎉 You’ve completed this lesson."

Do not output anything else.
Do not add additional content.
Do not add follow-up questions.

Intent: ${intent}
`;
}