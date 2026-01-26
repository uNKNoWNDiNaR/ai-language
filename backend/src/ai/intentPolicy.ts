//backend/src/ai/intentPolicy.ts

import type { TutorIntent } from "./tutorIntent";
import type { TutorResponseOptions } from "./openaiClient";

export type TutorResponseDefaults = Required<Omit<TutorResponseOptions,"language">>;

export function getTutorResponseDefaults(intent: TutorIntent): TutorResponseDefaults {
  switch (intent) {
    case "ASK_QUESTION":
    case "ADVANCE_LESSON":
      return { temperature: 0.2, maxOutputTokens: 140 };

    case "ENCOURAGE_RETRY":
      return { temperature: 0.2, maxOutputTokens: 180 };

    case "FORCED_ADVANCE":
      return { temperature: 0.1, maxOutputTokens: 200 };

    case "END_LESSON":
      return { temperature: 0.2, maxOutputTokens: 80 };

    // If your TutorIntent includes this, we set a sensible default too.
    // Your explainer already overrides with opts, so this is mostly a safe fallback.
    case "EXPLAIN_PRACTICE_RESULT":
      return { temperature: 0.3, maxOutputTokens: 120 };

    default:
      return { temperature: 0.2, maxOutputTokens: 140 };
  }
}
