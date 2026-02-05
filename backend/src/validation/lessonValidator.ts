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

    const answerNorm = normalizeText((q as any).answer);
    if (!answerNorm) {
      pushError(`${qPath}.answer`, "is required");
    }

    if (!isNonEmptyString((q as any).conceptTag)) {
      pushError(`${qPath}.conceptTag`, "is required");
    }

    if ("acceptedAnswers" in q && (q as any).acceptedAnswers !== undefined) {
      const accepted = (q as any).acceptedAnswers;
      if (!Array.isArray(accepted)) {
        pushError(`${qPath}.acceptedAnswers`, "must be an array of strings");
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
  });

  return { ok: errors.length === 0, errors };
}
