import { describe, expect, it } from "vitest";
import { computeNextReviewDueAt, pickDueReviewQueueItems, type ReviewQueueItem } from "../reviewScheduler";

describe("reviewQueueScheduler", () => {
  it("returns only due items and caps to 5", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");
    const due = new Date("2026-02-01T09:00:00.000Z");
    const later = new Date("2026-02-03T09:00:00.000Z");

    const items: ReviewQueueItem[] = Array.from({ length: 7 }).map((_, idx) => ({
      id: `id-${idx}`,
      lessonId: "basic-1",
      conceptTag: "articles",
      prompt: "Prompt",
      expected: "Answer",
      createdAt: now,
      dueAt: idx < 6 ? due : later,
      attempts: 0,
    }));

    const result = pickDueReviewQueueItems(items, now, 5);
    expect(result).toHaveLength(5);
    expect(result.every((i) => i.dueAt.getTime() <= now.getTime())).toBe(true);
  });

  it("computes deterministic due dates", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");
    const d1 = computeNextReviewDueAt(1, "correct", now);
    const d2 = computeNextReviewDueAt(2, "correct", now);
    const d3 = computeNextReviewDueAt(3, "correct", now);
    const dw = computeNextReviewDueAt(1, "wrong", now);

    expect(d1.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
    expect(d2.getTime()).toBe(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(d3.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(dw.getTime()).toBe(now.getTime());
  });
});
