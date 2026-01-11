// src/ai/staticTutorMessages.ts

import { TutorIntent } from "./tutorIntent";

export function getStaticTutorMessage(intent: TutorIntent): string | null{
    switch(intent){
        case "END_LESSON":
            return "Great job! 🎉 You’ve completed this lesson.";
        
        case "ADVANCE_LESSON":
            return "Nice effort! Let’s move to the next part.";

        default:
            return null;
            // Returning Null means the intent needs AI generation
    }
}
