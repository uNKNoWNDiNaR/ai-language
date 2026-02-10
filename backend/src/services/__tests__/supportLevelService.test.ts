import { describe, it, expect } from "vitest";
import { computeSupportLevelDelta, updateSupportLevel } from "../supportLevelService";

describe("supportLevelService", () => {
  it("low mistakes and no forced advance decreases support level", () => {
    const delta = computeSupportLevelDelta(
      { wrongCount: 1, almostCount: 0, forcedAdvanceCount: 0, hintsUsedCount: 1 },
      0.85
    );
    expect(delta).toBeCloseTo(-0.05);
  });

  it("forced advance increases support level", () => {
    const delta = computeSupportLevelDelta(
      { wrongCount: 0, almostCount: 0, forcedAdvanceCount: 1, hintsUsedCount: 0 },
      0.5
    );
    expect(delta).toBeCloseTo(0.05);
  });

  it("high wrong count increases support level", () => {
    const delta = computeSupportLevelDelta(
      { wrongCount: 3, almostCount: 1, forcedAdvanceCount: 0, hintsUsedCount: 0 },
      0.5
    );
    expect(delta).toBeCloseTo(0.05);
  });

  it("updateSupportLevel clamps to 0..1 when not connected", async () => {
    const high = await updateSupportLevel("u1", "en", 0.3);
    expect(high).toBeLessThanOrEqual(1);

    const low = await updateSupportLevel("u1", "en", -2);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});
