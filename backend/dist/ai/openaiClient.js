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
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return client;
}
// Main AI entry point
async function generateTutorResponse(prompt, intent, opts) {
    try {
        const response = await getClient().responses.create({
            model: "gpt-4o-mini",
            input: [
                {
                    role: "system",
                    content: `You are a friendly, patient native-speaker language tutor.
Speak naturally like a real human tutor.
Keep responses short, clear, and encouraging.
Never ask multiple questions at once.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: typeof opts?.temperature === "number" ? opts.temperature : 0.7,
            max_output_tokens: typeof opts?.maxOutputTokens === "number" ? opts.maxOutputTokens : 180,
        });
        return response.output_text
            || "Sorry, I couldn't generate a response.";
    }
    catch (error) {
        console.error("OpenAI error:", error);
        return "I'm having trouble responding right now. Please try again.";
    }
}
//AI call for the practice response JSON to be created
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
