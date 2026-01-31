// frontend/src/components/Lesson.tsx



import React, { useEffect, useRef, useMemo, useState } from "react";
import {
  startLesson,
  submitAnswer,
  getSession,
  submitPractice,
  type LessonSession,
  type ChatMessage,
  type SubmitAnswerResponse,
  type SubmitPracticeResponse,
  type LessonProgressPayload,
} from "../api/lessonAPI";

type Role = "user" | "assistant";

function rowStyle(role: Role): React.CSSProperties {
  const isUser = role === "user"; 
  return {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
    padding: "0 6px",
  };
}

function bubbleStyle(role: Role, isLastInGroup: boolean): React.CSSProperties {
  const isUser = role === "user";

  const bottomLeft = !isLastInGroup ? 18 : (isUser ? 18 : 6);
  const bottomRight = !isLastInGroup ? 18 : (isUser ? 6 : 18);

  return {
    maxWidth: "74%",
    padding: "10px 12px",
    whiteSpace: "pre-wrap",
    lineHeight: 1.35,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: bottomLeft,
    borderBottomRightRadius: bottomRight, 
    background: isUser ? "#007AFF" : "#E5E5EA",
    color: isUser ? "white" : "#111",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  };
}

function bubbleMetaStyle(role: Role): React.CSSProperties {
  const isUser = role === "user";
  return {
    fontSize: 11,
    marginBottom: 4,
    opacity: isUser ? 0.8 : 0.65,
    color: isUser ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.55)",
  };
}

function prettyLanguage(lang: string | undefined): string {
  switch (lang) {
    case "en": return "English";
    case "de": return "German";
    case "es": return "Spanish";
    case "fr": return "French";
    default: return lang ?? "—";
  }
}

function prettyStatus(s: string | undefined): string {
  const t = (s ?? "").toLowerCase();
  if (t.includes("needs")) return "Needs review";
  if (t.includes("complete")) return "Completed";
  if (t.includes("progress")) return "In progress";
  return s ? s.replace(/_/g, " ") : "—";
}

function sanitizePracticeTutorMessage(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";

  // If it looks like backend debug output, strip "Result:" and "Reason:" labels.
  // Example:
  // Result: "almost"
  // Reason: ...
  const hasDebugLabels = /^result\s*:/im.test(t) || /^reason\s*:/im.test(t);
  if (!hasDebugLabels) return t;

  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const kept: string[] = [];

  for (const line of lines) {
    if (/^result\s*:/i.test(line)) continue;

    if (/^reason\s*:/i.test(line)) {
      const rest = line.replace(/^reason\s*:\s*/i, "").trim();
      if (rest) kept.push(rest);
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}


export  function Lesson() {
  const [userId, setUserId] = useState("user-1");
  const [language, setLanguage] = useState<"en" | "de" | "es" | "fr">("en");
  const [lessonId, setLessonId] = useState("basic-1");
  const [session, setSession] = useState<LessonSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [hintText, setHintText] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [practicePrompt, setPracticePrompt] = useState<string | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceTutorMessage, setPracticeTutorMessage] = useState<string | null>(null);
  const [, setPracticeAttemptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "start" | "resume" | "answer" | "practice">(null);
  const [progress, setProgress] = useState< LessonProgressPayload | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const chatRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const practiceInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, hintText, practicePrompt, practiceTutorMessage, pending]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: "smooth", block: "end"});
  }, [messages, hintText, practicePrompt, practiceTutorMessage])

  const practiceActive = useMemo(() => {
    return Boolean(practiceId && practicePrompt);
  }, [practiceId, practicePrompt])

  const sessionActive = Boolean(session);
  const lockControls = sessionActive || loading;
  const disableStartResume = loading || practiceActive || sessionActive;
  const disableRestart = loading || practiceActive || !sessionActive;

  const lessonCompleted = useMemo(() => {
    return (progress?.status ?? "").toLowerCase() === "completed";
  }, [progress]);

  const canSubmitAnswer = useMemo(() => {
    return (
      Boolean(session) &&
      answer.trim().length > 0 &&
      !loading &&
      !practiceActive &&
      !lessonCompleted
    );
  }, [session, answer, loading, practiceActive, lessonCompleted]);


  const canSubmitPractice = useMemo(() => {
    return Boolean(practiceId) && practiceAnswer.trim().length > 0 && !loading;
  }, [practiceId, practiceAnswer, loading]);

  useEffect(() => {
    if(loading) return;

    if(practiceActive) {
      practiceInputRef.current?.focus();
      return;
    }

    if(session) {
      answerInputRef.current?.focus();
    }
    }, [session, practiceActive, loading, pending])

    useEffect(() => {
    if (!moreOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }

    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (moreMenuRef.current?.contains(target)) return;
      if (moreButtonRef.current?.contains(target)) return;

      setMoreOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!sessionActive) setMoreOpen(false);
  }, [sessionActive]);


  async function handleStart() {
    setError(null);

    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setAnswer("");
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setLoading(true);
    setPending("start")

    try {
      const res = await startLesson({
        userId: userId.trim(),
        language,
        lessonId: lessonId.trim(),
        restart: false,
      });

      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setHintText(null);
      setProgress(res.progress ?? null);

      // clear any practice UI from older runs
      setPracticeId(null);
      setPracticePrompt(null);
      setPracticeAnswer("");
      setPracticeTutorMessage(null);
      setPracticeAttemptCount(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start lesson.");
    } finally {
      setPending(null)
      setLoading(false);
    }
  }

  async function handleResume() {
    setError(null);
    setLoading(true);
    setPending("resume")
    try {
      const res = await getSession(userId.trim());
      setSession(res.session);
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);
      setHintText(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to resume session.");
    } finally {
      setPending(null)
      setLoading(false);
    }
  }

  async function handleRestart() {
    if(!window.confirm("Restart this lesson? Your current progres in this session will be reset.")){
      return;
    }
    
    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setAnswer("");
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setLoading(true);
    setPending("start");

  try {
    const res = await startLesson({
      userId: userId.trim(),
      language,
      lessonId: lessonId.trim(),
      restart: true,
    });
    
    setSession(res.session);
    setMessages(res.session.messages ?? []);
    setProgress(res.progress ?? null)
    setHintText(null);

    // clear any practice UI from older runs
    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : "Failed to restart lesson.");
  } finally {
    setPending(null);
    setLoading(false);
  }
  }

  function handleExit() {
    if (!window.confirm("Exit this lesson? You can resume later.")) return;

    setError(null);
    setSession(null);
    setMessages([]);
    setProgress(null);
    setHintText(null);
    setAnswer("");

    setPracticeId(null);
    setPracticePrompt(null);
    setPracticeAnswer("");
    setPracticeTutorMessage(null);
    setPracticeAttemptCount(null);

    setPending(null);
    setMoreOpen(false);
  }

  async function handleSendAnswer() {
    if (!session || practiceActive || lessonCompleted) return;

    setError(null);
    setLoading(true);
    setPending("answer")
    setHintText(null);

    // Optimistic add user message
    const userMsg: ChatMessage = { role: "user", content: answer };
    setMessages((prev) => [...prev, userMsg]);

    const toSend = answer;
    setAnswer("");

    try {
      const res: SubmitAnswerResponse = await submitAnswer({
        userId: session.userId,
        answer: toSend,
        language: session.language,
        lessonId: session.lessonId,
      });

      setSession(res.session);

      // Replace messages with authoritative session messages
      setMessages(res.session.messages ?? []);
      setProgress(res.progress ?? null);

      // Hint block (optional)
      const evalResult = res.evaluation?.result;
      const incomingHint = (res.hint?.text ?? "").trim();

      const lastMsg = (res.session.messages ?? []).slice(-1)[0];
      const tutorText = 
        lastMsg && lastMsg.role === "assistant"
        ? lastMsg.content
        : (res.tutorMessage ?? "");

      const tutorLower = tutorText.toLowerCase();


      if (evalResult !== "correct" && incomingHint) {
        const hintLower = incomingHint.toLowerCase();
        setHintText(tutorLower.includes(hintLower) ? null : incomingHint);
      } else {
        setHintText(null);
      }

      // Practice (optional) — scheduled on "almost"
      if (res.practice?.practiceId && res.practice?.prompt) {
        setPracticeId(res.practice.practiceId);
        setPracticePrompt(res.practice.prompt);
        setPracticeAnswer("");
        setPracticeTutorMessage(null);
        setPracticeAttemptCount(null);
      }
      setProgress(res.progress ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit answer.");
    } finally {
      setPending(null)
      setLoading(false);
    }
  }

  async function handleSendPractice() {
    if (!practiceId || !session) return;

    setError(null);
    setLoading(true);
    setPending("practice")

    try {
      const res: SubmitPracticeResponse = await submitPractice({
        userId: session.userId,
        practiceId,
        answer: practiceAnswer,
      });

      setPracticeTutorMessage(sanitizePracticeTutorMessage(res.tutorMessage));
      setPracticeAttemptCount(res.attemptCount);

      // If correct, backend consumes practice item. Clear UI on correct.
      if (res.result === "correct") {
        setPracticeId(null);
        setPracticePrompt(null);
        setPracticeAnswer("");
      } else {
        // keep prompt + allow retry
        setPracticeAnswer("");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit practice.");
    } finally {
      setPending(null)
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
          <style>{`
      @keyframes dotPulse {
        0%, 80%, 100% { transform: translateY(0); opacity: .35; }
        40% { transform: translateY(-2px); opacity: 1; }
      }
      .typingDot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: rgba(0,0,0,.35);
        display: inline-block;
        margin-right: 5px;
        animation: dotPulse 1.2s infinite ease-in-out;
      }
      .typingDot:nth-child(2) { animation-delay: .15s; }
      .typingDot:nth-child(3) { animation-delay: .30s; }
    `}</style>

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr auto",
          gap: 10,
          alignItems: "end",
          marginBottom: 12,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Profile</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            disabled={lockControls}
            style={{ 
              padding: 10, 
              borderRadius: 10, 
              border: "1px solid #ddd",
              background: lockControls ? "#f6f6f6" : "white",
              cursor: lockControls ? "not-allowed" : "text",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "de" | "es" | "fr")}
            disabled={lockControls}
            style={{ 
              padding: 10, 
              borderRadius: 10, 
              border: "1px solid #ddd", 
              backgroundColor: lockControls ? "#f6f6f6" : "white",
              cursor: lockControls ? "not-allowed" : "pointer",
            }}
          >
            <option value="en">English</option>
            <option value="de">German</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Lesson</span>
          <input
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            disabled={lockControls} 
            style={{ 
              padding: 10, 
              borderRadius: 10, 
              border: "1px solid #ddd",
              background: lockControls ? "#f6f6f6" : "white",
              cursor: lockControls ? "not-allowed" : "text",
             }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleStart}
            disabled={disableStartResume}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              borderColor: disableStartResume ? "#ddd" : "#007AFF",
              background: disableStartResume ? "#E5E5EA" : "#007AFF",
              opacity: disableStartResume ? 0.7 : 1,
              color: disableStartResume ? "#666" : "white",
              cursor: disableStartResume ? "not-allowed" : "pointer",
            }}
          >
            Start
          </button>

          <button
            onClick={handleResume}
            disabled={disableStartResume}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: disableStartResume ? "#f6f6f6" : "white",
              opacity: disableStartResume ? 0.7 : 1,
              cursor: disableStartResume ? "not-allowed" : "pointer",
            }}
          >
            Resume
          </button>

      {sessionActive && (
      <div style={{ position: "relative" }}>
      <button
      ref={moreButtonRef}
      onClick={() => setMoreOpen((v) => !v)}
      disabled={disableRestart}
      aria-label="More"
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: disableRestart ? "#f6f6f6" : "white",
        color: "#111",
        cursor: disableRestart ? "not-allowed" : "pointer",
        minWidth: 44,
      }}
      >
        ⋯
      </button>

    {moreOpen && !disableRestart && (
      <div
        ref={moreMenuRef}
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          background: "white",
          border: "1px solid #e6e6e6",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          overflow: "hidden",
          minWidth: 200,
          zIndex: 50,
        }}
      >
        <button
          onClick={() => {
            setMoreOpen(false);
            void handleRestart();
          }}
          disabled={disableRestart}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            background: "white",
            border: "none",
            cursor: disableRestart ? "not-allowed" : "pointer",
            fontSize: 13,
            color: disableRestart ? "#999" : "#ff3b30",
          }}
        >
          Restart lesson
        </button>

        <div style={{ height: 1, background: "#f0f0f0" }} />

        <button
          onClick={() => {
            setMoreOpen(false);
            handleExit();
          }}
          disabled={disableRestart}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            background: "white",
            border: "none",
            cursor: disableRestart ? "not-allowed" : "pointer",
            fontSize: 13,
            color: disableRestart ? "#999" : "#111",
          }}
        >
          Exit lesson
        </button>
      </div>
    )}
  </div>
  )}


        </div>
      </div>

      {session && (
  <div
    style={{
      marginBottom: 10,
      padding: "8px 10px",
      borderRadius: 14,
      border: "1px solid #e6e6e6",
      background: "white",
      display: "grid",
      alignItems: "center",
      gridTemplateColumns: "1fr auto",
      gap: 10,
      fontSize: 13,
    }}
  >
    {/* Left: compact identity progress */}
    <div style={{ display: "flex", gap: 8, minWidth: 0 , alignItems: "center", flexWrap: "wrap"}}>
      <span style={{ fontWeight: 600 }}>{session.lessonId}</span>
      <span style={{ opacity: 0.45 }}>•</span>
      <span style={{ opacity: 0.85 }}>{prettyLanguage(session.language)}</span>

      {progress && !loading && (
        <>
          <span style={{opacity: 0.45}}>•</span>
          <span style={{ fontSize: 12, opacity: 0.75 }}/>
            Q {progress.currentQuestionIndex + 1}/{progress.totalQuestions}
          <span/>
        </>
      )}
    </div>

    {/* Right: status (ONLY once) */}
    <div 
      style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        background: "#F2F2F7",
        border: "1px solid #e6e6e6", 
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
              ? "#FF9500"
              : (progress?.status ?? "").includes("complete")
                ? "#34C759"
                : "#007AFF",
          opacity: 0.9,
        }}
      />
      <div>{prettyStatus(progress?.status ?? session.state)}</div>
    </div>
  </div>
)}


      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #f1c0c0",
            background: "#fff5f5",
          }}
        >
          {error}
        </div>
      )}

      {/* Chat */}
      <div
      ref={chatRef}
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 12,
          height: 420,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "#F2F2F7",
        }}
      >
        {!session && (
          <div style={{ opacity: 0.7 }}>
            Start a lesson to begin.
          </div>
        )}

        {messages.map((m, i) => {
        const prevRole = i > 0 ? messages[i - 1]?.role : null;
        const nextRole = i < messages.length - 1 ? messages[i + 1]?.role : null;
        
        const isFirstInGroup = prevRole !== m.role;
        const isLastInGroup = nextRole !== m.role;
        
        return (
          <div 
          key={`${m.role}-${i}`} 
          style={{
            ...rowStyle(m.role),
            marginTop: isFirstInGroup ? 10 : 2,
            }}
          >
            <div style={bubbleStyle(m.role, isLastInGroup)}>
              {isFirstInGroup && (
              <div style={bubbleMetaStyle(m.role)}>
                {m.role === "assistant" ? "Tutor" : "You"}
              </div>
              )}
              <div>{m.content}</div>
            </div>
          </div>
        );
      })}


        {Boolean(session) && (pending === "answer") && (
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

        {hintText && (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 12,
              border: "1px solid #eee",
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Hint</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{hintText}</div>
          </div>
        )}

        {practicePrompt && practiceId && (
          <div
            style={{
              marginTop: 6,
              padding: 12,
              borderRadius: 16,
              border: "1px solid #e6e6e6",
              background: "white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)" ,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6}}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Practice</div>
              <div style={{ fontSize: 12,opacity: 0.7}}>
                Complete this to continue
              </div>
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginBottom: 10 }}>{practicePrompt}</div>

            {pending === "practice" && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tutor</div>
                <div style={{display: "flex", alignItems: "center", padding: "2px 2px"}}>
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
                onChange={(e) => setPracticeAnswer(e.target.value)}
                placeholder="Answer the practice..."
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmitPractice) void handleSendPractice();
                }}
              />
              <button
                onClick={handleSendPractice}
                disabled={!canSubmitPractice}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid",
                  borderColor: canSubmitPractice ? "#007AFF" : "#ddd",
                  background: canSubmitPractice ? "#007AFF" : "#E5E5EA",
                  color: canSubmitPractice ? "white" : "#666",
                  cursor: canSubmitPractice ? "pointer" : "not-allowed",
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* Answer input */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <input
          ref={answerInputRef}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={
            !session 
              ? "Start a lesson first..." 
              : lessonCompleted
                ? "Lesson completed - restart or exit."
                : practiceActive
                  ? "Finish the practice above first..."
                  : "Type your answer..."}
          disabled={!session || loading || practiceActive || lessonCompleted}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 14,
            border: "1px solid #ddd",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmitAnswer && !practiceActive) void handleSendAnswer();
          }}
        />
        <button
          onClick={handleSendAnswer}
          disabled={!canSubmitAnswer}
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid",
            borderColor: canSubmitAnswer ? "#007AFF" : "#ddd",
            background: canSubmitAnswer ? "#007AFF" : "#E5E5EA",
            color: canSubmitAnswer ? "white" : "#666",
            cursor: canSubmitAnswer ? "pointer" : "not-allowed",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
