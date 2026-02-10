// src/ai/openaiClient.ts

import OpenAI from "openai";
import { TutorIntent } from "./tutorIntent";
import { SupportedLanguage } from "../types";
import type { TutorResponseStruct } from "./tutorResponseTypes";

let client: OpenAI | null = null;

export type TutorResponseOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  language?: SupportedLanguage;
};

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

function buildIntentLanguagePolicy(intent: TutorIntent, language?: string): string {
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

const INTENT_DEFAULTS: Record<TutorIntent, { temperature: number; maxOutputTokens: number }> = {
  ASK_QUESTION: { temperature: 0.2, maxOutputTokens: 140 },
  ENCOURAGE_RETRY: { temperature: 0.2, maxOutputTokens: 160 },
  ADVANCE_LESSON: { temperature: 0.2, maxOutputTokens: 160 },
  FORCED_ADVANCE: { temperature: 0.1, maxOutputTokens: 200 },
  END_LESSON: { temperature: 0.2, maxOutputTokens: 120 },
  EXPLAIN_PRACTICE_RESULT: { temperature: 0.3, maxOutputTokens: 120 },
};

// Main AI entry point
export async function generateTutorResponse(
  prompt: string,
  intent: TutorIntent,
  opts?: TutorResponseOptions
): Promise<TutorResponseStruct> {
  try {
    const baseSystem =
      `You are a friendly, patient native-speaker language tutor.
Speak naturally like a real human tutor.
Keep responses short, clear, and encouraging.
Never ask multiple questions at once.`;

    const policy = buildIntentLanguagePolicy(intent, opts?.language);

    const defaults = INTENT_DEFAULTS[intent];

    const temperature =
      typeof opts?.temperature === "number" ? opts.temperature : defaults.temperature;

    const max_output_tokens =
      typeof opts?.maxOutputTokens === "number" ? opts.maxOutputTokens : defaults.maxOutputTokens;

    const response = await getClient().responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: `${baseSystem}\n\n${policy}` },
        { role: "user", content: prompt },
      ],
      temperature,
      max_output_tokens,
    });

    const raw = response.output_text || "";
    return parseTutorResponse(raw);
  } catch (error) {
    console.error("OpenAI error:", error);
    return { primaryText: "I'm having trouble responding right now. Please try again." };
  }
}

function extractJsonBlock(text: string): string | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (raw.startsWith("{") && raw.endsWith("}")) return raw;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return null;
}

function parseTutorResponse(text: string): TutorResponseStruct {
  const raw = String(text || "").trim();
  if (!raw) return { primaryText: "" };

  const jsonCandidate = extractJsonBlock(raw);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const primaryText = typeof parsed.primaryText === "string" ? parsed.primaryText : "";
      const hasSupportKey = Object.prototype.hasOwnProperty.call(parsed, "supportText");
      const supportText = typeof parsed.supportText === "string" ? parsed.supportText : undefined;
      if (primaryText || hasSupportKey) {
        return {
          primaryText: primaryText || "",
          ...(hasSupportKey && supportText !== undefined ? { supportText } : {}),
        };
      }
    } catch {
      // fall through to raw
    }
  }

  return { primaryText: raw };
}

// AI call for the practice response JSON to be created
export async function generatePracticeJSON(prompt: string): Promise<string> {
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
  } catch (err) {
    console.error("OpenAI practice JSON error:", err);
    return "";
  }
}
