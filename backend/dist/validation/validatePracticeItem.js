"use strict";
//backend/src/validation/validatePracticeItem.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePracticeItem = validatePracticeItem;
const SUPPORTED_LANGUAGES = ["en", "de", "es", "fr"];
const SUPPORTED_TYPES = ["variation", "dialogue_turn", "cloze"];
const MAX_EXAMPLES = 6;
const GRADING_CONTAMINATION_PATTERNS = [
    /acceptable answers?/i,
    /grade as/i,
    /should be marked/i,
    /rubric/i,
    /correct if/i,
    /mark as correct/i,
    /evaluation/i,
];
function isRecord(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}
function hasGradingContamination(text) {
    return GRADING_CONTAMINATION_PATTERNS.some((re) => re.test(text));
}
function validatePracticeItem(input) {
    const errors = [];
    if (!isRecord(input)) {
        return { ok: false, errors: ["Practice item must be an object"] };
    }
    const practiceId = input.practiceId;
    const lessonId = input.lessonId;
    const language = input.language;
    const prompt = input.prompt;
    const expectedAnswerRaw = input.expectedAnswerRaw;
    const examples = input.examples;
    const hint = input.hint;
    const hints = input.hints;
    const meta = input.meta;
    if (!isNonEmptyString(practiceId))
        errors.push("Practice Id is required");
    if (!isNonEmptyString(lessonId))
        errors.push("lessonId is required");
    if (!isNonEmptyString(language)) {
        errors.push("Language is required");
    }
    else if (!SUPPORTED_LANGUAGES.includes(language)) {
        errors.push(`language '${language}' is not Supported`);
    }
    if (!isNonEmptyString(prompt))
        errors.push("prompt is required");
    if (!isNonEmptyString(expectedAnswerRaw)) {
        errors.push("expectedAnswerRaw is required");
    }
    else if (hasGradingContamination(expectedAnswerRaw)) {
        errors.push("expectedAnswerRaw contains grading/rubric contamination");
    }
    if (!isRecord(meta)) {
        errors.push("meta is required");
    }
    else {
        const metaType = meta.type;
        const conceptTag = meta.conceptTag;
        if (!isNonEmptyString(metaType)) {
            errors.push("meta.type is required");
        }
        else if (!SUPPORTED_TYPES.includes(metaType)) {
            errors.push(`meta.type '${metaType}' is not supported`);
        }
        if (!isNonEmptyString(conceptTag)) {
            errors.push("meta.conceptTag is required");
        }
    }
    if (examples !== undefined) {
        if (!Array.isArray(examples)) {
            errors.push("example must be an array of strings if provided");
        }
        else {
            const cleaned = examples.map((x) => (typeof x === "string" ? x.trim() : ""));
            const anyInvalid = cleaned.some((x) => x.length === 0);
            if (anyInvalid)
                errors.push("examples may not contain empty strings");
            if (examples.length > MAX_EXAMPLES)
                errors.push(`examples must be at most ${MAX_EXAMPLES}`);
        }
    }
    if (hint !== undefined && typeof hint !== "string") {
        errors.push("hint must be a string if provided");
    }
    if (hints !== undefined) {
        if (!Array.isArray(hints)) {
            errors.push("hints must be an array of strings if provided");
        }
        else {
            const cleaned = hints.map((x) => (typeof x === "string" ? x.trim() : ""));
            const anyInvalid = cleaned.some((x) => x.length === 0);
            if (anyInvalid)
                errors.push("hints may not contain empty strings");
        }
    }
    if (errors.length > 0)
        return { ok: false, errors };
    return { ok: true, value: input };
}
