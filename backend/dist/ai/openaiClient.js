"use strict";
// src/ai/openaiClient.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTutorResponse = generateTutorResponse;
const openai_1 = __importDefault(require("openai"));
const client = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
// Main AI entry point
async function generateTutorResponse(prompt, intent) {
    try {
        const response = await client.responses.create({
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
            temperature: 0.7,
            max_output_tokens: 180
        });
        return response.output_text
            || "Sorry, I couldn't generate a response.";
    }
    catch (error) {
        console.error("OpenAI error:", error);
        return "I'm having trouble responding right now. Please try again.";
    }
}
