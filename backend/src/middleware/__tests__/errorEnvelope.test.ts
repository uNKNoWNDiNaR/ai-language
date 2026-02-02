//backend/src/middleware/__tests__/errorEnvelope.test.ts

import { describe, it, expect, vi } from "vitest";
import { errorEnvelopeMiddleware } from "../errorEnvelope";

describe("errorEnvelopeMiddleware", () => {
  it("adds requestId to error payloads", () => {
    const req: any = {};
    const res: any = { locals: { requestId: "rid-test" } };

    const originalJson = vi.fn(() => res);
    res.json = originalJson;

    const next = vi.fn();
    errorEnvelopeMiddleware(req, res, next);

    res.json({ error: "Unauthorized" });

    expect(originalJson).toHaveBeenCalledWith({ error: "Unauthorized", requestId: "rid-test" });
    expect(next).toHaveBeenCalled();
  });

  it("does not touch non-error payloads", () => {
    const req: any = {};
    const res: any = { locals: { requestId: "rid-test" } };

    const originalJson = vi.fn(() => res);
    res.json = originalJson;

    errorEnvelopeMiddleware(req, res, () => {});
    res.json({ ok: true });

    expect(originalJson).toHaveBeenCalledWith({ ok: true });
  });
});
