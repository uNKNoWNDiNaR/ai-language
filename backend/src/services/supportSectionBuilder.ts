import type { SupportedLanguage } from "../types";
import { getPackEntry, type PackEntry } from "../content/instructionPacks/index";
import { fallbackSupportHint } from "../utils/supportLevel";

export type SupportSectionStyle = "il_only" | "mixed" | "tl_only";
export type ExplanationDepth = "short" | "normal" | "detailed";

export type SupportSectionInput = {
  lessonLanguage: SupportedLanguage;
  instructionLanguage?: SupportedLanguage;
  supportLanguageStyle: SupportSectionStyle;
  maxSupportBullets: number;
  explanationDepth: ExplanationDepth;
  eventType?: string;
  conceptTag?: string;
  hintTarget?: string;
  explanationTarget?: string;
  hintSupport?: string;
  explanationSupport?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = clean(line);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function trimToFirstSentence(value: string): string {
  const text = toSingleLine(clean(value));
  if (!text) return "";
  const match = text.match(/^[^.!?]+[.!?](?=\s|$)/);
  return match ? match[0].trim() : text;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/u, "").trim();
}

function isHintEvent(eventType: string): boolean {
  return eventType.startsWith("HINT_");
}

function isExplainEvent(eventType: string): boolean {
  return (
    eventType === "FORCED_ADVANCE" ||
    eventType === "EXPLAIN" ||
    eventType === "USER_CONFUSED" ||
    eventType === "USER_REQUESTED_EXPLAIN"
  );
}

function collectPackLines(entry: PackEntry | null, eventType: string): string[] {
  if (!entry) return [];
  const type = eventType.toUpperCase();
  const hint1 = clean(entry.hint?.[0]);
  const hint2 = clean(entry.hint?.[1]);
  const explanation = clean(entry.explanation);
  const summary = clean(entry.summary);
  const wrong = clean(entry.feedbackWrong);
  const almost = clean(entry.feedbackAlmost);

  if (type === "WRONG_FEEDBACK") {
    return unique([wrong, explanation, hint1, summary, hint2]);
  }
  if (type === "ALMOST_FEEDBACK") {
    return unique([almost, explanation, hint1, summary, hint2]);
  }
  if (type === "CORRECT_FEEDBACK") {
    return unique([summary, explanation, hint1, hint2]);
  }
  if (isHintEvent(type)) {
    return unique([hint1, hint2, explanation, summary]);
  }
  if (isExplainEvent(type) || type === "INTRO_NEW_CONCEPT") {
    return unique([explanation, summary, hint1, hint2]);
  }
  if (type === "SESSION_START" || type === "SESSION_SUMMARY") {
    return unique([summary, explanation, hint1, hint2]);
  }
  return unique([explanation, summary, hint1, hint2]);
}

function collectTargetLines(args: {
  hintTarget?: string;
  explanationTarget?: string;
  hintSupport?: string;
  explanationSupport?: string;
}): string[] {
  return unique([
    clean(args.hintTarget),
    clean(args.explanationTarget),
    clean(args.hintSupport),
    clean(args.explanationSupport),
  ]);
}

function desiredBulletCount(depth: ExplanationDepth, maxSupportBullets: number): number {
  if (maxSupportBullets <= 0) return 0;
  if (depth === "short") return 1;
  if (depth === "detailed") return Math.min(maxSupportBullets, 3);
  return Math.min(maxSupportBullets, 2);
}

function findExampleCandidate(lines: string[]): string | "" {
  return (
    lines.find((line) => /[:“”"']/u.test(line) || /\buse\b/i.test(line)) || ""
  );
}

function buildSingleLanguageBullets(args: {
  language: SupportedLanguage;
  candidates: string[];
  depth: ExplanationDepth;
  maxSupportBullets: number;
}): string[] {
  const desired = desiredBulletCount(args.depth, args.maxSupportBullets);
  if (desired <= 0) return [];

  const candidates = unique(args.candidates);
  const bullets: string[] = [];
  for (const line of candidates) {
    if (bullets.length >= desired) break;
    const trimmed = trimToFirstSentence(line);
    if (trimmed) bullets.push(trimmed);
  }

  if (args.depth === "detailed" && bullets.length < desired) {
    const example = findExampleCandidate(candidates);
    if (example && !bullets.includes(example)) bullets.push(example);
  }

  while (bullets.length < desired) {
    const fallback = trimToFirstSentence(fallbackSupportHint(args.language));
    if (fallback && !bullets.includes(fallback)) {
      bullets.push(fallback);
    } else {
      break;
    }
  }

  return bullets.slice(0, desired);
}

function buildMixedBullets(args: {
  lessonLanguage: SupportedLanguage;
  instructionLanguage: SupportedLanguage;
  tlCandidates: string[];
  ilCandidates: string[];
  depth: ExplanationDepth;
  maxSupportBullets: number;
}): string[] {
  const desired = desiredBulletCount(args.depth, args.maxSupportBullets);
  if (desired <= 0) return [];

  const tlLines = unique(args.tlCandidates);
  const ilLines = unique(args.ilCandidates);

  const tlFallback = fallbackSupportHint(args.lessonLanguage);
  const ilFallback = fallbackSupportHint(args.instructionLanguage);

  const tlPool = tlLines.length ? tlLines : [tlFallback];
  const ilPool = ilLines.length ? ilLines : [ilFallback];

  if (desired === 1) {
    const il = trimToFirstSentence(ilPool[0] ?? "");
    const tl = trimToFirstSentence(tlPool[0] ?? "");
    const chosen = il || tl;
    return chosen ? [chosen] : [];
  }

  const bullets: string[] = [];
  for (let i = 0; i < desired; i += 1) {
    const tlRaw = tlPool[i % tlPool.length];
    const ilRaw = ilPool[i % ilPool.length];
    const tl = stripTrailingPunctuation(trimToFirstSentence(tlRaw));
    const il = stripTrailingPunctuation(trimToFirstSentence(ilRaw));
    if (tl && il) {
      bullets.push(`${tl} — ${il}`.trim());
    } else if (tl) {
      bullets.push(tl);
    } else if (il) {
      bullets.push(il);
    }
  }

  return bullets;
}

export function buildSupportSection(input: SupportSectionInput): string {
  const eventType = String(input.eventType || "UNSPECIFIED").trim().toUpperCase();
  const conceptTag = clean(input.conceptTag);

  const tlEntry = conceptTag ? getPackEntry(input.lessonLanguage, conceptTag) : null;
  const ilEntry =
    input.instructionLanguage && conceptTag
      ? getPackEntry(input.instructionLanguage, conceptTag)
      : null;

  const tlCandidates = unique([
    ...collectTargetLines({
      hintTarget: input.hintTarget,
      explanationTarget: input.explanationTarget,
    }),
    ...collectPackLines(tlEntry, eventType),
  ]);

  const ilCandidatesRaw = unique([
    ...collectTargetLines({
      hintSupport: input.hintSupport,
      explanationSupport: input.explanationSupport,
    }),
    ...collectPackLines(ilEntry, eventType),
  ]);
  const ilCandidates = ilCandidatesRaw.length > 0 ? ilCandidatesRaw : tlCandidates;

  let bullets: string[] = [];
  if (input.supportLanguageStyle === "mixed" && input.instructionLanguage) {
    bullets = buildMixedBullets({
      lessonLanguage: input.lessonLanguage,
      instructionLanguage: input.instructionLanguage,
      tlCandidates,
      ilCandidates,
      depth: input.explanationDepth,
      maxSupportBullets: input.maxSupportBullets,
    });
  } else {
    const language =
      input.supportLanguageStyle === "il_only" && input.instructionLanguage
        ? input.instructionLanguage
        : input.lessonLanguage;
    const candidates =
      input.supportLanguageStyle === "il_only" ? ilCandidates : tlCandidates;

    bullets = buildSingleLanguageBullets({
      language,
      candidates,
      depth: input.explanationDepth,
      maxSupportBullets: input.maxSupportBullets,
    });
  }

  if (!bullets.length) return "";
  if (bullets.length === 1) return toSingleLine(bullets[0]);

  return bullets.map((line) => `- ${toSingleLine(line)}`).join("\n");
}
