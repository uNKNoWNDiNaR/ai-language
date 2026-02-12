"use strict";
// backend/src/ai/promptBuilder.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTutorPrompt = buildTutorPrompt;
const supportPolicy_1 = require("./supportPolicy");
const supportLevel_1 = require("../utils/supportLevel");
function safeStr(v) {
    return typeof v === "string" ? v : "";
}
function buildTutorPrompt(session, intent, questionText, ctx = {}) {
    const lang = safeStr(session?.language) || "en";
    const retryMessage = safeStr(ctx.retryMessage).trim();
    const hintText = safeStr(ctx.hintText).trim();
    const hintLeadIn = safeStr(ctx.hintLeadIn).trim();
    const forcedAdvanceMessage = safeStr(ctx.forcedAdvanceMessage).trim();
    const revealAnswer = safeStr(ctx.revealAnswer).trim();
    const learnerProfileSummary = safeStr(ctx.learnerProfileSummary).trim();
    const explanationText = safeStr(ctx.explanationText).trim();
    const instructionLanguage = safeStr(ctx.instructionLanguage).trim();
    const normalizedInstructionLanguage = instructionLanguage === "en" ||
        instructionLanguage === "de" ||
        instructionLanguage === "es" ||
        instructionLanguage === "fr"
        ? instructionLanguage
        : undefined;
    const normalizedSupportLevel = (0, supportLevel_1.normalizeSupportLevel)(ctx.supportLevel) ?? "high";
    const supportTextDirective = ctx.supportTextDirective === "include" ? "include" : "omit";
    const isEnglish = lang === "en";
    const eventType = safeStr(ctx.eventType).trim() || "UNSPECIFIED";
    const conceptTag = safeStr(ctx.conceptTag).trim();
    const teachingPace = safeStr(ctx.pace ?? ctx.teachingPace).trim();
    const explanationDepthPref = safeStr(ctx.explanationDepth).trim();
    const pace = teachingPace === "slow" ? "slow" : "normal";
    const explanationDepth = explanationDepthPref === "short" || explanationDepthPref === "detailed"
        ? explanationDepthPref
        : "normal";
    const lessonLanguage = lang === "de" || lang === "es" || lang === "fr" || lang === "en" ? lang : "en";
    const policy = (0, supportPolicy_1.computeSupportPolicy)({
        intent,
        pace,
        explanationDepth,
        supportLevel: normalizedSupportLevel,
        instructionLanguage: normalizedInstructionLanguage,
        lessonLanguage,
        attemptCount: ctx.attemptCount,
        isFirstQuestion: ctx.isFirstQuestion,
    });
    let includeSupport = policy.includeSupport;
    if (typeof ctx.includeSupport === "boolean")
        includeSupport = ctx.includeSupport;
    if (supportTextDirective === "omit")
        includeSupport = false;
    const supportLanguageStyle = policy.supportLanguageStyle;
    const maxSupportBullets = policy.maxSupportBullets;
    const pacePrefix = pace === "slow" ? "Take your time." : "";
    const languageGuard = [
        `LANGUAGE RULES:`,
        `- The lesson language is "${lang}".`,
        `- primaryText MUST be in the lesson language.`,
        `- A separate "Support" section is allowed only when includeSupport=true.`,
        `- Never mention language names.`,
        `- Never translate tokens inside quotes "..." or brackets [...].`,
        `- Do NOT introduce other languages in primaryText.`,
        `- ONLY quote foreign words that appear in the question text.`,
        `- do NOT turn the prompt into a translation task.`,
        ``,
        `Hard rules:`,
        `- primaryText must use the lesson language: ${lang}`,
        `- Do NOT invent lesson content.`,
        `- Do NOT add extra questions.`,
        `- Keep responses short and calm.`,
        `- IMPORTANT: The UI shows hints/corrections separately. Do NOT include hints, answers, or correction explanations in primaryText.`,
    ].join("\n");
    const learnerProfileBlock = learnerProfileSummary
        ? [
            ``,
            `LEARNER PROFILE:`,
            `${learnerProfileSummary}`,
            `Hard rules:`,
            `- do NOT mention tracking or counts (no “I noticed you struggle with...” / no metrics).`,
            `- Use this ONLY to shape tone and pacing.`,
        ].join("\n")
        : "";
    const supportRulesBlock = [
        ``,
        `SUPPORT RULES:`,
        `- supportMode: ${policy.supportMode}.`,
        `- supportLevel: ${normalizedSupportLevel}.`,
        `- eventType: ${eventType}.`,
        `- includeSupport: ${includeSupport ? "true" : "false"}.`,
        `- supportLanguageStyle: ${supportLanguageStyle}.`,
        `- maxSupportBullets: ${maxSupportBullets}.`,
        `- explanationDepth: ${explanationDepth}.`,
        `- If includeSupport=false, supportText MUST be an empty string.`,
        `- If includeSupport=true, supportText MUST follow:`,
        `  Support:`,
        `  - bullet 1`,
        `  - bullet 2 (optional)`,
        `- support bullets must follow supportLanguageStyle:`,
        `  - il_only: bullets in instruction language.`,
        `  - mixed: each bullet = TL short phrase, then "—", then IL clarification.`,
        `  - tl_only: bullets in lesson language only.`,
        `- explanationDepth rules:`,
        `  - short: 1 bullet max, very brief.`,
        `  - normal: up to maxSupportBullets, include 1 micro-rule.`,
        `  - detailed: up to maxSupportBullets, include 2 micro-rules + 1 tiny example pattern.`,
    ].join("\n");
    const outputFormatBlock = [
        ``,
        `OUTPUT FORMAT (strict JSON):`,
        `Return ONLY valid JSON, no markdown, no extra text.`,
        `Schema: {"primaryText":"...","supportText":"..."}`,
        `- Always include supportText (use an empty string if omitted).`,
    ].join("\n");
    const sessionBlock = [
        ``,
        `Session:`,
        `- userId: ${safeStr(session?.userId)}`,
        `- lessonId: ${safeStr(session?.lessonId)}`,
        `- state: ${safeStr(session?.state)}`,
        `- currentQuestionIndex: ${String(session?.currentQuestionIndex ?? 0)}`,
    ].join("\n");
    const conceptBlock = conceptTag
        ? [
            ``,
            `Concept:`,
            `- conceptTag: ${conceptTag}`,
        ].join("\n")
        : "";
    const teachingPrefsBlock = teachingPace || explanationDepthPref
        ? [
            ``,
            `Teaching Prefs:`,
            teachingPace ? `- pace: ${pace}` : "",
            explanationDepthPref ? `- explanationDepth: ${explanationDepth}` : "",
        ]
            .filter(Boolean)
            .join("\n")
        : "";
    const intentBlock = [];
    intentBlock.push(``);
    intentBlock.push(`Intent: ${intent}`);
    intentBlock.push(``);
    // These intent templates are deterministic for English to keep tests stable.
    intentBlock.push(`When intent is ASK_QUESTION:`);
    if (isEnglish) {
        intentBlock.push(`Set primaryText to EXACTLY:`);
        if (pacePrefix)
            intentBlock.push(pacePrefix);
        intentBlock.push(`Let's begin.`);
        intentBlock.push(questionText ? questionText : "");
    }
    else {
        intentBlock.push(`Set primaryText to a short, calm line in the lesson language, then the question text on a new line.`);
        if (pacePrefix)
            intentBlock.push(`(If pace=slow, add a calm prefix line first.)`);
        if (questionText)
            intentBlock.push(questionText);
    }
    intentBlock.push(``);
    intentBlock.push(`When intent is ADVANCE_LESSON:`);
    if (isEnglish) {
        intentBlock.push(`Set primaryText to EXACTLY:`);
        if (pacePrefix)
            intentBlock.push(pacePrefix);
        intentBlock.push(`Nice work! Next question:`);
        intentBlock.push(questionText ? `"${questionText}"` : "");
    }
    else {
        intentBlock.push(`Set primaryText to a short positive transition in the lesson language, then the next question on a new line.`);
        if (pacePrefix)
            intentBlock.push(`(If pace=slow, add a calm prefix line first.)`);
        if (questionText)
            intentBlock.push(questionText);
    }
    intentBlock.push(``);
    intentBlock.push(`When intent is ENCOURAGE_RETRY:`);
    if (isEnglish) {
        intentBlock.push(`Set primaryText to EXACTLY:`);
        intentBlock.push(retryMessage ? retryMessage : `Not quite — try again.`);
        if (hintText) {
            if (hintLeadIn)
                intentBlock.push(hintLeadIn);
            intentBlock.push(`Hint: ${hintText}`.trim());
        }
        intentBlock.push(questionText ? questionText : "");
    }
    else {
        intentBlock.push(`Set primaryText to a short retry line in the lesson language.`);
        if (hintText) {
            intentBlock.push(hintText);
        }
        if (questionText)
            intentBlock.push(questionText);
    }
    intentBlock.push(``);
    intentBlock.push(`When intent is FORCED_ADVANCE:`);
    intentBlock.push(`You are moving on after too many attempts.`);
    intentBlock.push(`Do NOT reveal the answer in primaryText (UI shows it separately).`);
    if (isEnglish) {
        if (forcedAdvanceMessage) {
            intentBlock.push(`Set primaryText to EXACTLY:`);
            intentBlock.push(forcedAdvanceMessage);
        }
        else {
            intentBlock.push(`Set primaryText to EXACTLY:`);
            intentBlock.push(`That one was tricky — let's continue.`);
        }
        if (questionText) {
            intentBlock.push(`Next question:`);
            intentBlock.push(`"${questionText}"`);
        }
        else {
            intentBlock.push(`If questionText is empty, omit the Next question lines.`);
        }
    }
    else {
        intentBlock.push(`Set primaryText to a short transition in the lesson language, then the next question on a new line (if any).`);
        if (questionText)
            intentBlock.push(questionText);
    }
    intentBlock.push(``);
    intentBlock.push(`When intent is END_LESSON:`);
    if (isEnglish) {
        intentBlock.push(`Set primaryText to EXACTLY:`);
        intentBlock.push(`Great job! 🎉 You've completed this lesson.`);
    }
    else {
        intentBlock.push(`Set primaryText to a calm completion line in the lesson language.`);
    }
    // NOTE: explanationText / revealAnswer are intentionally NOT placed in the tutor message.
    // UI handles them separately.
    return [
        `You are a calm, patient language tutor.`,
        ``,
        languageGuard,
        supportRulesBlock,
        outputFormatBlock,
        learnerProfileBlock,
        sessionBlock,
        conceptBlock,
        teachingPrefsBlock,
        intentBlock.join("\n"),
    ]
        .filter(Boolean)
        .join("\n");
}
