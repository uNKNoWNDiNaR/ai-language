"use strict";
// backend/src/content/instructionPacks.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHelpText = getHelpText;
const EN_PACKS = {
    greetings_hello: {
        hint1: "Use a friendly, simple greeting.",
        hint2: "A short, everyday greeting works best.",
        explanation: "This greeting is used to start a conversation politely.",
        revealAnswerLeadIn: "A common way to say it is:",
    },
    asking_name: {
        hint1: "Ask directly using a polite question.",
        hint2: "A common pattern is: What is your name?",
        explanation: "You can ask for someone’s name using a short, polite question.",
        revealAnswerLeadIn: "A natural way to ask is:",
    },
    introduce_self: {
        hint1: "Start with “My name is …”.",
        hint2: "Keep it short and natural.",
        explanation: "Introduce yourself using a simple name pattern.",
        revealAnswerLeadIn: "A common introduction is:",
    },
    number_after_one: {
        hint1: "Count forward by one.",
        hint2: "It’s the next number after one.",
        explanation: "Numbers follow a fixed order; this is the second number.",
        revealAnswerLeadIn: "The next number is:",
    },
    color_sky: {
        hint1: "Think of a clear daytime sky.",
        hint2: "It’s a common basic color word.",
        explanation: "We often describe a clear sky with this color.",
        revealAnswerLeadIn: "A common color word is:",
    },
    color_apple: {
        hint1: "Think of the most common apple color.",
        hint2: "It’s a basic color word.",
        explanation: "Many apples are described with this color.",
        revealAnswerLeadIn: "A common color word is:",
    },
};
const DE_PACKS = {
    greetings_hello: {
        hint1: "Verwende eine freundliche, einfache Begrüßung.",
        hint2: "Eine kurze Alltagsbegrüßung passt gut.",
        explanation: "Diese Begrüßung beginnt ein Gespräch höflich.",
        revealAnswerLeadIn: "Eine übliche Form ist:",
    },
    asking_name: {
        hint1: "Stelle eine direkte, höfliche Frage.",
        hint2: "Ein gängiges Muster ist: Wie heißt du?",
        explanation: "So fragt man kurz und höflich nach einem Namen.",
        revealAnswerLeadIn: "Eine natürliche Frage ist:",
    },
    introduce_self: {
        hint1: "Beginne mit „Mein Name ist …“.",
        hint2: "Halte es kurz und natürlich.",
        explanation: "Stelle dich mit einem einfachen Namensmuster vor.",
        revealAnswerLeadIn: "Eine übliche Vorstellung ist:",
    },
    number_after_one: {
        hint1: "Zähle um eins weiter.",
        hint2: "Es ist die Zahl nach eins.",
        explanation: "Zahlen haben eine feste Reihenfolge; es ist die zweite Zahl.",
        revealAnswerLeadIn: "Die nächste Zahl ist:",
    },
    color_sky: {
        hint1: "Denk an einen klaren Himmel am Tag.",
        hint2: "Es ist ein grundlegendes Farbwörter.",
        explanation: "Ein klarer Himmel wird oft mit dieser Farbe beschrieben.",
        revealAnswerLeadIn: "Ein gängiges Farbwörter ist:",
    },
    color_apple: {
        hint1: "Denk an die häufigste Apfelfarbe.",
        hint2: "Es ist ein grundlegendes Farbwörter.",
        explanation: "Viele Äpfel werden mit dieser Farbe beschrieben.",
        revealAnswerLeadIn: "Ein gängiges Farbwörter ist:",
    },
};
function normalizeTag(value) {
    return value.trim().toLowerCase().replace(/\s+/g, "_");
}
function normalizeLang(value) {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (raw === "de" || raw === "es" || raw === "fr")
        return raw;
    return "en";
}
function getHelpText(conceptTag, instructionLanguage) {
    if (!conceptTag)
        return {};
    const tag = normalizeTag(conceptTag);
    const lang = normalizeLang(instructionLanguage);
    if (lang === "de") {
        return DE_PACKS[tag] ?? EN_PACKS[tag] ?? {};
    }
    // ES/FR fallback to EN for now.
    return EN_PACKS[tag] ?? {};
}
