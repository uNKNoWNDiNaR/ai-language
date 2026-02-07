import { Fragment } from "react";
import type { RefObject, CSSProperties, ReactNode } from "react";
import type { ChatMessage, LessonSession } from "../../api/lessonAPI";

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

type ChatPaneProps = {
  chatRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  session: LessonSession | null;
  pending: null | "start" | "resume" | "answer" | "practice" | "review";
  showEmptyState?: boolean;
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
    maxWidth: "74%",
    padding: "11px 13px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.42,
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
  children,
}: ChatPaneProps) {
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
      {!session && showEmptyState && <div style={{ opacity: 0.7 }}>Start a lesson to begin.</div>}

      {messages.map((m, i) => {
        const prevRole = i > 0 ? messages[i - 1]?.role : null;
        const nextRole = i < messages.length - 1 ? messages[i + 1]?.role : null;

        const isFirstInGroup = prevRole !== m.role;
        const isLastInGroup = nextRole !== m.role;

        const reveal = m.role === "assistant" ? parseRevealMessage(m.content) : null;

        return (
          <Fragment key={`${m.role}-${i}`}>
            <div style={{ ...rowStyle(m.role), marginTop: isFirstInGroup ? 10 : 2 }}>
              {reveal ? (
                <div className="lessonRevealCard">
                  {reveal.explanation && (
                    <div>
                      <div className="lessonRevealLabel">Explanation</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{reveal.explanation}</div>
                    </div>
                  )}
                  {reveal.answer && (
                    <div className="lessonRevealAnswer">
                      <div className="lessonRevealLabel">Answer</div>
                      <div style={{ fontWeight: 700 }}>{reveal.answer}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={bubbleStyle(m.role, isLastInGroup)}>
                  {isFirstInGroup && (
                    <div style={bubbleMetaStyle(m.role)}>
                      {m.role === "assistant" ? "Tutor" : "You"}
                    </div>
                  )}
                  <div>{m.content}</div>
                </div>
              )}
            </div>
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
