import type { LessonCatalogItem, SupportedLanguage } from "../../api/lessonAPI";

type LessonSetupPanelProps = {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  lessons?: LessonCatalogItem[];
  onLessonChange?: (lessonId: string) => void;
  disabled?: boolean;
};

export function LessonSetupPanel({
  userId,
  language,
  lessonId,
  lessons = [],
  onLessonChange,
  disabled = false,
}: LessonSetupPanelProps) {
  const trimmedUserId = userId.trim() || "user-1";
  const trimmedLessonId = lessonId.trim() || "basic-1";

  const languageLabel = (() => {
    switch (language) {
      case "de":
        return "German";
      case "es":
        return "Spanish";
      case "fr":
        return "French";
      case "en":
      default:
        return "English";
    }
  })();

  const languageFlag = (() => {
    switch (language) {
      case "de":
        return "🇩🇪";
      case "es":
        return "🇪🇸";
      case "fr":
        return "🇫🇷";
      case "en":
      default:
        return "🇺🇸";
    }
  })();

  return (
    <div className="lessonInfoGroup">
      <div className="lessonInfoPill" aria-label="Profile" aria-readonly="true">
        <span className="lessonInfoIcon" aria-hidden="true">
          👤
        </span>
        <span className="lessonInfoText">{trimmedUserId}</span>
      </div>

      <div className="lessonInfoPill" aria-label="Language" aria-readonly="true">
        <span className="lessonInfoIcon" aria-hidden="true">
          {languageFlag}
        </span>
        <span className="lessonInfoText">{languageLabel}</span>
      </div>

      <div className="lessonInfoPill" aria-label="Lesson" aria-readonly="true">
        <span className="lessonInfoIcon" aria-hidden="true">
          📘
        </span>
        {lessons.length > 0 && onLessonChange ? (
          <select
            className="lessonSelect"
            value={trimmedLessonId}
            onChange={(e) => onLessonChange(e.target.value)}
            disabled={disabled}
            aria-label="Lesson"
          >
            {lessons.map((lesson) => (
              <option key={lesson.lessonId} value={lesson.lessonId}>
                {lesson.title || lesson.lessonId}
              </option>
            ))}
          </select>
        ) : (
          <span className="lessonInfoText">{trimmedLessonId}</span>
        )}
      </div>
    </div>
  );
}
