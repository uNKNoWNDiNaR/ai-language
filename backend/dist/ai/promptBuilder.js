"use strict";
// backend/src/ai/promptBuilder.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTutorPrompt = buildTutorPrompt;
function norm(v) {
    return String(v ?? "").trim();
}
function qQuoted(questionText) {
    return `"${questionText}"`;
}
function toLanguage(session) {
    const l = String(session.language ?? "").trim().toLowerCase();
    if (l === "en" || l === "de" || l === "es" || l === "fr")
        return l;
    return "en";
}
function buildTutorPrompt(session, intent, questionText, options) {
    const language = toLanguage(session);
    const q = norm(questionText);
    const retryMessage = norm(options?.retryMessage) || "Not quite — try again.";
    const forcedAdvanceMessage = norm(options?.forcedAdvanceMessage) || "That one was tricky — let's continue.";
    const learnerProfileSummary = norm(options?.learnerProfileSummary);
    const lines = [];
    const languageGuard = `LANGUAGE GUARD:
- The lesson language is "${language}".
- Respond ONLY in the lesson language.
- Do NOT introduce other languages.
- ONLY quote foreign words if they already appear in the question text itself.
- Do NOT turn the prompt into a translation task.`;
    // ✅ Tests expect this block + phrasing.
    lines.push("LANGUAGE GUARD:");
    lines.push(`- The lesson language is "${language}".`);
    lines.push("- Respond ONLY in the lesson language.");
    lines.push(languageGuard);
    lines.push("");
    lines.push("Hard rules:");
    lines.push(`- Only respond in the lesson language: ${language}`);
    lines.push("- Do NOT invent lesson content.");
    lines.push("- Do NOT add extra questions.");
    lines.push("- Keep responses short and calm.");
    lines.push("- IMPORTANT: The UI shows hints/corrections separately. Do NOT include hints, answers, or correction explanations in your message.");
    lines.push("");
    lines.push("Session:");
    lines.push(`- userId: ${norm(session.userId)}`);
    lines.push(`- lessonId: ${norm(session.lessonId)}`);
    lines.push(`- state: ${norm(session.state)}`);
    lines.push(`- currentQuestionIndex: ${String(session.currentQuestionIndex ?? 0)}`);
    // ✅ Tests expect LEARNER PROFILE + "do NOT mention tracking"
    if (learnerProfileSummary) {
        lines.push("");
        lines.push("LEARNER PROFILE (internal):");
        lines.push("- do NOT mention tracking, analytics, or stored history.");
        lines.push(learnerProfileSummary);
    }
    lines.push("");
    lines.push(`Intent: ${intent}`);
    lines.push("");
    lines.push("When intent is ASK_QUESTION:");
    lines.push("Respond with EXACTLY:");
    lines.push("Let's begin.");
    lines.push(q || "");
    lines.push("");
    lines.push("When intent is ADVANCE_LESSON:");
    lines.push("Respond with EXACTLY:");
    lines.push("Nice work! Next question:");
    lines.push(q ? qQuoted(q) : "");
    lines.push("");
    lines.push("When intent is ENCOURAGE_RETRY:");
    lines.push("Respond with EXACTLY:");
    lines.push(retryMessage);
    lines.push(q || "");
    lines.push("");
    lines.push("When intent is FORCED_ADVANCE:");
    lines.push("You are moving on after too many attempts.");
    lines.push("Do NOT reveal the answer in your message (UI shows it separately).");
    lines.push("Respond with EXACTLY:");
    lines.push(forcedAdvanceMessage);
    if (q) {
        lines.push("Next question:");
        lines.push(qQuoted(q));
    }
    lines.push('If questionText is empty, omit the Next question lines.');
    lines.push("");
    lines.push("When intent is END_LESSON:");
    lines.push("Respond with EXACTLY:");
    lines.push("Great job! 🎉 You've completed this lesson.");
    // Avoid trailing spaces; keep deterministic newlines.
    return lines.map((l) => l.replace(/[ \t]+$/g, "")).join("\n");
}
