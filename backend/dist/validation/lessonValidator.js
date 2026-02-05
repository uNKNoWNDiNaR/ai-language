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
        const answerNorm = normalizeText(q.answer);
        if (!answerNorm) {
            pushError(`${qPath}.answer`, "is required");
        }
        if (!isNonEmptyString(q.conceptTag)) {
            pushError(`${qPath}.conceptTag`, "is required");
        }
        if ("acceptedAnswers" in q && q.acceptedAnswers !== undefined) {
            const accepted = q.acceptedAnswers;
            if (!Array.isArray(accepted)) {
                pushError(`${qPath}.acceptedAnswers`, "must be an array of strings");
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
    });
    return { ok: errors.length === 0, errors };
}
