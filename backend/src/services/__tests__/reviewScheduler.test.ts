// backend/src/services/__tests__/reviewScheduler.test.ts

import { describe, expect, it } from "vitest";
import { pickSuggestedReviewItems } from "../reviewScheduler";

describe("pickSuggestedReviewItems", () => {
  it("orders deterministically when scores tie", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");

    const items = pickSuggestedReviewItems(
      [
        {
          lessonId: "basic-1",
          questionId: "2",
          conceptTag: "word_order",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.5,
        },
        {
          lessonId: "basic-1",
          questionId: "1",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.5,
        },
      ],
      now,
      2
    );

    expect(items).toHaveLength(2);
    expect(items[0].conceptTag).toBe("articles");
    expect(items[1].conceptTag).toBe("word_order");
  });

  it("prioritizes older items when mistakes/confidence are equal", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");

    const items = pickSuggestedReviewItems(
      [
        {
          lessonId: "basic-1",
          questionId: "1",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-31T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.5,
        },
        {
          lessonId: "basic-1",
          questionId: "2",
          conceptTag: "word_order",
          lastSeenAt: new Date("2026-01-10T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.5,
        },
      ],
      now,
      2
    );

    expect(items[0].conceptTag).toBe("word_order");
  });

  it("prioritizes lower confidence when mistakes/time are equal", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");

    const items = pickSuggestedReviewItems(
      [
        {
          lessonId: "basic-1",
          questionId: "1",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.8,
        },
        {
          lessonId: "basic-1",
          questionId: "2",
          conceptTag: "word_order",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          mistakeCount: 2,
          confidence: 0.2,
        },
      ],
      now,
      2
    );

    expect(items[0].conceptTag).toBe("word_order");
  });

  it("skips items within the review cooldown window", () => {
    const now = new Date("2026-02-01T10:00:00.000Z");

    const items = pickSuggestedReviewItems(
      [
        {
          lessonId: "basic-1",
          questionId: "1",
          conceptTag: "articles",
          lastSeenAt: new Date("2026-01-20T10:00:00.000Z"),
          lastReviewedAt: new Date("2026-02-01T05:00:00.000Z"),
          mistakeCount: 3,
          confidence: 0.4,
        },
      ],
      now,
      2
    );

    expect(items).toHaveLength(0);
  });
});
