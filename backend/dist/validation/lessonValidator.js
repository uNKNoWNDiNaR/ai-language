"use strict";
// backend/src/validation/lessonValidator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLessonJson = validateLessonJson;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function normalizeText(value) {
    if (typeof value === "string")
        return value.trim().toLowerCase();
    if (typeof value === "number" && Number.isFinite(value))
        return String(value).trim().toLowerCase();
    return "";
}
function normalizeForLeakCheck(value) {
    const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
    if (!raw)
        return "";
    return raw
        .toLowerCase()
        .replace(/[.,?!'"’"]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function isValidTaskType(value) {
    return value === "typing" || value === "speaking";
}
function isValidExpectedInput(value) {
    return value === "sentence" || value === "blank";
}
const PROMPT_STYLES = new Set([
    "BLANK_AUX",
    "TRANSFORM_SUBJECT",
    "MAKE_QUESTION",
    "REPLY_SHORT",
    "WORD_BANK",
    "SITUATION_CUE",
]);
function isValidPromptStyle(value) {
    return typeof value === "string" && PROMPT_STYLES.has(value);
}
function validateLessonJson(input, sourcePath) {
    const errors = [];
    const pushError = (path, message) => {
        errors.push(`${sourcePath}: ${path} ${message}`);
    };
    if (!isRecord(input)) {
        return { ok: false, errors: [`${sourcePath}: lesson must be an object`] };
    }
    if (!isNonEmptyString(input.lessonId)) {
        pushError("lessonId", "is required");
    }
    if (!isNonEmptyString(input.title)) {
        pushError("title", "is required");
    }
    if (!("description" in input)) {
        pushError("description", "must exist");
    }
    else if (typeof input.description !== "string") {
        pushError("description", "must be a string");
    }
    const questions = input.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
        pushError("questions", "must be a non-empty array");
        return { ok: errors.length === 0, errors };
    }
    const seenIds = new Set();
    questions.forEach((q, i) => {
        const qPath = `questions[${i}]`;
        if (!isRecord(q)) {
            pushError(qPath, "must be an object");
            return;
        }
        if (!("id" in q)) {
            pushError(`${qPath}.id`, "is required");
        }
        else {
            const idNorm = normalizeText(q.id);
            if (!idNorm) {
                pushError(`${qPath}.id`, "must be a string or number");
            }
            else if (seenIds.has(idNorm)) {
                pushError(`${qPath}.id`, "must be unique within lesson");
            }
            else {
                seenIds.add(idNorm);
            }
        }
        if (!isNonEmptyString(q.question)) {
            pushError(`${qPath}.question`, "is required");
        }
        if (!isNonEmptyString(q.prompt)) {
            pushError(`${qPath}.prompt`, "is required");
        }
        const answerNorm = normalizeText(q.answer);
        if (!answerNorm) {
            pushError(`${qPath}.answer`, "is required");
        }
        const taskTypeRaw = typeof q.taskType === "string" ? q.taskType.trim().toLowerCase() : "";
        if (q.taskType !== undefined && !isValidTaskType(taskTypeRaw)) {
            pushError(`${qPath}.taskType`, "must be \"typing\" or \"speaking\"");
        }
        if (q.promptStyle !== undefined && !isValidPromptStyle(q.promptStyle)) {
            pushError(`${qPath}.promptStyle`, "must be a valid promptStyle");
        }
        const expectedInputRaw = typeof q.expectedInput === "string" ? q.expectedInput.trim().toLowerCase() : "";
        if (q.expectedInput !== undefined && !isValidExpectedInput(expectedInputRaw)) {
            pushError(`${qPath}.expectedInput`, "must be \"sentence\" or \"blank\"");
        }
        if (expectedInputRaw === "blank") {
            const promptValue = typeof q.prompt === "string" ? q.prompt : "";
            if (!promptValue.includes("___")) {
                pushError(`${qPath}.prompt`, "must include ___ for blank questions");
            }
            const blankAnswers = q.blankAnswers;
            if (!Array.isArray(blankAnswers)) {
                pushError(`${qPath}.blankAnswers`, "is required for blank questions");
            }
            else {
                const cleaned = blankAnswers
                    .filter((b) => isNonEmptyString(b))
                    .map((b) => b.trim());
                if (cleaned.length === 0) {
                    pushError(`${qPath}.blankAnswers`, "must contain at least one answer");
                }
                const hasInvalid = blankAnswers.some((b) => !isNonEmptyString(b));
                if (hasInvalid) {
                    pushError(`${qPath}.blankAnswers`, "must contain only non-empty strings");
                }
                for (const entry of cleaned) {
                    if (entry.length > 20) {
                        pushError(`${qPath}.blankAnswers`, "must be 20 characters or less");
                    }
                    if (entry.includes("___")) {
                        pushError(`${qPath}.blankAnswers`, "must not include ___");
                    }
                }
            }
        }
        if (!isNonEmptyString(q.conceptTag)) {
            pushError(`${qPath}.conceptTag`, "is required");
        }
        const accepted = q.acceptedAnswers;
        if (!Array.isArray(accepted)) {
            pushError(`${qPath}.acceptedAnswers`, "is required and must be an array of strings");
        }
        else {
            const cleaned = [];
            let hasInvalid = false;
            for (const entry of accepted) {
                if (!isNonEmptyString(entry)) {
                    hasInvalid = true;
                    continue;
                }
                cleaned.push(entry);
            }
            if (cleaned.length === 0) {
                pushError(`${qPath}.acceptedAnswers`, "must contain at least one answer");
            }
            if (hasInvalid) {
                pushError(`${qPath}.acceptedAnswers`, "must contain only non-empty strings");
            }
            const normalized = cleaned.map((x) => normalizeText(x));
            const unique = new Set(normalized);
            if (unique.size !== normalized.length) {
                pushError(`${qPath}.acceptedAnswers`, "must not contain duplicates (case-insensitive)");
            }
            if (answerNorm && normalized.length > 0 && !unique.has(answerNorm)) {
                pushError(`${qPath}.acceptedAnswers`, "must include answer");
            }
        }
        if ("hints" in q && q.hints !== undefined) {
            const hints = q.hints;
            if (!Array.isArray(hints)) {
                pushError(`${qPath}.hints`, "must be an array of strings");
            }
            else {
                const hasInvalid = hints.some((h) => !isNonEmptyString(h));
                if (hasInvalid) {
                    pushError(`${qPath}.hints`, "must contain only non-empty strings");
                }
            }
        }
        if ("hint" in q && q.hint !== undefined && !isNonEmptyString(q.hint)) {
            pushError(`${qPath}.hint`, "must be a non-empty string");
        }
        if (q.hint && Array.isArray(q.hints)) {
            pushError(`${qPath}`, "must not include both hint and hints");
        }
        if ("hintTarget" in q && q.hintTarget !== undefined) {
            if (!isNonEmptyString(q.hintTarget)) {
                pushError(`${qPath}.hintTarget`, "must be a non-empty string");
            }
        }
        if ("explanationTarget" in q && q.explanationTarget !== undefined) {
            if (!isNonEmptyString(q.explanationTarget)) {
                pushError(`${qPath}.explanationTarget`, "must be a non-empty string");
            }
        }
        const taskType = taskTypeRaw === "speaking" ? "speaking" : "typing";
        const rawAnswer = typeof q.answer === "string" || typeof q.answer === "number"
            ? String(q.answer)
            : "";
        const hasPlaceholder = /\[[^\]]+\]/.test(rawAnswer);
        const answerLeakNorm = normalizeForLeakCheck(rawAnswer);
        const promptLeakNorm = normalizeForLeakCheck(q.prompt);
        if (taskType !== "speaking" &&
            !hasPlaceholder &&
            answerLeakNorm &&
            answerLeakNorm.length > 3 &&
            promptLeakNorm &&
            promptLeakNorm.includes(answerLeakNorm)) {
            pushError(`${qPath}.prompt`, "must not include the answer for typing tasks");
        }
    });
    return { ok: errors.length === 0, errors };
}
