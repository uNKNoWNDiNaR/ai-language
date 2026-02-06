import type { RefObject } from "react";

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
}: AnswerBarProps) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      <input
        ref={answerInputRef}
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder={
          !sessionActive
            ? "Start a lesson first..."
            : lessonCompleted
              ? "Lesson completed - restart or exit."
              : practiceActive
                ? "Finish the practice above first..."
                : "Type your answer..."
        }
        disabled={!sessionActive || loading || practiceActive || lessonCompleted}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 14,
          border: "1px solid var(--border)",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmitAnswer && !practiceActive) void onSendAnswer();
        }}
      />
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
        Send
      </button>
    </div>
  );
}
