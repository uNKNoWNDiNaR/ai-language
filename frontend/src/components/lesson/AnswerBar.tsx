import type { RefObject } from "react";
import type { UiStrings } from "../../utils/instructionLanguage";

type AnswerBarProps = {
  answer: string;
  onAnswerChange: (value: string) => void;
  answerInputRef: RefObject<HTMLInputElement | null>;
  canSubmitAnswer: boolean;
  onSendAnswer: () => void | Promise<void>;
  sessionActive: boolean;
  loading: boolean;
  practiceActive: boolean;
  lessonCompleted: boolean;
  hideInput?: boolean;
  helperText?: string;
  errorText?: string;
  uiStrings?: UiStrings;
};

export function AnswerBar({
  answer,
  onAnswerChange,
  answerInputRef,
  canSubmitAnswer,
  onSendAnswer,
  sessionActive,
  loading,
  practiceActive,
  lessonCompleted,
  hideInput,
  helperText,
  errorText,
  uiStrings,
}: AnswerBarProps) {
  const startLessonFirst = uiStrings?.startLessonFirst ?? "Start a lesson first...";
  const lessonCompletedMessage =
    uiStrings?.lessonCompletedMessage ?? "Lesson completed - restart or exit.";
  const finishPracticeFirst = uiStrings?.finishPracticeFirst ?? "Finish the practice above first...";
  const answerPlaceholder = uiStrings?.answerPlaceholder ?? "Type your answer...";
  const sendLabel = uiStrings?.sendLabel ?? "Send";
  const inputEnabled = sessionActive && !loading && !practiceActive && !lessonCompleted;
  const inputGlow = "rgba(47, 107, 255, 0.26)";
  const inputFade = "rgba(47, 107, 255, 0.14)";

  return (
    <div style={{ marginTop: 12 }}>
      {helperText && <div className="mb-2 text-sm text-slate-600">{helperText}</div>}
      {errorText && <div className="mb-2 text-sm text-rose-600">{errorText}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: hideInput ? "flex-end" : "flex-start" }}>
        {!hideInput && (
          <input
            ref={answerInputRef}
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
            placeholder={
              !sessionActive
                ? startLessonFirst
                : lessonCompleted
                  ? lessonCompletedMessage
                  : practiceActive
                    ? finishPracticeFirst
                    : answerPlaceholder
            }
            disabled={!sessionActive || loading || practiceActive || lessonCompleted}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 14,
              border: "1px solid var(--border)",
              boxShadow: inputEnabled
                ? `inset 0 0 0 1px ${inputGlow}, inset 0 0 12px ${inputFade}`
                : "none",
              background: "var(--surface)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmitAnswer && !practiceActive) void onSendAnswer();
            }}
          />
        )}
        <button
          onClick={() => void onSendAnswer()}
          disabled={!canSubmitAnswer}
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid",
            borderColor: canSubmitAnswer ? "var(--accent)" : "var(--border)",
            background: canSubmitAnswer ? "var(--accent)" : "var(--surface-muted)",
            color: canSubmitAnswer ? "white" : "var(--text-muted)",
            cursor: canSubmitAnswer ? "pointer" : "not-allowed",
          }}
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
}
