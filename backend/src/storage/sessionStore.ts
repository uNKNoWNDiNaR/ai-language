// backend/src/storage/sessionStore.ts

import { LessonSession } from "../state/lessonState";
import { LessonSessionModel } from "../state/sessionState";

export async function getSession(
  userId: string,
  language?: string,
  lessonId?: string
): Promise<LessonSession | null> {
  const query: Record<string, string> = { userId };
  if (typeof language === "string" && language.trim()) {
    query.language = language.trim();
  }
  if (typeof lessonId === "string" && lessonId.trim()) {
    query.lessonId = lessonId.trim();
  }
  return await LessonSessionModel.findOne(query, undefined, { sort: { updatedAt: -1 } });
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

  const query: Record<string, string> = { userId: session.userId };
  if (typeof session.language === "string" && session.language.trim()) {
    query.language = session.language.trim();
  }
  if (typeof session.lessonId === "string" && session.lessonId.trim()) {
    query.lessonId = session.lessonId.trim();
  }
  await LessonSessionModel.updateOne(query, session);
}

export async function deleteSession(userId: string, language?: string): Promise<void> {
  const query: Record<string, string> = { userId };
  if (typeof language === "string" && language.trim()) {
    query.language = language.trim();
  }
  await LessonSessionModel.deleteOne(query);
}
