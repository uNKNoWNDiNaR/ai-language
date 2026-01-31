// backend/src/middleware/__tests__/auth.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authMiddleware } from "../auth";

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function makeReq(headers: Record<string, string | undefined>) {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") normalized[k.toLowerCase()] = v;
  }
  return {
    headers: normalized,
    get(name: string) {
      return normalized[name.toLowerCase()];
    },
  } as any;
}

describe("authMiddleware", () => {
  const original = process.env.AUTH_TOKEN;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_TOKEN;
    else process.env.AUTH_TOKEN = original;
  });

  it("allows all requests when AUTH_TOKEN is not set", () => {
    delete process.env.AUTH_TOKEN;

    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when AUTH_TOKEN is set and no token provided", () => {
    process.env.AUTH_TOKEN = "dev-secret";

    const req = makeReq({});
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token is wrong", () => {
    process.env.AUTH_TOKEN = "dev-secret";

    const req = makeReq({ authorization: "Bearer wrong" });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when bearer token is correct", () => {
    process.env.AUTH_TOKEN = "dev-secret";

    const req = makeReq({ authorization: "Bearer dev-secret" });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts x-auth-token header as fallback", () => {
    process.env.AUTH_TOKEN = "dev-secret";

    const req = makeReq({ "x-auth-token": "dev-secret" });
    const res = makeRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
