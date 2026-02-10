// backend/src/validation/lessonValidator.ts

type ValidationResult = { ok: boolean; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim().toLowerCase();
  return "";
}

function normalizeForLeakCheck(value: unknown): string {
  const raw =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[.,?!'"’"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidTaskType(value: unknown): value is "typing" | "speaking" {
  return value === "typing" || value === "speaking";
}

function isValidExpectedInput(value: unknown): value is "sentence" | "blank" {
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

function isValidPromptStyle(value: unknown): value is string {
  return typeof value === "string" && PROMPT_STYLES.has(value);
}

export function validateLessonJson(input: unknown, sourcePath: string): ValidationResult {
  const errors: string[] = [];

  const pushError = (path: string, message: string) => {
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
  } else if (typeof input.description !== "string") {
    pushError("description", "must be a string");
  }

  const questions = (input as any).questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    pushError("questions", "must be a non-empty array");
    return { ok: errors.length === 0, errors };
  }

  const seenIds = new Set<string>();

  questions.forEach((q, i) => {
    const qPath = `questions[${i}]`;

    if (!isRecord(q)) {
      pushError(qPath, "must be an object");
      return;
    }

    if (!("id" in q)) {
      pushError(`${qPath}.id`, "is required");
    } else {
      const idNorm = normalizeText((q as any).id);
      if (!idNorm) {
        pushError(`${qPath}.id`, "must be a string or number");
      } else if (seenIds.has(idNorm)) {
        pushError(`${qPath}.id`, "must be unique within lesson");
      } else {
        seenIds.add(idNorm);
      }
    }

    if (!isNonEmptyString((q as any).question)) {
      pushError(`${qPath}.question`, "is required");
    }

    if (!isNonEmptyString((q as any).prompt)) {
      pushError(`${qPath}.prompt`, "is required");
    }

    const answerNorm = normalizeText((q as any).answer);
    if (!answerNorm) {
      pushError(`${qPath}.answer`, "is required");
    }

    const taskTypeRaw = typeof (q as any).taskType === "string" ? (q as any).taskType.trim().toLowerCase() : "";
    if ((q as any).taskType !== undefined && !isValidTaskType(taskTypeRaw)) {
      pushError(`${qPath}.taskType`, "must be \"typing\" or \"speaking\"");
    }

    if ((q as any).promptStyle !== undefined && !isValidPromptStyle((q as any).promptStyle)) {
      pushError(`${qPath}.promptStyle`, "must be a valid promptStyle");
    }

    const expectedInputRaw =
      typeof (q as any).expectedInput === "string" ? (q as any).expectedInput.trim().toLowerCase() : "";
    if ((q as any).expectedInput !== undefined && !isValidExpectedInput(expectedInputRaw)) {
      pushError(`${qPath}.expectedInput`, "must be \"sentence\" or \"blank\"");
    }

    if (expectedInputRaw === "blank") {
      const promptValue = typeof (q as any).prompt === "string" ? (q as any).prompt : "";
      if (!promptValue.includes("___")) {
        pushError(`${qPath}.prompt`, "must include ___ for blank questions");
      }

      const blankAnswers = (q as any).blankAnswers;
      if (!Array.isArray(blankAnswers)) {
        pushError(`${qPath}.blankAnswers`, "is required for blank questions");
      } else {
        const cleaned = blankAnswers
          .filter((b: unknown) => isNonEmptyString(b))
          .map((b: string) => b.trim());
        if (cleaned.length === 0) {
          pushError(`${qPath}.blankAnswers`, "must contain at least one answer");
        }
        const hasInvalid = blankAnswers.some((b: unknown) => !isNonEmptyString(b));
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

    if (!isNonEmptyString((q as any).conceptTag)) {
      pushError(`${qPath}.conceptTag`, "is required");
    }

    const accepted = (q as any).acceptedAnswers;
    if (!Array.isArray(accepted)) {
      pushError(`${qPath}.acceptedAnswers`, "is required and must be an array of strings");
    } else {
      const cleaned: string[] = [];
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

    if ("hints" in q && (q as any).hints !== undefined) {
      const hints = (q as any).hints;
      if (!Array.isArray(hints)) {
        pushError(`${qPath}.hints`, "must be an array of strings");
      } else {
        const hasInvalid = hints.some((h: unknown) => !isNonEmptyString(h));
        if (hasInvalid) {
          pushError(`${qPath}.hints`, "must contain only non-empty strings");
        }
      }
    }

    if ("hint" in q && (q as any).hint !== undefined && !isNonEmptyString((q as any).hint)) {
      pushError(`${qPath}.hint`, "must be a non-empty string");
    }

    if ((q as any).hint && Array.isArray((q as any).hints)) {
      pushError(`${qPath}`, "must not include both hint and hints");
    }

    if ("hintTarget" in q && (q as any).hintTarget !== undefined) {
      if (!isNonEmptyString((q as any).hintTarget)) {
        pushError(`${qPath}.hintTarget`, "must be a non-empty string");
      }
    }

    if ("explanationTarget" in q && (q as any).explanationTarget !== undefined) {
      if (!isNonEmptyString((q as any).explanationTarget)) {
        pushError(`${qPath}.explanationTarget`, "must be a non-empty string");
      }
    }

    const taskType = taskTypeRaw === "speaking" ? "speaking" : "typing";
    const rawAnswer = typeof (q as any).answer === "string" || typeof (q as any).answer === "number"
      ? String((q as any).answer)
      : "";
    const hasPlaceholder = /\[[^\]]+\]/.test(rawAnswer);
    const answerLeakNorm = normalizeForLeakCheck(rawAnswer);
    const promptLeakNorm = normalizeForLeakCheck((q as any).prompt);

    if (
      taskType !== "speaking" &&
      !hasPlaceholder &&
      answerLeakNorm &&
      answerLeakNorm.length > 3 &&
      promptLeakNorm &&
      promptLeakNorm.includes(answerLeakNorm)
    ) {
      pushError(`${qPath}.prompt`, "must not include the answer for typing tasks");
    }
  });

  return { ok: errors.length === 0, errors };
}
