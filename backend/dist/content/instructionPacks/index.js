"use strict";
// backend/src/content/instructionPacks/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPackEntry = getPackEntry;
exports.getHelpText = getHelpText;
const en_1 = require("./en");
const de_1 = require("./de");
function normalizeTag(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[.$]/g, "_")
        .replace(/\s+/g, "_");
}
function normalizeLang(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (raw === "en" || raw === "de" || raw === "es" || raw === "fr")
        return raw;
    return null;
}
function pickPack(lang) {
    if (lang === "en")
        return en_1.EN_PACKS;
    if (lang === "de")
        return de_1.DE_PACKS;
    return null;
}
function getPackEntry(instructionLanguage, conceptTag) {
    if (!conceptTag)
        return null;
    const lang = normalizeLang(instructionLanguage);
    if (!lang)
        return null;
    const pack = pickPack(lang);
    if (!pack)
        return null;
    const tag = normalizeTag(conceptTag);
    return pack[tag] ?? null;
}
// Legacy hint support used by lesson hint selection (fallbacks to EN when IL pack missing).
function getHelpText(conceptTag, instructionLanguage) {
    if (!conceptTag)
        return {};
    const tag = normalizeTag(conceptTag);
    const lang = normalizeLang(instructionLanguage) ?? "en";
    const primary = pickPack(lang);
    const fallback = en_1.EN_PACKS;
    const entry = (primary && primary[tag]) || fallback[tag];
    if (!entry)
        return {};
    const hint1 = entry.hint?.[0];
    const hint2 = entry.hint?.[1] ?? entry.hint?.[0];
    return {
        hint1,
        hint2,
        explanation: entry.explanation,
    };
}
