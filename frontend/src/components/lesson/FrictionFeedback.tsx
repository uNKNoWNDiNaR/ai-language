import { useEffect, useState } from "react";
import { Button } from "../ui";

type FrictionChoice =
  | "instructions"
  | "vocab"
  | "grammar"
  | "evaluation_unfair"
  | "other";

type FrictionFeedbackProps = {
  visible: boolean;
  onSend: (payload: { frictionType: FrictionChoice; freeText?: string }) => Promise<void>;
  onDismiss: () => void;
};

export function FrictionFeedback({ visible, onSend, onDismiss }: FrictionFeedbackProps) {
  const [selection, setSelection] = useState<FrictionChoice | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelection(null);
    setText("");
    setSending(false);
    setSent(false);
    setError(null);
  }, [visible]);

  if (!visible) return null;

  async function handleSend() {
    if (!selection || sending) return;
    const trimmed = text.trim();
    setSending(true);
    setError(null);
    try {
      await onSend({
        frictionType: selection,
        freeText: trimmed || undefined,
      });
      setSent(true);
    } catch {
      setError("Couldn’t send that right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {sent ? (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Thanks — received.</span>
          <Button variant="secondary" size="sm" onClick={onDismiss}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-800">What’s the main issue?</div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "instructions" as const, label: "Instructions unclear" },
              { value: "vocab" as const, label: "Missing words" },
              { value: "grammar" as const, label: "Grammar unclear" },
              { value: "evaluation_unfair" as const, label: "Answer checking felt unfair" },
              { value: "other" as const, label: "Other" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelection(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  selection === opt.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {selection === "other" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 300))}
              placeholder="Tell us what was unclear (optional)."
              className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          )}
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSend} disabled={sending || !selection}>
              {sending ? "Sending..." : "Send"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onDismiss}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
