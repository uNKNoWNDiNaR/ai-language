import type { LessonSession, LessonProgressPayload } from "../../api/lessonAPI";
import type { UiStrings } from "../../utils/instructionLanguage";

function prettyLanguage(lang: string | undefined): string {
  switch (lang) {
    case "en":
      return "English";
    case "de":
      return "German";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    default:
      return lang ?? "—";
  }
}

function prettyStatus(s: string | undefined, uiStrings?: UiStrings): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("needs")) return uiStrings?.statusNeedsReview ?? "Needs review";
  if (t.includes("complete")) return uiStrings?.statusCompleted ?? "Completed";
  if (t.includes("progress")) return uiStrings?.statusInProgress ?? "In progress";
  return s ? s.replace(/_/g, " ") : "—";
}

type SessionHeaderProps = {
  session: LessonSession;
  progress: LessonProgressPayload | null;
  loading: boolean;
  lessonTitle?: string;
  lessonDescription?: string;
  onBack: () => void;
  uiStrings?: UiStrings;
};

export function SessionHeader({
  session,
  progress,
  loading,
  lessonTitle,
  lessonDescription,
  onBack,
  uiStrings,
}: SessionHeaderProps) {
  const title = lessonTitle?.trim() || session.lessonId;
  const description = lessonDescription?.trim();
  return (
    <div
      className="fadeIn"
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 13,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          minWidth: 0,
          alignItems: "center",
          flexWrap: "wrap",
          flex: "1 1 220px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "white",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ← {uiStrings?.backLabel ?? "Back"}
        </button>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span className="lessonTitle" style={{ fontWeight: 600 }}>
            {title}
          </span>
          {description && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {description}
            </span>
          )}
        </div>
        <span style={{ opacity: 0.45 }}>•</span>
        <span style={{ opacity: 0.85 }}>{prettyLanguage(session.language)}</span>

        {progress && !loading && (
          <>
            <span style={{ opacity: 0.45 }}>•</span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              Q {progress.currentQuestionIndex + 1}/{progress.totalQuestions}
            </span>
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
          rowGap: 6,
          flex: "1 1 260px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: 999,
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            whiteSpace: "nowrap",
            fontSize: 12,
            opacity: 0.92,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background:
                (progress?.status ?? "").includes("needs")
                  ? "var(--warning)"
                  : (progress?.status ?? "").includes("complete")
                    ? "var(--success)"
                    : "var(--accent)",
              opacity: 0.9,
            }}
          />
          <div>{prettyStatus(progress?.status ?? session.state, uiStrings)}</div>
        </div>

      </div>
    </div>
  );
}
