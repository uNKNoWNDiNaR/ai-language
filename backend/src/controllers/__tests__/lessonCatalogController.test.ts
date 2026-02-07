// backend/src/controllers/__tests__/lessonCatalogController.test.ts

import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const readdirSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());

vi.mock("fs", () => ({
  readdirSync: readdirSyncMock,
  readFileSync: readFileSyncMock,
  existsSync: existsSyncMock,
}));

function makeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("lessonCatalogController", () => {
  it("returns ordered lessons from src fallback", async () => {
    existsSyncMock.mockImplementation((p: string) => String(p).includes("src/lessons/en"));
    readdirSyncMock.mockReturnValue(["basic-2.json", "basic-1.json"]);
    readFileSyncMock.mockImplementation((p: string) => {
      if (String(p).includes("basic-1")) {
        return JSON.stringify({
          lessonId: "basic-1",
          title: "Basics 1",
          description: "Intro",
          questions: [{}, {}, {}],
        });
      }
      return JSON.stringify({
        lessonId: "basic-2",
        title: "Basics 2",
        description: "Next",
        questions: [{}, {}],
      });
    });

    const { getLessonCatalog } = await import("../lessonCatalogController");
    const req = { query: { language: "en" } } as unknown as Request;
    const res = makeRes();

    await getLessonCatalog(req, res);
    const payload = (res.json as any).mock.calls[0][0];

    expect(payload.lessons).toHaveLength(2);
    expect(payload.lessons[0].lessonId).toBe("basic-1");
    expect(payload.lessons[1].lessonId).toBe("basic-2");
  });

  it("returns 400 for invalid language", async () => {
    const { getLessonCatalog } = await import("../lessonCatalogController");
    const req = { query: { language: "xx" } } as unknown as Request;
    const res = makeRes();

    await getLessonCatalog(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
