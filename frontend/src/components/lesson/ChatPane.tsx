import { Fragment } from "react";
import type { RefObject, CSSProperties, ReactNode } from "react";
import type { ChatMessage, LessonSession } from "../../api/lessonAPI";
import type { UiStrings } from "../../utils/instructionLanguage";

type Role = "user" | "assistant";

const REVEAL_PREFIX = "__REVEAL__";

type RevealPayload = { explanation?: string; answer?: string } | null;

function parseRevealMessage(content: string): RevealPayload {
  if (!content.startsWith(REVEAL_PREFIX)) return null;
  const raw = content.slice(REVEAL_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as { explanation?: string; answer?: string };
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function splitSupportText(message: ChatMessage): { primary: string; support?: string } {
  if (message.primaryText || message.supportText) {
    const supportRaw = message.supportText ?? "";
    const supportClean = supportRaw.trim();
    if (!supportClean || /^[-•]\s*$/.test(supportClean)) {
      return {
        primary: message.primaryText ?? message.content ?? "",
      };
    }
    return {
      primary: message.primaryText ?? message.content ?? "",
      support: supportClean,
    };
  }

  const content = message.content ?? "";
  const idx = content.indexOf("\n\n");
  if (idx > -1) {
    const primary = content.slice(0, idx).trim();
    const support = content.slice(idx + 2).trim();
    if (support && !/^[-•]\s*$/.test(support)) {
      return { primary: primary || content, support };
    }
  }

  return { primary: content };
}

function formatPrimaryText(text: string): string {
  let out = text || "";
  if (!out) return out;

  if (out.includes("Hint:") && !out.includes("\nHint:")) {
    out = out.replace(/\s*Hint:\s*/g, "\nHint: ");
  }

  if (out.includes("Hint:")) {
    const match = out.match(/([^\n]*\?)\s*$/);
    if (match) {
      const question = match[1];
      const prefix = out.slice(0, out.length - question.length).trimEnd();
      if (!prefix.endsWith("\n")) {
        out = `${prefix}\n${question}`.trim();
      }
    }
  }

  return out;
}

function formatSupportText(text: string): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";

  const withoutLabel = raw.replace(/^support\s*:?\s*/i, "").trim();
  const collapsed = withoutLabel
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•]\s*/i, "").trim())
    .filter(Boolean)
    .join(" ");

  if (!collapsed) return "";
  if (collapsed.length <= 140) return collapsed;
  return withoutLabel;
}

type ChatPaneProps = {
  chatRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  session: LessonSession | null;
  pending: null | "start" | "resume" | "answer" | "practice" | "review";
  showEmptyState?: boolean;
  uiStrings?: UiStrings;
  instructionLanguage?: string | null;
  clozeActive?: boolean;
  clozePrompt?: string;
  clozeValue?: string;
  onClozeChange?: (value: string) => void;
  onClozeSubmit?: () => void | Promise<void>;
  clozeDisabled?: boolean;
  clozeInputRef?: RefObject<HTMLInputElement | null>;
  clozeHelperText?: string;
  clozeErrorText?: string;
  children?: ReactNode;
};

function rowStyle(role: Role): CSSProperties {
  const isUser = role === "user";
  return {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
    padding: "0 6px",
  };
}

function bubbleStyle(role: Role, isLastInGroup: boolean): CSSProperties {
  const isUser = role === "user";

  const bottomLeft = !isLastInGroup ? 18 : isUser ? 18 : 6;
  const bottomRight = !isLastInGroup ? 18 : isUser ? 6 : 18;

  return {
    maxWidth: "100%",
    padding: "9px 10px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    fontSize: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: bottomLeft,
    borderBottomRightRadius: bottomRight,
    background: isUser ? "#2F6BFF" : "#EEF2F7",
    color: isUser ? "white" : "var(--text)",
    border: isUser ? "1px solid var(--accent-strong)" : "1px solid var(--border)",
    boxShadow: "var(--shadow-sm)",
  };
}

function bubbleMetaStyle(role: Role): CSSProperties {
  const isUser = role === "user";
  return {
    fontSize: 11,
    marginBottom: 4,
    opacity: isUser ? 0.85 : 0.7,
    color: isUser ? "rgba(255,255,255,0.82)" : "var(--text-muted)",
  };
}

export function ChatPane({
  chatRef,
  chatEndRef,
  messages,
  session,
  pending,
  showEmptyState = true,
  uiStrings,
  instructionLanguage,
  clozeActive,
  clozePrompt,
  clozeValue,
  onClozeChange,
  onClozeSubmit,
  clozeDisabled,
  clozeInputRef,
  clozeHelperText,
  clozeErrorText,
  children,
}: ChatPaneProps) {
  const explanationLabel = uiStrings?.explanationLabel ?? "Explanation";
  const answerLabel = uiStrings?.answerLabel ?? "Answer";
  const supportLabel = uiStrings?.supportLabel ?? "Support";
  const tutorLabel = uiStrings?.tutorLabel ?? "Tutor";
  const youLabel = uiStrings?.youLabel ?? "You";
  const startLessonEmpty = uiStrings?.startLessonEmpty ?? "Start a lesson to begin.";
  const lastAssistantIndex = [...messages]
    .map((m, idx) => (m.role === "assistant" ? idx : -1))
    .filter((idx) => idx >= 0)
    .slice(-1)[0];

  const renderTextWithBreaks = (text: string) => {
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    return lines.map((line, idx) => (
      <span key={`${line}-${idx}`}>
        {line}
        {idx < lines.length - 1 && <br />}
      </span>
    ));
  };

  const renderClozeInline = (prompt: string) => {
    const [before, after] = prompt.split("___", 2);
    return (
      <span className="inline-flex flex-wrap items-center">
        <span>{before}</span>
        <input
          ref={clozeInputRef}
          value={clozeValue ?? ""}
          onChange={(e) => onClozeChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !clozeDisabled) {
              e.preventDefault();
              void onClozeSubmit?.();
            }
          }}
          disabled={clozeDisabled}
          className="mx-2 inline-block w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <span>{after}</span>
      </span>
    );
  };

  const renderClozeFallback = () => (
    <div className="mt-2">
      <input
        ref={clozeInputRef}
        value={clozeValue ?? ""}
        onChange={(e) => onClozeChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !clozeDisabled) {
            e.preventDefault();
            void onClozeSubmit?.();
          }
        }}
        disabled={clozeDisabled}
        className="w-40 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
      />
    </div>
  );

  return (
    <div
      ref={chatRef}
      className="fadeIn"
      style={{
        border: "1px solid var(--border)",
        borderRadius: 18,
        padding: 16,
        height: 620,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        background: "#F3F5FA",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {!session && showEmptyState && <div style={{ opacity: 0.7 }}>{startLessonEmpty}</div>}

      {messages.map((m, i) => {
        const prevRole = i > 0 ? messages[i - 1]?.role : null;
        const nextRole = i < messages.length - 1 ? messages[i + 1]?.role : null;

        const isFirstInGroup = prevRole !== m.role;
        const isLastInGroup = nextRole !== m.role;

        const revealSource = m.content || m.primaryText || "";
        const reveal = m.role === "assistant" ? parseRevealMessage(revealSource) : null;
        const showRevealDivider = Boolean(reveal && i < messages.length - 1);
        const parts = m.role === "assistant" ? splitSupportText(m) : { primary: m.content };
        const primaryText = m.role === "assistant" ? formatPrimaryText(parts.primary) : parts.primary;
        const shouldRenderCloze =
          Boolean(clozeActive && clozePrompt) &&
          m.role === "assistant" &&
          i === lastAssistantIndex;
        const promptText = clozePrompt ?? "";
        const promptIndex = shouldRenderCloze ? primaryText.indexOf(promptText) : -1;

        return (
          <Fragment key={`${m.role}-${i}`}>
            <div style={{ ...rowStyle(m.role), marginTop: isFirstInGroup ? 10 : 2 }}>
              {reveal ? (
                <div className="lessonRevealCard">
                  {reveal.explanation && (
                    <div>
                      <div className="lessonRevealLabel">{explanationLabel}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{reveal.explanation}</div>
                    </div>
                  )}
                  {reveal.answer && (
                    <div className="lessonRevealAnswer">
                      <div className="lessonRevealLabel">{answerLabel}</div>
                      <div style={{ fontWeight: 700 }}>{reveal.answer}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "70%" }}>
                  <div style={bubbleStyle(m.role, isLastInGroup)}>
                    {isFirstInGroup && (
                      <div style={bubbleMetaStyle(m.role)}>
                        {m.role === "assistant" ? tutorLabel : youLabel}
                      </div>
                    )}
                    {shouldRenderCloze ? (
                      <div>
                        {promptIndex >= 0 ? (
                          <>
                            {renderTextWithBreaks(primaryText.slice(0, promptIndex))}
                            {promptText.includes("___")
                              ? renderClozeInline(promptText)
                              : renderTextWithBreaks(promptText)}
                            {renderTextWithBreaks(primaryText.slice(promptIndex + promptText.length))}
                            {!promptText.includes("___") && renderClozeFallback()}
                          </>
                        ) : (
                          <>
                            {renderTextWithBreaks(primaryText)}
                            {promptText.includes("___")
                              ? renderClozeInline(promptText)
                              : renderClozeFallback()}
                          </>
                        )}
                        {clozeHelperText && (
                          <div className="mt-2 text-sm text-slate-600">{clozeHelperText}</div>
                        )}
                        {clozeErrorText && (
                          <div className="mt-2 text-sm text-rose-600">{clozeErrorText}</div>
                        )}
                      </div>
                    ) : (
                      <div>{primaryText}</div>
                    )}
                  </div>
                  {m.role === "assistant" && parts.support && i === lastAssistantIndex && (
                    <div
                      style={{
                        maxWidth: "70%",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "var(--surface-muted)",
                        color: "var(--text-muted)",
                        fontSize: 13,
                        lineHeight: 1.4,
                        border: "1px solid var(--border)",
                        borderLeft: "3px solid var(--accent-soft)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.4px",
                          marginBottom: 6,
                          color: "var(--text-muted)",
                          opacity: 0.9,
                        }}
                      >
                        {instructionLanguage
                          ? `${supportLabel} (${instructionLanguage.toUpperCase()})`
                          : supportLabel}
                      </div>
                      {formatSupportText(parts.support)}
                    </div>
                  )}
                </div>
              )}
            </div>
            {showRevealDivider && (
              <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 6px" }}>
                <div
                  style={{
                    height: 1,
                    width: "60%",
                    background: "var(--border)",
                    borderRadius: 999,
                    opacity: 0.6,
                  }}
                />
              </div>
            )}
          </Fragment>
        );
      })}

      {Boolean(session) && pending === "answer" && (
        <div style={rowStyle("assistant")}>
          <div style={bubbleStyle("assistant", true)}>
            <div style={{ display: "flex", alignItems: "center", padding: "2px 2px" }}>
              <span className="typingDot" />
              <span className="typingDot" />
              <span className="typingDot" />
            </div>
          </div>
        </div>
      )}

      {children}

      <div ref={chatEndRef} />
    </div>
  );
}
