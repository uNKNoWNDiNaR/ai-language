import { useEffect, useState } from "react";
import type { LessonCatalogItem, SupportedLanguage } from "../../api/lessonAPI";

type LanguageOption = {
  code: SupportedLanguage;
  label: string;
  flag: string;
  disabled?: boolean;
  note?: string;
};

type LessonSetupPanelProps = {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  lessons?: LessonCatalogItem[];
  languages?: LanguageOption[];
  onUserIdChange?: (userId: string) => void;
  onLessonChange?: (lessonId: string) => void;
  onLanguageChange?: (language: SupportedLanguage) => void;
  disabled?: boolean;
};

export function LessonSetupPanel({
  userId,
  language,
  lessonId,
  lessons = [],
  languages = [],
  onUserIdChange,
  onLessonChange,
  onLanguageChange,
  disabled = false,
}: LessonSetupPanelProps) {
  const trimmedUserId = userId.trim();
  const trimmedLessonId = lessonId.trim();
  const [draftUserId, setDraftUserId] = useState(userId);
  const userInputDisabled = disabled || Boolean(trimmedUserId);

  useEffect(() => {
    setDraftUserId(userId);
  }, [userId]);

  const commitUserId = () => {
    if (!onUserIdChange) return;
    const next = draftUserId.trim();
    if (next !== userId) {
      onUserIdChange(next);
    } else if (draftUserId !== userId) {
      setDraftUserId(userId);
    }
  };

  const languageOption =
    languages.find((opt) => opt.code === language) ??
    ({ code: language, label: language.toUpperCase(), flag: "🌐" } as LanguageOption);

  return (
    <div className="lessonInfoGroup">
      <div className="lessonInfoPill" aria-label="Profile">
        <span className="lessonInfoIcon" aria-hidden="true">
          👤
        </span>
        {onUserIdChange ? (
          <input
            className="lessonTextInput"
            value={draftUserId}
            onChange={(e) => setDraftUserId(e.target.value)}
            onBlur={commitUserId}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            placeholder="Enter username"
            disabled={userInputDisabled}
            aria-label="Username"
            autoComplete="username"
          />
        ) : (
          <span className="lessonInfoText">{trimmedUserId}</span>
        )}
      </div>

      <div className="lessonInfoPill" aria-label="Language">
        <span className="lessonInfoIcon" aria-hidden="true">
          {languageOption.flag}
        </span>
        {languages.length > 0 && onLanguageChange ? (
          <select
            className="lessonSelect"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
            disabled={disabled}
            aria-label="Target language"
          >
            {languages.map((option) => (
              <option key={option.code} value={option.code} disabled={option.disabled}>
                {option.note ? `${option.label} (${option.note})` : option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="lessonInfoText">{languageOption.label}</span>
        )}
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
          <span className="lessonInfoText">
            {lessons.length === 0 ? "No lessons yet" : trimmedLessonId || "Select a lesson"}
          </span>
        )}
      </div>
    </div>
  );
}
