// src/ai/staticTutorMessages.ts

import { TutorIntent } from "./tutorIntent";

export function getStaticTutorMessage(intent: TutorIntent): string | null{

    if(intent === "END_LESSON"){
        return "Great job! 🎉 You've completedthis session.";
    }

    return null;
    }
