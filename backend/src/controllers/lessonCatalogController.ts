// backend/src/controllers/lessonCatalogController.ts

import type { Request, Response } from "express";
import * as fs from "fs";
import path from "path";
import { sendError } from "../http/sendError";
import type { SupportedLanguage } from "../types";

type CatalogLesson = {
  lessonId: string;
  title: string;
  description: string;
  totalQuestions: number;
};

function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === "en" || v === "de" || v === "es" || v === "fr";
}

function getLessonsDir(language: string): string | null {
  const lang = (language || "").trim().toLowerCase();
  const moduleRelative = path.resolve(__dirname, "..", "lessons", lang);
  const candidates = [
    moduleRelative,
    path.join(process.cwd(), "dist", "lessons", lang),
    path.join(process.cwd(), "src", "lessons", lang),
    path.join(process.cwd(), "backend", "dist", "lessons", lang),
    path.join(process.cwd(), "backend", "src", "lessons", lang),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  return null;
}

function parseLessonIdSortKey(lessonId: string): { prefix: string; num: number } | null {
  const match = lessonId.match(/^(.*?)-(\d+)$/);
  if (!match) return null;
  const prefix = match[1].trim();
  const num = Number(match[2]);
  if (!prefix || !Number.isFinite(num)) return null;
  return { prefix, num };
}

export async function getLessonCatalog(req: Request, res: Response) {
  const language = typeof req.query.language === "string" ? req.query.language.trim() : "";

  if (!isSupportedLanguage(language)) {
    return sendError(res, 400, "language must be one of: en, de, es, fr", "INVALID_REQUEST");
  }

  const lessonsDir = getLessonsDir(language);
  if (!lessonsDir) {
    return res.status(200).json({ lessons: [] });
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(lessonsDir).filter((f) => f.toLowerCase().endsWith(".json"));
  } catch (err) {
    return sendError(res, 500, "Failed to read lesson catalog", "SERVER_ERROR");
  }

  const lessons: CatalogLesson[] = [];

  for (const file of files) {
    const fullPath = path.join(lessonsDir, file);
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const data = JSON.parse(raw) as any;
      const lessonId =
        typeof data?.lessonId === "string" && data.lessonId.trim()
          ? data.lessonId.trim()
          : path.basename(file, path.extname(file));
      const title = typeof data?.title === "string" ? data.title : "";
      const description = typeof data?.description === "string" ? data.description : "";
      const totalQuestions = Array.isArray(data?.questions) ? data.questions.length : 0;

      lessons.push({ lessonId, title, description, totalQuestions });
    } catch (err) {
      return sendError(res, 500, `Invalid lesson JSON: ${file}`, "SERVER_ERROR");
    }
  }

  lessons.sort((a, b) => {
    const ak = parseLessonIdSortKey(a.lessonId);
    const bk = parseLessonIdSortKey(b.lessonId);

    if (ak && bk) {
      const prefixCmp = ak.prefix.localeCompare(bk.prefix);
      if (prefixCmp !== 0) return prefixCmp;
      if (ak.num !== bk.num) return ak.num - bk.num;
    }

    return a.lessonId.localeCompare(b.lessonId);
  });

  return res.status(200).json({ lessons });
}
