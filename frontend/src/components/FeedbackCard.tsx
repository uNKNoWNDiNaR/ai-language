// frontend/src/components/FeedbackCard.tsx

import { useEffect, useMemo, useState } from "react";
import { submitFeedback, type SupportedLanguage } from "../api/lessonAPI";

type Props = {
  userId: string;
  language: SupportedLanguage;
  lessonId: string;
  sessionKey: string;
  disabled?: boolean;
};

function makeAnonId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `a${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function FeedbackCard({ userId, language, lessonId, sessionKey, disabled }: Props) {
  const storageKey = useMemo(() => {
    const k = (sessionKey || "").trim();
    return k ? `ai-language:feedbackAnonSessionId:${k}` : "";
  }, [sessionKey]);

  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [feltRushed, setFeltRushed] = useState<boolean | null>(null);
  const [helpedUnderstand, setHelpedUnderstand] = useState<number | null>(null);
  const [confusedText, setConfusedText] = useState("");

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

  const canSend = useMemo(() => {
    if (sent || sending) return false;
    return (
      feltRushed !== null ||
      helpedUnderstand !== null ||
      confusedText.trim().length > 0
    );
  }, [sent, sending, feltRushed, helpedUnderstand, confusedText]);

  async function onSend() {
    if (!canSend) return;
    setErr(null);
    setSending(true);
    try {
      await submitFeedback({
        userId: userId.trim(),
        anonSessionId: anonSessionId || makeAnonId(),
        feltRushed: feltRushed === null ? undefined : feltRushed,
        helpedUnderstand: helpedUnderstand === null ? undefined : helpedUnderstand,
        confusedText: confusedText.trim() ? confusedText.trim() : undefined,

        // fallback context if session was cleared server-side
        lessonId: lessonId.trim(),
        language,
      });
      setSent(true);
      setOpen(false);
    } catch {
      setErr("Couldn’t send feedback right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div
        style={{
          alignSelf: "center",
          maxWidth: 520,
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(0,0,0,0.03)",
          fontSize: 13,
          textAlign: "center",
          opacity: 0.85,
        }}
      >
        Thanks — this helps us make the tutor feel calmer and clearer.
      </div>
    );
  }

  return (
    <div
      style={{
        alignSelf: "center",
        maxWidth: 520,
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>Optional feedback</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled || sending}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: disabled || sending ? "#f6f6f6" : "white",
            cursor: disabled || sending ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Did you feel rushed?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFeltRushed(true)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: feltRushed === true ? "#111" : "white",
                  color: feltRushed === true ? "white" : "#111",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setFeltRushed(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: feltRushed === false ? "#111" : "white",
                  color: feltRushed === false ? "white" : "#111",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                No
              </button>
              {feltRushed !== null && (
                <button
                  type="button"
                  onClick={() => setFeltRushed(null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    fontSize: 13,
                    opacity: 0.8,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Did this help you understand?</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setHelpedUnderstand(n)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: helpedUnderstand === n ? "#111" : "white",
                    color: helpedUnderstand === n ? "white" : "#111",
                    cursor: "pointer",
                    fontSize: 13,
                    minWidth: 40,
                  }}
                >
                  {n}
                </button>
              ))}
              {helpedUnderstand !== null && (
                <button
                  type="button"
                  onClick={() => setHelpedUnderstand(null)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    fontSize: 13,
                    opacity: 0.8,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>What confused you? (optional)</div>
            <textarea
              value={confusedText}
              onChange={(e) => setConfusedText(e.target.value)}
              rows={3}
              placeholder="A quick note is enough…"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 12,
                border: "1px solid #ddd",
                resize: "vertical",
              }}
            />
          </div>

          {err && <div style={{ fontSize: 13, color: "#b00020" }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend || disabled}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid",
                borderColor: !canSend || disabled ? "#ddd" : "#111",
                background: !canSend || disabled ? "#f6f6f6" : "#111",
                color: !canSend || disabled ? "#666" : "white",
                cursor: !canSend || disabled ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {sending ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
