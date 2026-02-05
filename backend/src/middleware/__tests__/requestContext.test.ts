//backend/src/middleware/__tests__/requestContext.test.ts

import { describe, it, expect, vi } from "vitest";
import { requestContext } from "../requestContext";

function makeReq(headers: Record<string, string | undefined>) {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") normalized[k.toLowerCase()] = v;
  }
  return {
    method: "GET",
    path: "/health",
    baseUrl: "",
    route: { path: "/health" },
    ip: "127.0.0.1",
    get(name: string) {
      return normalized[name.toLowerCase()];
    },
  } as any;
}

function makeRes() {
  const handlers: Record<string, Function> = {};
  const res: any = { locals: {}, statusCode: 200 };
  res.setHeader = vi.fn();
  res.on = vi.fn((evt: string, fn: Function) => {
    handlers[evt] = fn;
  });
  res.__handlers = handlers;
  return res;
}

describe("requestContextMiddleware", () => {
  it("uses incoming x-request-id when valid", () => {
    const req = makeReq({ "x-request-id": "abc_123" });
    const res = makeRes();
    const next = vi.fn();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    requestContext(req, res, next);

    expect(res.locals.requestId).toBe("abc_123");
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "abc_123");
    expect(next).toHaveBeenCalled();

    res.__handlers.finish?.();
    logSpy.mockRestore();
  });

  it("generates a request id when missing", () => {
    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    requestContext(req, res, next);

    expect(typeof res.locals.requestId).toBe("string");
    expect(res.locals.requestId.length).toBeGreaterThan(10);
    expect(next).toHaveBeenCalled();

    res.__handlers.finish?.();
    logSpy.mockRestore();
  });
});
