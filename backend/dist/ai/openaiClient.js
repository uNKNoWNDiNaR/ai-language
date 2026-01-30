"use strict";
// src/ai/openaiClient.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTutorResponse = generateTutorResponse;
exports.generatePracticeJSON = generatePracticeJSON;
const openai_1 = __importDefault(require("openai"));
let client = null;
function getClient() {
    if (!client) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not set");
        }
        client = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return client;
}
function buildIntentLanguagePolicy(intent, language) {
    const lang = typeof language === "string" && language.trim() ? language.trim() : "";
    return [
        "POLICY (must follow):",
        `- Intent: ${intent}`,
        lang ? `- Output language must be: ${lang}` : "- Output language must match the lesson language in the prompt",
        "- Do NOT switch languages unless explicitly asked in the prompt.",
        "- Do NOT add extra questions. Do NOT add extra explanations unless the prompt explicitly instructs it.",
        "- Follow the format rules in the prompt exactly.",
    ].join("\n");
}
const INTENT_DEFAULTS = {
    ASK_QUESTION: { temperature: 0.2, maxOutputTokens: 140 },
    ENCOURAGE_RETRY: { temperature: 0.2, maxOutputTokens: 160 },
    ADVANCE_LESSON: { temperature: 0.2, maxOutputTokens: 160 },
    FORCED_ADVANCE: { temperature: 0.1, maxOutputTokens: 200 },
    END_LESSON: { temperature: 0.2, maxOutputTokens: 120 },
    EXPLAIN_PRACTICE_RESULT: { temperature: 0.3, maxOutputTokens: 120 },
};
// Main AI entry point
async function generateTutorResponse(prompt, intent, opts) {
    try {
        const baseSystem = `You are a friendly, patient native-speaker language tutor.
Speak naturally like a real human tutor.
Keep responses short, clear, and encouraging.
Never ask multiple questions at once.`;
        const policy = buildIntentLanguagePolicy(intent, opts?.language);
        const defaults = INTENT_DEFAULTS[intent];
        const temperature = typeof opts?.temperature === "number" ? opts.temperature : defaults.temperature;
        const max_output_tokens = typeof opts?.maxOutputTokens === "number" ? opts.maxOutputTokens : defaults.maxOutputTokens;
        const response = await getClient().responses.create({
            model: "gpt-4o-mini",
            input: [
                { role: "system", content: `${baseSystem}\n\n${policy}` },
                { role: "user", content: prompt },
            ],
            temperature,
            max_output_tokens,
        });
        return response.output_text || "Sorry, I couldn't generate a response.";
    }
    catch (error) {
        console.error("OpenAI error:", error);
        return "I'm having trouble responding right now. Please try again.";
    }
}
// AI call for the practice response JSON to be created
async function generatePracticeJSON(prompt) {
    try {
        const response = await getClient().responses.create({
            model: "gpt-4o-mini",
            input: [
                {
                    role: "system",
                    content: "You output ONLY valid JSON. No markdown, No extra text. Follow the schema exactly.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0,
            max_output_tokens: 300,
        });
        return response.output_text || "";
    }
    catch (err) {
        console.error("OpenAI practice JSON error:", err);
        return "";
    }
}
