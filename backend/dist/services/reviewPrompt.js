"use strict";
// backend/src/services/reviewPrompt.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReviewFallbackPrompt = buildReviewFallbackPrompt;
exports.buildReviewPrompt = buildReviewPrompt;
const practiceGenerator_1 = require("./practiceGenerator");
const openaiClient_1 = require("../ai/openaiClient");
function normalizeForCompare(text) {
    return (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function titleCase(input) {
    if (!input)
        return "";
    return input
        .split(" ")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
        .join(" ")
        .trim();
}
function buildReviewFallbackPrompt(args) {
    const raw = (args.sourceQuestionText || "").trim();
    if (!raw)
        return "Practice: Respond naturally.";
    const stripped = raw.replace(/[?]+$/g, "").trim();
    const lower = stripped.toLowerCase();
    let prompt = stripped;
    if (lower.startsWith("how do you say")) {
        const rest = stripped.slice("How do you say".length).trim();
        prompt = `Say ${rest}`.trim();
    }
    else if (lower.startsWith("how do you ask")) {
        const rest = stripped.slice("How do you ask".length).trim();
        prompt = rest ? `Ask ${rest}` : "Ask in a natural way";
    }
    else if (lower.startsWith("how do you introduce")) {
        prompt = "Introduce yourself politely";
    }
    else if (lower.startsWith("reply to")) {
        const rest = stripped.slice("Reply to".length).trim();
        prompt = rest ? `Reply naturally to ${rest}` : "Reply naturally";
    }
    else if (lower.startsWith("respond to")) {
        const rest = stripped.slice("Respond to".length).trim();
        prompt = rest ? `Respond naturally to ${rest}` : "Respond naturally";
    }
    else if (lower.startsWith("how do you")) {
        const rest = stripped.slice("How do you".length).trim();
        prompt = rest ? `Please ${rest}` : "Please respond naturally";
    }
    prompt = prompt.replace(/\s+/g, " ").trim();
    if (prompt && !/[.!?]$/.test(prompt)) {
        prompt = `${prompt}.`;
    }
    const normalizedPrompt = normalizeForCompare(prompt);
    const normalizedRaw = normalizeForCompare(raw);
    if (!normalizedPrompt || normalizedPrompt === normalizedRaw) {
        const conceptLabel = args.conceptTag
            ? titleCase(args.conceptTag.replace(/_/g, " ").trim())
            : "";
        if (conceptLabel)
            return `Practice: ${conceptLabel}.`;
        return "Practice: Respond naturally.";
    }
    return prompt;
}
async function buildReviewPrompt(params) {
    try {
        const { item, source } = await (0, practiceGenerator_1.generatePracticeItem)({
            language: params.language,
            lessonId: params.lessonId,
            sourceQuestionText: params.sourceQuestionText,
            expectedAnswerRaw: params.expectedAnswerRaw,
            examples: params.examples,
            conceptTag: params.conceptTag,
            type: "variation",
        }, { generatePracticeJSON: openaiClient_1.generatePracticeJSON }, { forceEnabled: true });
        if (source === "ai" && item?.prompt) {
            const trimmed = String(item.prompt).trim();
            if (trimmed)
                return trimmed;
        }
    }
    catch {
        // fall through to deterministic fallback
    }
    return buildReviewFallbackPrompt({
        sourceQuestionText: params.sourceQuestionText,
        conceptTag: params.conceptTag,
    });
}
