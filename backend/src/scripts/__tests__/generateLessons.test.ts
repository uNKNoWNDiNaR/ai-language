import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { generateLessons } from "../generateLessons";

async function setupDirs() {
  const root = await mkdtemp(path.join(tmpdir(), "lesson-gen-"));
  const inDir = path.join(root, "content", "lessons-src", "en");
  const outDir = path.join(root, "src", "lessons");
  await mkdir(inDir, { recursive: true });
  return { root, inDir, outDir };
}

describe("generateLessons", () => {
  it("writes JSON with required fields and deterministic output", async () => {
    const { inDir, outDir } = await setupDirs();
    const yaml = `
lessonId: basic-1
title: Basic 1
description: Test
questions:
  - id: 1
    question: "Say: Hello."
    answer: "Hello."
    conceptTag: a1.greetings.hello
`;
    await writeFile(path.join(inDir, "basic-1.yaml"), yaml, "utf8");

    await generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" });

    const outputPath = path.join(outDir, "en", "basic-1.json");
    const rawFirst = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(rawFirst);

    expect(parsed.lessonId).toBe("basic-1");
    expect(parsed.title).toBe("Basic 1");
    expect(parsed.description).toBe("Test");
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].question).toBe("Say: Hello.");
    expect(parsed.questions[0].prompt).toBe("Say: Hello.");
    expect(parsed.questions[0].answer).toBe("Hello.");
    expect(parsed.questions[0].acceptedAnswers).toContain("Hello.");

    await generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" });
    const rawSecond = await readFile(outputPath, "utf8");
    expect(rawSecond).toBe(rawFirst);
    expect(rawFirst).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  });

  it("throws when conceptTag is missing", async () => {
    const { inDir, outDir } = await setupDirs();
    const yaml = `
lessonId: basic-1
title: Basic 1
description: Test
questions:
  - id: 1
    question: "Hello?"
    prompt: "Hello?"
    answer: "Hello"
`;
    await writeFile(path.join(inDir, "basic-1.yaml"), yaml, "utf8");

    await expect(
      generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" })
    ).rejects.toThrow(/conceptTag/i);
  });

  it("throws when answer is missing", async () => {
    const { inDir, outDir } = await setupDirs();
    const yaml = `
lessonId: basic-1
title: Basic 1
description: Test
questions:
  - id: 1
    question: "Hello?"
    conceptTag: greetings_hello
`;
    await writeFile(path.join(inDir, "basic-1.yaml"), yaml, "utf8");

    await expect(
      generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" })
    ).rejects.toThrow(/answer/i);
  });

  it("normalizes hint into hints", async () => {
    const { inDir, outDir } = await setupDirs();
    const yaml = `
lessonId: basic-1
title: Basic 1
description: Test
questions:
  - id: 1
    question: "Say: Hello."
    answer: "Hello."
    conceptTag: greetings_hello
    hint: "Use a greeting."
`;
    await writeFile(path.join(inDir, "basic-1.yaml"), yaml, "utf8");

    await generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" });

    const outputPath = path.join(outDir, "en", "basic-1.json");
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    expect(parsed.questions[0].hints).toEqual(["Use a greeting."]);
    expect(parsed.questions[0].hint).toBeUndefined();
  });

  it("throws when both hint and hints are provided", async () => {
    const { inDir, outDir } = await setupDirs();
    const yaml = `
lessonId: basic-1
title: Basic 1
description: Test
questions:
  - id: 1
    question: "Hello?"
    prompt: "Hello?"
    answer: "Hello"
    conceptTag: greetings_hello
    hint: "Try a greeting."
    hints:
      - "Hi"
`;
    await writeFile(path.join(inDir, "basic-1.yaml"), yaml, "utf8");

    await expect(
      generateLessons({ inDir: path.join(inDir, ".."), outDir, language: "en" })
    ).rejects.toThrow(/hint/i);
  });
});
