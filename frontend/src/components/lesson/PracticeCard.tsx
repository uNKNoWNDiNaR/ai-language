import type { RefObject } from "react";

type PracticeMode = "lesson" | "review" | null;

type PracticeCardProps = {
  practicePrompt: string | null;
  practiceId: string | null;
  practiceMode: PracticeMode;
  reviewIndex: number;
  reviewQueueLength: number;
  onStopReview: () => void;
  loading: boolean;
  pending: null | "start" | "resume" | "answer" | "practice" | "review";
  practiceTutorMessage: string | null;
  practiceAnswer: string;
  onPracticeAnswerChange: (value: string) => void;
  practiceInputRef: RefObject<HTMLInputElement | null>;
  canSubmitPractice: boolean;
  onSendPractice: () => void | Promise<void>;
  uiStrings?: {
    reviewLabel?: string;
    practiceLabel?: string;
    stopLabel?: string;
    optionalReviewLabel?: string;
    practiceCompleteToContinue?: string;
    practicePlaceholder?: string;
    sendLabel?: string;
  };
};

export function PracticeCard({
  practicePrompt,
  practiceId,
  practiceMode,
  reviewIndex,
  reviewQueueLength,
  onStopReview,
  loading,
  pending,
  practiceTutorMessage,
  practiceAnswer,
  onPracticeAnswerChange,
  practiceInputRef,
  canSubmitPractice,
  onSendPractice,
  uiStrings,
}: PracticeCardProps) {
  if (!practicePrompt || !practiceId) return null;

  const reviewLabel = uiStrings?.reviewLabel ?? "Review";
  const practiceLabel = uiStrings?.practiceLabel ?? "Practice";
  const stopLabel = uiStrings?.stopLabel ?? "Stop";
  const optionalReviewLabel = uiStrings?.optionalReviewLabel ?? "Optional review";
  const practiceCompleteToContinue =
    uiStrings?.practiceCompleteToContinue ?? "Complete this to continue";
  const practicePlaceholder = uiStrings?.practicePlaceholder ?? "Answer the practice...";
  const sendLabel = uiStrings?.sendLabel ?? "Send";

  return (
    <div
      className="fadeIn"
      style={{
        marginTop: 6,
        padding: 12,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {practiceMode === "review"
              ? `${reviewLabel} ${reviewIndex + 1}/${Math.max(1, reviewQueueLength)}`
              : practiceLabel}
          </div>

          {practiceMode === "review" && (
            <button
              onClick={onStopReview}
              disabled={loading}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "white",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 12,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {stopLabel}
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {practiceMode === "review" ? optionalReviewLabel : practiceCompleteToContinue}
        </div>
      </div>
      <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{practicePrompt}</div>

      {pending === "practice" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tutor</div>
          <div style={{ display: "flex", alignItems: "center", padding: "2px 2px" }}>
            <span className="typingDot" />
            <span className="typingDot" />
            <span className="typingDot" />
          </div>
        </div>
      )}

      {practiceTutorMessage && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tutor</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{practiceTutorMessage}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <input
          ref={practiceInputRef}
          value={practiceAnswer}
          onChange={(e) => onPracticeAnswerChange(e.target.value)}
          placeholder={practicePlaceholder}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmitPractice) void onSendPractice();
          }}
        />
        <button
          onClick={() => void onSendPractice()}
          disabled={!canSubmitPractice}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid",
            borderColor: canSubmitPractice ? "var(--accent)" : "var(--border)",
            background: canSubmitPractice ? "var(--accent)" : "var(--surface-muted)",
            color: canSubmitPractice ? "white" : "var(--text-muted)",
            cursor: canSubmitPractice ? "pointer" : "not-allowed",
          }}
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
}
