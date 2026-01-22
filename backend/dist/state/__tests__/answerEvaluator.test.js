"use strict";
// backend/src/state/__tests__/answerEvaluator.test.ts
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const answerEvaluator_1 = require("../answerEvaluator");
const makeQ = (overrides = {}) => ({
    id: 1,
    question: "",
    answer: "",
    examples: [],
    ...overrides,
});
//Answer evaluation test. Basic for all the other changes but is in a bit more detail for English 
(0, vitest_1.describe)("evaluateAnswer - regression tests", () => {
    (0, vitest_1.it)("accepts placeholder answers with real names", () => {
        const q = makeQ({ answer: "My name is [Your name]" });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "My name is Hillary", "en");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("flags missing slot as almost", () => {
        const q = makeQ({ answer: "My name is [Your name]" });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "My name is", "en");
        (0, vitest_1.expect)(r.result).toBe("almost");
        (0, vitest_1.expect)(r.reasonCode).toBe("MISSING_SLOT");
    });
    (0, vitest_1.it)("accepts ask-name contraction", () => {
        const q = makeQ({ answer: "What is your name" });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "What's your name", "en");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("accepts short how-are-you reply", () => {
        const q = makeQ({
            answer: "I am fine",
            examples: ["I am fine", "I'm doing well"],
        });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "fine", "en");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("accepts greeting variants", () => {
        const q = makeQ({
            answer: "Hello",
            examples: ["Hello", "Hi", "Hey"],
        });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "hi there", "en");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("accepts 'morning' for good morning", () => {
        const q = makeQ({
            answer: "Good morning",
            examples: ["Good morning", "Morning"],
        });
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "morning", "en");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("accepts 'heisst' for 'heißt'", () => {
        const q = {
            answer: "Wie heißt du?",
            examples: ["Wie heißt du?", "Wie ist dein Name?", "Wie heisst du?"]
        };
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "Wie heißt du", "de");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("accepts expanded 'Wie gehts' replies", () => {
        const q = {
            answer: "Mir geht's gut",
            examples: ["Mir geht's gut", "Mir geht es gut", "Ganz gut",]
        };
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "Mir geht es gut", "de");
        (0, vitest_1.expect)(r.result).toBe("correct");
    });
    (0, vitest_1.it)("keeps article mismatch as almost", () => {
        const q = { answer: "der Tisch" };
        const r = (0, answerEvaluator_1.evaluateAnswer)(q, "die Tisch", "de");
        (0, vitest_1.expect)(r.result).toBe("almost");
    });
});
