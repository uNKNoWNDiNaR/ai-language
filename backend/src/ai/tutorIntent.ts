// src/ai/tutorIntent.ts

import { getForcedAdvanceMessage } from "./staticTutorMessages"

export type TutorIntent =   //AI behaviour only
    | "ASK_QUESTION"
    | "ENCOURAGE_RETRY"
    | "ADVANCE_LESSON"
    | "FORCED_ADVANCE"
    | "END_LESSON"
