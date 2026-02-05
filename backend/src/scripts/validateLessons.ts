// backend/src/scripts/validateLessons.ts

import fs from "fs/promises";
import path from "path";
import { validateLessonJson } from "../validation/lessonValidator";

type Args = {
  dir: string;
  language?: string;
  lesson?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: path.resolve(__dirname, "..", "lessons"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--dir" && value) {
      args.dir = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }
    if (key === "--language" && value) {
      args.language = value.trim().toLowerCase();
      i += 1;
      continue;
    }
    if (key === "--lesson" && value) {
      args.lesson = value.trim();
      i += 1;
      continue;
    }
  }

  return args;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function listLessonFiles(args: Args): Promise<string[]> {
  const dir = args.dir;
  const files: string[] = [];

  if (args.language && args.lesson) {
    const file = path.join(dir, args.language, `${args.lesson}.json`);
    if (await fileExists(file)) files.push(file);
    return files;
  }

  if (args.language) {
    const langDir = path.join(dir, args.language);
    try {
      const entries = await fs.readdir(langDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".json")) continue;
        files.push(path.join(langDir, entry.name));
      }
    } catch {
      return files;
    }
    return files;
  }

  if (args.lesson) {
    try {
      const langDirs = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of langDirs) {
        if (!entry.isDirectory()) continue;
        const file = path.join(dir, entry.name, `${args.lesson}.json`);
        if (await fileExists(file)) files.push(file);
      }
    } catch {
      return files;
    }
    return files;
  }

  try {
    const langDirs = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of langDirs) {
      if (!entry.isDirectory()) continue;
      const langDir = path.join(dir, entry.name);
      const entries = await fs.readdir(langDir, { withFileTypes: true });
      for (const file of entries) {
        if (!file.isFile()) continue;
        if (!file.name.endsWith(".json")) continue;
        files.push(path.join(langDir, file.name));
      }
    }
  } catch {
    return files;
  }

  return files;
}

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await listLessonFiles(args);

  const errorsByFile: Record<string, string[]> = {};

  for (const file of files) {
    const rel = toPosixPath(path.relative(args.dir, file));

    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      errorsByFile[rel] = [`failed to read file`];
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      errorsByFile[rel] = ["invalid JSON"];
      continue;
    }

    const result = validateLessonJson(json, rel);
    if (!result.ok) {
      const prefix = `${rel}: `;
      const list = result.errors.map((e) => (e.startsWith(prefix) ? e.slice(prefix.length) : e));
      errorsByFile[rel] = list;
    }
  }

  const filesWithErrors = Object.keys(errorsByFile);
  if (filesWithErrors.length === 0) {
    console.log("OK");
    return;
  }

  filesWithErrors.sort();
  for (const file of filesWithErrors) {
    console.log(file);
    for (const err of errorsByFile[file]) {
      console.log(`  - ${err}`);
    }
    console.log("");
  }

  process.exitCode = 1;
}

main().catch(() => {
  process.exit(1);
});
