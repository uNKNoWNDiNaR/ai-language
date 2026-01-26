// backend/src/storage/sessionStore.ts

import { LessonSession } from "../state/lessonState";
import { LessonSessionModel } from "../state/sessionState";

export async function getSession(userId: string): Promise<LessonSession | null> {
  return await LessonSessionModel.findOne({ userId });
}

export async function createSession(session: LessonSession): Promise<void> {
  await LessonSessionModel.create(session);
}

export async function updateSession(session: LessonSession): Promise<void> {
  // If it's a mongoose document, save it (best for Map fields)
  const anySession: any = session as any;
  if (anySession && typeof anySession.save === "function") {
    await anySession.save();
    return;
  }

  await LessonSessionModel.updateOne({ userId: session.userId }, session);
}

export async function deleteSession(userId: string): Promise<void> {
  await LessonSessionModel.deleteOne({ userId });
}
