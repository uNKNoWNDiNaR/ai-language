// frontend/src/components/FeedbackCard.tsx

import { useEffect, useMemo, useState } from "react";
import { submitFeedback, type SupportedLanguage } from "../api/lessonAPI";
import { cn } from "./ui";

type FeedbackScreen = "home" | "lesson" | "review" | "other";
type FeedbackIntent = "start" | "continue" | "review" | "change_settings" | "exploring";
type CrowdedRating = "not_at_all" | "a_little" | "yes_a_lot";
type FeltBestOption = "continue_card" | "units" | "optional_review" | "calm_tone" | "other";

type Props = {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  sessionKey?: string;
  instructionLanguage?: SupportedLanguage;
  currentQuestionIndex?: number | null;
  screen: FeedbackScreen;
  disabled?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
};

function makeAnonId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `a${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const SCREEN_OPTIONS: Array<{ value: FeedbackScreen; label: string }> = [
  { value: "home", label: "Home" },
  { value: "lesson", label: "Lesson" },
  { value: "review", label: "Review" },
  { value: "other", label: "Other" },
];

const INTENT_OPTIONS: Array<{ value: FeedbackIntent; label: string }> = [
  { value: "start", label: "Start" },
  { value: "continue", label: "Continue" },
  { value: "review", label: "Review" },
  { value: "change_settings", label: "Change settings" },
  { value: "exploring", label: "Exploring" },
];

const CROWDED_OPTIONS: Array<{ value: CrowdedRating; label: string }> = [
  { value: "not_at_all", label: "Not at all" },
  { value: "a_little", label: "A little" },
  { value: "yes_a_lot", label: "Yes, a lot" },
];

const FELT_BEST_OPTIONS: Array<{ value: FeltBestOption; label: string }> = [
  { value: "continue_card", label: "Continue card" },
  { value: "units", label: "Units" },
  { value: "optional_review", label: "Optional review" },
  { value: "calm_tone", label: "Calm tone" },
  { value: "other", label: "Other" },
];

export function FeedbackCard({
  userId,
  language,
  lessonId,
  sessionKey,
  instructionLanguage,
  currentQuestionIndex,
  screen,
  disabled,
  triggerLabel = "Optional feedback",
  triggerClassName = "text-sm font-medium text-slate-600 hover:text-slate-800",
}: Props) {
  const storageKey = useMemo(() => {
    const k = (sessionKey || "").trim();
    return k ? `ai-language:feedbackAnonSessionId:${k}` : "";
  }, [sessionKey]);

  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [formScreen, setFormScreen] = useState<FeedbackScreen>(screen);
  const [intent, setIntent] = useState<FeedbackIntent | "">("");
  const [crowdedRating, setCrowdedRating] = useState<CrowdedRating | "">("");
  const [feltBest, setFeltBest] = useState<FeltBestOption[]>([]);
  const [improveText, setImproveText] = useState("");

  const [anonSessionId, setAnonSessionId] = useState<string>("");

  useEffect(() => {
    if (!storageKey) {
      setAnonSessionId(makeAnonId());
      return;
    }
    try {
      const existing = localStorage.getItem(storageKey);
      if (existing && existing.trim()) {
        setAnonSessionId(existing.trim());
        return;
      }
      const fresh = makeAnonId();
      localStorage.setItem(storageKey, fresh);
      setAnonSessionId(fresh);
    } catch {
      setAnonSessionId(makeAnonId());
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setErr(null);
    setFormScreen(screen);
    setIntent("");
    setCrowdedRating("");
    setFeltBest([]);
    setImproveText("");
  }, [open, screen]);

  useEffect(() => {
    setFormScreen(screen);
  }, [screen]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const canSend = useMemo(() => {
    if (sent || sending) return false;
    return (
      intent !== "" ||
      crowdedRating !== "" ||
      feltBest.length > 0 ||
      improveText.trim().length > 0
    );
  }, [sent, sending, intent, crowdedRating, feltBest, improveText]);

  function toggleFeltBest(value: FeltBestOption) {
    setFeltBest((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function onSend() {
    if (!canSend) return;
    setErr(null);
    setSending(true);

    const trimmedImprove = improveText.trim();
    const feltRushed =
      crowdedRating === "yes_a_lot" ? true : crowdedRating === "not_at_all" ? false : undefined;

    const appVersion = (import.meta as any).env?.VITE_APP_VERSION as string | undefined;

    try {
      await submitFeedback({
        userId: userId.trim(),
        anonSessionId: anonSessionId || makeAnonId(),
        lessonId: lessonId.trim(),
        language,
        targetLanguage: language,
        screen: formScreen,
        intent: intent || undefined,
        crowdedRating: crowdedRating || undefined,
        feltBest: feltBest.length ? feltBest : undefined,
        improveText: trimmedImprove || undefined,
        feltRushed,
        confusedText: trimmedImprove || undefined,
        instructionLanguage: instructionLanguage || undefined,
        sessionKey: sessionKey?.trim() || undefined,
        currentQuestionIndex:
          typeof currentQuestionIndex === "number" ? currentQuestionIndex : undefined,
        appVersion: appVersion || undefined,
        timestamp: new Date().toISOString(),
      });
      setSent(true);
    } catch {
      setErr("Couldn’t send feedback right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || sending}
        className={cn(triggerClassName, disabled || sending ? "opacity-60" : "")}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">Optional feedback</div>
                <div className="mt-1 text-sm text-slate-500">
                  A quick note helps us keep the experience calm and clear.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-700">
                    Screen
                    <select
                      value={formScreen}
                      onChange={(e) => setFormScreen(e.target.value as FeedbackScreen)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      {SCREEN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-slate-700">
                    Intent
                    <select
                      value={intent}
                      onChange={(e) => setIntent(e.target.value as FeedbackIntent)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    >
                      <option value="">Select one</option>
                      {INTENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700">Crowded or confusing?</div>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {CROWDED_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                          crowdedRating === opt.value
                            ? "border-blue-300 bg-blue-50 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700"
                        )}
                      >
                        <input
                          type="radio"
                          name="crowdedRating"
                          value={opt.value}
                          checked={crowdedRating === opt.value}
                          onChange={() => setCrowdedRating(opt.value)}
                          className="accent-blue-600"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700">What felt best?</div>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {FELT_BEST_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                          feltBest.includes(opt.value)
                            ? "border-blue-300 bg-blue-50 text-blue-900"
                            : "border-slate-200 bg-white text-slate-700"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={feltBest.includes(opt.value)}
                          onChange={() => toggleFeltBest(opt.value)}
                          className="accent-blue-600"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="grid gap-2 text-sm text-slate-700">
                  One thing to improve (optional)
                  <textarea
                    value={improveText}
                    onChange={(e) => setImproveText(e.target.value)}
                    rows={3}
                    placeholder="A quick note is enough…"
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>

                {err && <div className="text-sm text-red-600">{err}</div>}

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={!canSend || sending}
                    className={cn(
                      "rounded-xl px-4 py-2.5 text-sm font-semibold",
                      !canSend || sending
                        ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500"
                        : "border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                    )}
                  >
                    {sending ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
