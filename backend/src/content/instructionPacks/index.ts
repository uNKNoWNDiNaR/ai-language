// backend/src/content/instructionPacks/index.ts

import type { SupportedLanguage } from "../../types";
import { EN_PACKS } from "./en";
import { DE_PACKS } from "./de";

export type PackEntry = {
  hint?: string[];
  explanation?: string;
  feedbackWrong?: string;
  feedbackAlmost?: string;
  summary?: string;
};

type PackMap = Record<string, PackEntry>;

export type HelpPack = {
  hint1?: string;
  hint2?: string;
  explanation?: string;
  revealAnswerLeadIn?: string;
};

function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.$]/g, "_")
    .replace(/\s+/g, "_");
}

function normalizeLang(value: unknown): SupportedLanguage | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "en" || raw === "de" || raw === "es" || raw === "fr") return raw;
  return null;
}

function pickPack(lang: SupportedLanguage): PackMap | null {
  if (lang === "en") return EN_PACKS;
  if (lang === "de") return DE_PACKS;
  return null;
}

export function getPackEntry(
  instructionLanguage: SupportedLanguage,
  conceptTag: string
): PackEntry | null {
  if (!conceptTag) return null;
  const lang = normalizeLang(instructionLanguage);
  if (!lang) return null;
  const pack = pickPack(lang);
  if (!pack) return null;
  const tag = normalizeTag(conceptTag);
  return pack[tag] ?? null;
}

// Legacy hint support used by lesson hint selection (fallbacks to EN when IL pack missing).
export function getHelpText(
  conceptTag: string,
  instructionLanguage?: SupportedLanguage
): HelpPack {
  if (!conceptTag) return {};
  const tag = normalizeTag(conceptTag);
  const lang = normalizeLang(instructionLanguage) ?? "en";

  const primary = pickPack(lang);
  const fallback = EN_PACKS;
  const entry = (primary && primary[tag]) || fallback[tag];
  if (!entry) return {};

  const hint1 = entry.hint?.[0];
  const hint2 = entry.hint?.[1] ?? entry.hint?.[0];

  return {
    hint1,
    hint2,
    explanation: entry.explanation,
  };
}

