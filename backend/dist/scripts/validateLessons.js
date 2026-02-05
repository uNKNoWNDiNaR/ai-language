"use strict";
// backend/src/scripts/validateLessons.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const lessonValidator_1 = require("../validation/lessonValidator");
function parseArgs(argv) {
    const args = {
        dir: path_1.default.resolve(__dirname, "..", "lessons"),
    };
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        const value = argv[i + 1];
        if (key === "--dir" && value) {
            args.dir = path_1.default.resolve(process.cwd(), value);
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
async function fileExists(filePath) {
    try {
        const stat = await promises_1.default.stat(filePath);
        return stat.isFile();
    }
    catch {
        return false;
    }
}
async function listLessonFiles(args) {
    const dir = args.dir;
    const files = [];
    if (args.language && args.lesson) {
        const file = path_1.default.join(dir, args.language, `${args.lesson}.json`);
        if (await fileExists(file))
            files.push(file);
        return files;
    }
    if (args.language) {
        const langDir = path_1.default.join(dir, args.language);
        try {
            const entries = await promises_1.default.readdir(langDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isFile())
                    continue;
                if (!entry.name.endsWith(".json"))
                    continue;
                files.push(path_1.default.join(langDir, entry.name));
            }
        }
        catch {
            return files;
        }
        return files;
    }
    if (args.lesson) {
        try {
            const langDirs = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of langDirs) {
                if (!entry.isDirectory())
                    continue;
                const file = path_1.default.join(dir, entry.name, `${args.lesson}.json`);
                if (await fileExists(file))
                    files.push(file);
            }
        }
        catch {
            return files;
        }
        return files;
    }
    try {
        const langDirs = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const entry of langDirs) {
            if (!entry.isDirectory())
                continue;
            const langDir = path_1.default.join(dir, entry.name);
            const entries = await promises_1.default.readdir(langDir, { withFileTypes: true });
            for (const file of entries) {
                if (!file.isFile())
                    continue;
                if (!file.name.endsWith(".json"))
                    continue;
                files.push(path_1.default.join(langDir, file.name));
            }
        }
    }
    catch {
        return files;
    }
    return files;
}
function toPosixPath(p) {
    return p.split(path_1.default.sep).join("/");
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const files = await listLessonFiles(args);
    const errorsByFile = {};
    for (const file of files) {
        const rel = toPosixPath(path_1.default.relative(args.dir, file));
        let raw = "";
        try {
            raw = await promises_1.default.readFile(file, "utf8");
        }
        catch (err) {
            errorsByFile[rel] = [`failed to read file`];
            continue;
        }
        let json;
        try {
            json = JSON.parse(raw);
        }
        catch (err) {
            errorsByFile[rel] = ["invalid JSON"];
            continue;
        }
        const result = (0, lessonValidator_1.validateLessonJson)(json, rel);
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
