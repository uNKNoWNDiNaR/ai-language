// backend/src/scripts/generateLessons.ts

import { promises as fs } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { validateLessonJson } from "../validation/lessonValidator";

type GenerateLessonsOptions = {
  inDir?: string;
  outDir?: string;
  language?: string;
  lesson?: string;
};

type LessonRecord = Record<string, unknown>;

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim().toLowerCase();
  return "";
}

function normalizeAcceptedAnswers(answer: unknown, accepted: unknown): string[] {
  const answerText = typeof answer === "string" ? answer.trim() : String(answer ?? "").trim();
  const base = Array.isArray(accepted) ? accepted : [];
  const cleaned: string[] = [];
  for (const entry of base) {
    if (typeof entry === "string" && entry.trim()) {
      cleaned.push(entry.trim());
    }
  }

  if (cleaned.length === 0 && answerText) {
    cleaned.push(answerText);
  }

  if (answerText) {
    const normalized = new Set(cleaned.map((x) => normalizeText(x)));
    if (!normalized.has(normalizeText(answerText))) {
      cleaned.push(answerText);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const entry of cleaned) {
    const norm = normalizeText(entry);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      unique.push(entry.trim());
    }
  }

  return unique;
}

function normalizeQuestion(q: LessonRecord, sourcePath: string): LessonRecord {
  const out: LessonRecord = { ...q };

  if (!("prompt" in out) && typeof out.question === "string") {
    out.prompt = out.question;
  }
  if (!("question" in out) && typeof out.prompt === "string") {
    out.question = out.prompt;
  }

  const promptText = typeof out.prompt === "string" ? out.prompt.trim() : "";
  const taskTypeRaw =
    typeof out.taskType === "string" ? out.taskType.trim().toLowerCase() : "";
  const inferredSpeaking = /\b(say|ask|reply)\s*:/i.test(promptText);
  if (!taskTypeRaw) {
    out.taskType = inferredSpeaking ? "speaking" : "typing";
  } else {
    out.taskType = taskTypeRaw;
  }

  const hasHintKey = Object.prototype.hasOwnProperty.call(out, "hint");
  const hasHintsKey = Object.prototype.hasOwnProperty.call(out, "hints");

  if (hasHintKey && hasHintsKey) {
    throw new Error(`${sourcePath}: questions[].hint must not be provided with hints`);
  }

  if (hasHintKey && !hasHintsKey && typeof out.hint === "string") {
    out.hints = [out.hint.trim()];
    delete out.hint;
  }

  if (typeof out.expectedInput === "string") {
    out.expectedInput = out.expectedInput.trim().toLowerCase();
  }

  if (Array.isArray(out.blankAnswers)) {
    out.blankAnswers = out.blankAnswers
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }

  out.acceptedAnswers = normalizeAcceptedAnswers(out.answer, out.acceptedAnswers);

  return out;
}

function normalizeLesson(input: LessonRecord, sourcePath: string): LessonRecord {
  const out: LessonRecord = { ...input };
  if (Array.isArray(out.questions)) {
    out.questions = out.questions.map((q) =>
      typeof q === "object" && q ? normalizeQuestion(q as LessonRecord, sourcePath) : q
    );
  }
  return out;
}

async function listLessonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith(".yaml") || e.name.endsWith(".yml")))
    .map((e) => path.join(dir, e.name));
}

function parseArgs(argv: string[]): GenerateLessonsOptions {
  const opts: GenerateLessonsOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--inDir") opts.inDir = argv[i + 1];
    if (arg === "--outDir") opts.outDir = argv[i + 1];
    if (arg === "--language") opts.language = argv[i + 1];
    if (arg === "--lesson") opts.lesson = argv[i + 1];
  }
  return opts;
}

export async function generateLessons(options: GenerateLessonsOptions = {}) {
  const cwd = process.cwd();
  const defaultInDir = path.resolve(__dirname, "..", "..", "content", "lessons-src");
  const defaultOutDir = path.resolve(__dirname, "..", "lessons");
  const inDir = options.inDir ? path.resolve(cwd, options.inDir) : defaultInDir;
  const outDir = options.outDir ? path.resolve(cwd, options.outDir) : defaultOutDir;
  const languageFilter = options.language ? options.language.trim().toLowerCase() : "";
  const lessonFilter = options.lesson ? options.lesson.trim() : "";

  const languageEntries = await fs.readdir(inDir, { withFileTypes: true });
  const languages = languageEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((lang) => (languageFilter ? lang === languageFilter : true));

  if (languages.length === 0) {
    throw new Error(`No language folders found under ${inDir}`);
  }

  for (const lang of languages) {
    const langDir = path.join(inDir, lang);
    const files = await listLessonFiles(langDir);

    for (const filePath of files) {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = parseYaml(raw) as LessonRecord | null;

      if (!parsed || typeof parsed !== "object") {
        throw new Error(`${filePath}: lesson must be an object`);
      }

      const normalized = normalizeLesson(parsed, filePath);
      const lessonId = typeof normalized.lessonId === "string" ? normalized.lessonId.trim() : "";

      if (lessonFilter && lessonId !== lessonFilter) {
        continue;
      }

      const validation = validateLessonJson(normalized, filePath);
      if (!validation.ok) {
        throw new Error(validation.errors.join("\n"));
      }

      if (!lessonId) {
        throw new Error(`${filePath}: lessonId is required`);
      }

      const outLangDir = path.join(outDir, lang);
      await fs.mkdir(outLangDir, { recursive: true });
      const outPath = path.join(outLangDir, `${lessonId}.json`);

      await fs.writeFile(outPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    }
  }
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  generateLessons(opts).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
