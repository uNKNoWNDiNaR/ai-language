import { useEffect, useMemo, useState } from "react";
import type { LessonFeedbackQuickTag } from "../../api/lessonAPI";
import { Button } from "../ui";

const TAG_OPTIONS: Array<{ value: LessonFeedbackQuickTag; label: string }> = [
  { value: "too_hard", label: "Too hard" },
  { value: "too_easy", label: "Too easy" },
  { value: "confusing_instructions", label: "Confusing instructions" },
  { value: "answer_checking_unfair", label: "Answer checking felt unfair" },
  { value: "good_pace", label: "Good pace" },
  { value: "helpful_hints", label: "Helpful hints" },
];

type LessonFeedbackForm = {
  rating?: number;
  quickTags?: LessonFeedbackQuickTag[];
  freeText?: string;
  forcedChoice?: {
    returnTomorrow?: "yes" | "maybe" | "no";
    clarity?: "very_clear" | "mostly_clear" | "somewhat_confusing" | "very_confusing";
    pace?: "too_slow" | "just_right" | "too_fast";
    answerChecking?: "fair" | "mostly_fair" | "unfair" | "not_sure";
  };
};

type LessonFeedbackModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: LessonFeedbackForm) => Promise<void>;
};

export function LessonFeedbackModal({ open, onClose, onSubmit }: LessonFeedbackModalProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [quickTags, setQuickTags] = useState<LessonFeedbackQuickTag[]>([]);
  const [freeText, setFreeText] = useState("");
  const [returnTomorrow, setReturnTomorrow] = useState<"yes" | "maybe" | "no" | null>(null);
  const [clarity, setClarity] = useState<
    "very_clear" | "mostly_clear" | "somewhat_confusing" | "very_confusing" | null
  >(null);
  const [pace, setPace] = useState<"too_slow" | "just_right" | "too_fast" | null>(null);
  const [answerChecking, setAnswerChecking] = useState<
    "fair" | "mostly_fair" | "unfair" | "not_sure" | null
  >(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRating(null);
    setQuickTags([]);
    setFreeText("");
    setReturnTomorrow(null);
    setClarity(null);
    setPace(null);
    setAnswerChecking(null);
    setSending(false);
    setSent(false);
    setError(null);
  }, [open]);

  const canSend = useMemo(() => {
    if (sending || sent) return false;
    return Boolean(
      rating ||
        quickTags.length > 0 ||
        freeText.trim().length > 0 ||
        returnTomorrow ||
        clarity ||
        pace ||
        answerChecking
    );
  }, [sending, sent, rating, quickTags, freeText, returnTomorrow, clarity, pace, answerChecking]);

  if (!open) return null;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setError(null);

    try {
      await onSubmit({
        rating: rating ?? undefined,
        quickTags: quickTags.length ? quickTags : undefined,
        freeText: freeText.trim() || undefined,
        forcedChoice:
          returnTomorrow || clarity || pace || answerChecking
            ? {
                returnTomorrow: returnTomorrow ?? undefined,
                clarity: clarity ?? undefined,
                pace: pace ?? undefined,
                answerChecking: answerChecking ?? undefined,
              }
            : undefined,
      });
      setSent(true);
    } catch {
      setError("Couldn’t send feedback right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function toggleTag(tag: LessonFeedbackQuickTag) {
    setQuickTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-900/40" />
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-slate-900">How did this lesson feel?</div>
            <div className="mt-1 text-sm text-slate-500">
              Optional feedback helps us keep lessons calm and clear.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {sent ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Thanks — received.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Would you do another lesson tomorrow?
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { value: "yes" as const, label: "Yes" },
                    { value: "maybe" as const, label: "Maybe" },
                    { value: "no" as const, label: "No" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReturnTomorrow(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        returnTomorrow === opt.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {returnTomorrow && (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setReturnTomorrow(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-800">
                  How clear were the instructions?
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { value: "very_clear" as const, label: "Very clear" },
                    { value: "mostly_clear" as const, label: "Mostly clear" },
                    { value: "somewhat_confusing" as const, label: "Somewhat confusing" },
                    { value: "very_confusing" as const, label: "Very confusing" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setClarity(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        clarity === opt.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {clarity && (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setClarity(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-800">How did the pace feel?</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { value: "too_slow" as const, label: "Too slow" },
                    { value: "just_right" as const, label: "Just right" },
                    { value: "too_fast" as const, label: "Too fast" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPace(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        pace === opt.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {pace && (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setPace(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Did answer checking feel fair?
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { value: "fair" as const, label: "Fair" },
                    { value: "mostly_fair" as const, label: "Mostly fair" },
                    { value: "unfair" as const, label: "Unfair" },
                    { value: "not_sure" as const, label: "Not sure" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAnswerChecking(opt.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        answerChecking === opt.value
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {answerChecking && (
                    <button
                      type="button"
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setAnswerChecking(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800">Rating (optional)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`h-9 w-9 rounded-full border text-sm font-semibold transition ${
                      rating === value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {value}
                  </button>
                ))}
                {rating && (
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 hover:text-slate-700"
                    onClick={() => setRating(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800">Quick tags (optional)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => toggleTag(tag.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      quickTags.includes(tag.value)
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2 text-sm text-slate-700">
              One thing to improve (optional)
              <textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value.slice(0, 500))}
                placeholder="A short note helps."
                className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            {error && <div className="text-sm text-rose-600">{error}</div>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={sending}>
                Skip
              </Button>
              <Button onClick={handleSend} disabled={!canSend}>
                {sending ? "Sending..." : "Send feedback"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
