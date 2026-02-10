// backend/src/services/supportLevelService.ts

import mongoose from "mongoose";
import { LearnerProfileModel } from "../state/learnerProfileState";
import type { SupportedLanguage } from "../types";

export type SupportStats = {
  wrongCount: number;
  almostCount: number;
  forcedAdvanceCount: number;
  hintsUsedCount: number;
};

const DEFAULT_SUPPORT_LEVEL = 0.85;

function clampLevel(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeLevel(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SUPPORT_LEVEL;
  return clampLevel(n);
}

export function computeSupportLevelDelta(
  stats: SupportStats,
  _currentSupportLevel: number,
): number {
  const wrongCount = Number.isFinite(stats.wrongCount) ? stats.wrongCount : 0;
  const almostCount = Number.isFinite(stats.almostCount) ? stats.almostCount : 0;
  const hintsUsedCount = Number.isFinite(stats.hintsUsedCount) ? stats.hintsUsedCount : 0;
  const forcedAdvanceCount = Number.isFinite(stats.forcedAdvanceCount) ? stats.forcedAdvanceCount : 0;

  const mistakeCount = wrongCount + almostCount;

  const wrongLow = mistakeCount <= 1;
  const hintsLow = hintsUsedCount <= 1;

  const wrongHigh = mistakeCount >= 3;
  const hintsHigh = hintsUsedCount >= 2;

  if (forcedAdvanceCount === 0 && wrongLow && hintsLow) {
    return -0.05;
  }

  if (forcedAdvanceCount > 0 || wrongHigh || hintsHigh) {
    return 0.05;
  }

  return 0;
}

export async function updateSupportLevel(
  userId: string,
  language: SupportedLanguage,
  delta: number
): Promise<number> {
  // Skip DB writes if not connected (avoid buffering in tests)
  if (mongoose.connection.readyState !== 1) {
    return clampLevel(DEFAULT_SUPPORT_LEVEL + delta);
  }

  const doc = (await LearnerProfileModel.findOne(
    { userId, language },
    { supportLevel: 1, supportMode: 1 }
  ).lean()) as Record<string, unknown> | null;

  const current = normalizeLevel(doc?.supportLevel);
  const supportMode = doc?.supportMode === "manual" ? "manual" : "auto";

  if (supportMode === "manual") {
    return current;
  }

  const next = clampLevel(current + delta);

  await LearnerProfileModel.updateOne(
    { userId, language },
    {
      $setOnInsert: { userId, language },
      $set: { supportLevel: next, supportMode, lastActiveAt: new Date() },
    },
    { upsert: true }
  );

  return next;
}
