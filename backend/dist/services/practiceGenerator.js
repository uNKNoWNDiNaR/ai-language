"use strict";
//backend/src/services/practiceGenerator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePracticeItem = generatePracticeItem;
const featureFlags_1 = require("../config/featureFlags");
const validatePracticeItem_1 = require("../validation/validatePracticeItem");
function buildPracticePrompt(p) {
    const type = p.type ?? "variation";
    const examples = (p.examples && p.examples.length > 0) ? p.examples : undefined;
    // Strict JSON-only contract. No extra text.
    return [
        "You are generating ONE practice item for a calm language tutor.",
        "Return ONLY valid JSON. No markdown. No extra text.",
        "Do NOT include grading rules, rubrics, or evaluation criteria.",
        "Use only the provided lesson context. Do not invent new lesson content.",
        "RULES",
        `-Prompt language must be ${p.language}.`,
        "-Dont introduce other languages or translation prompts unless present in context.",
        "-Pratice must stay within sourceQuestionText/expectedAnswerRaw/examples only.",
        "",
        "JSON schema (keys must match exactly):",
        `{
      "practiceId": string,
      "lessonId": string,
      "language": "en" | "de" | "es" | "fr",
      "prompt": string,
      "expectedAnswerRaw": string,
      "examples": string[] (optional),
      "hint": string (optional),
      "hints": string[] (optional),
      "meta": { "type": "variation" | "dialogue_turn" | "cloze", "conceptTag": string }
    }`,
        "",
        "Lesson context:",
        `language: ${p.language}`,
        `lessonId: ${p.lessonId}`,
        `practiceType: ${type}`,
        `conceptTag: ${p.conceptTag}`,
        `sourceQuestionText: ${p.sourceQuestionText}`,
        `expectedAnswerRaw: ${p.expectedAnswerRaw}`,
        examples ? `examples: ${JSON.stringify(examples)}` : "examples: []",
        "",
        "Generate exactly one item that practices the SAME concept.",
        "Keep prompt short and friendly.",
    ].join("\n");
}
function fallbackPracticeItem(p) {
    const type = p.type ?? "variation";
    const prompt = type === "dialogue_turn"
        ? `Practice: Reply naturally.\nTutor: ${p.sourceQuestionText}`
        : type === "cloze"
            ? `Practice: Fill in the missing part.\n${p.sourceQuestionText}`
            : `Practice: ${p.sourceQuestionText}`;
    return {
        practiceId: `fallback-${Date.now()}`,
        lessonId: p.lessonId,
        language: p.language,
        prompt,
        expectedAnswerRaw: p.expectedAnswerRaw,
        examples: p.examples,
        meta: { type, conceptTag: p.conceptTag },
    };
}
function safeParseJSON(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function passesDriftGuard(item, p) {
    const prompt = String(item.prompt || "").toLowerCase();
    // Build "allowed context" from the trusted lesson anchor
    const ctx = [
        p.sourceQuestionText,
        p.expectedAnswerRaw,
        ...(p.examples ?? []),
    ]
        .join(" ")
        .toLowerCase();
    // If the prompt includes common foreign tokens that are NOT in context, reject.
    const suspicious = ["bonjour", "hola", "salut", "ciao", "guten tag"];
    for (const tok of suspicious) {
        if (prompt.includes(tok) && !ctx.includes(tok))
            return false;
    }
    return true;
}
async function generatePracticeItem(params, aiClient, options) {
    // Flag off: always fallback (no AI usage)
    const enabled = typeof options?.forceEnabled === "boolean"
        ? options.forceEnabled
        : (0, featureFlags_1.isPracticeGenEnabled)();
    // Flag off: always fallback (no AI usage)
    if (!enabled) {
        return { item: fallbackPracticeItem(params), source: "fallback" };
    }
    // If enabled but no client provided, still be safe.
    if (!aiClient) {
        return { item: fallbackPracticeItem(params), source: "fallback" };
    }
    const prompt = buildPracticePrompt(params);
    // Try up to 2 times (initial + 1 retry)
    for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await aiClient.generatePracticeJSON(prompt);
        const parsed = safeParseJSON(raw);
        if (!parsed)
            continue;
        const validated = (0, validatePracticeItem_1.validatePracticeItem)(parsed);
        if (validated.ok) {
            if (passesDriftGuard(validated.value, params)) {
                return { item: validated.value, source: "ai" };
            }
        }
    }
    return { item: fallbackPracticeItem(params), source: "fallback" };
}
