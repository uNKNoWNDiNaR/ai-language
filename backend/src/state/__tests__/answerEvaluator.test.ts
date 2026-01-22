// backend/src/state/__tests__/answerEvaluator.test.ts

import { describe, it, expect } from "vitest";
import { evaluateAnswer } from "../answerEvaluator";

const makeQ = (overrides = {}) => ({
  id: 1,
  question: "",
  answer: "",
  examples: [],
  ...overrides,
});

//Answer evaluation test. Basic for all the other changes but is in a bit more detail for English 
describe("evaluateAnswer - regression tests", () => {
  it("accepts placeholder answers with real names", () => {
    const q = makeQ({ answer: "My name is [Your name]" });
    const r = evaluateAnswer(q as any, "My name is Hillary", "en");
    expect(r.result).toBe("correct");
  });

  it("flags missing slot as almost", () => {
    const q = makeQ({ answer: "My name is [Your name]" });
    const r = evaluateAnswer(q as any, "My name is", "en");
    expect(r.result).toBe("almost");
    expect(r.reasonCode).toBe("MISSING_SLOT");
  });

  it("accepts ask-name contraction", () => {
    const q = makeQ({ answer: "What is your name" });
    const r = evaluateAnswer(q as any, "What's your name", "en");
    expect(r.result).toBe("correct");
  });

  it("accepts short how-are-you reply", () => {
    const q = makeQ({
      answer: "I am fine",
      examples: ["I am fine", "I'm doing well"],
    });
    const r = evaluateAnswer(q as any, "fine", "en");
    expect(r.result).toBe("correct");
  });

  it("accepts greeting variants", () => {
    const q = makeQ({
      answer: "Hello",
      examples: ["Hello", "Hi", "Hey"],
    });
    const r = evaluateAnswer(q as any, "hi there", "en");
    expect(r.result).toBe("correct");
  });

  it("accepts 'morning' for good morning", () => {
    const q = makeQ({
      answer: "Good morning",
      examples: ["Good morning", "Morning"],
    });
    const r = evaluateAnswer(q as any, "morning", "en");
    expect(r.result).toBe("correct");
  });

  it("accepts 'heisst' for 'heißt'", () => {
    const q = {
        answer: "Wie heißt du?",
        examples: ["Wie heißt du?", "Wie ist dein Name?", "Wie heisst du?"]
    };
    const r = evaluateAnswer(q as any, "Wie heißt du", "de");
    expect(r.result).toBe("correct");
  });

  it("accepts expanded 'Wie gehts' replies", () => {
    const q = {
        answer: "Mir geht's gut",
        examples: ["Mir geht's gut", "Mir geht es gut","Ganz gut",]
    };
    const r = evaluateAnswer(q as any, "Mir geht es gut", "de");
    expect(r.result).toBe("correct")
  });

  it("keeps article mismatch as almost", () => {
    const q = { answer: "der Tisch" };
    const r = evaluateAnswer(q as any, "die Tisch", "de");
    expect(r.result).toBe("almost")
  });

});
