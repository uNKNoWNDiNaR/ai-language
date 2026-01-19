// frontend/src/components/Lesson.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { startLesson, submitAnswer, getSession } from "../api/lessonAPI";
import type { BackendSession, Evaluation, Progress, ProgressStatus } from "../api/lessonAPI";

type Message = {
  sender: "tutor" | "student";
  text: string;
};

type ResumeChoiceState =
  | { mode: "none" }
  | { mode: "choice"; existing: BackendSession };

const Lesson: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [tutorNameInput, setTutorNameInput] = useState("");
  const [tutorName, setTutorName] = useState("Tutor");
  const [language, setLanguage] = useState("en");
  const [lessonId, setLessonId] = useState("basic-1");

  const [sessionStarted, setSessionStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answer, setAnswer] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const [resumeState, setResumeState] = useState<ResumeChoiceState>({ mode: "none" });

  // Phase 2.2 UI state driven by backend (optional)
  const [progress, setProgress] = useState<Progress | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendLoading]);

  useEffect(() => {
    if (sessionStarted) {
      answerInputRef.current?.focus();
    }
  }, [sessionStarted]);

  const languageLabel = useMemo(() => {
    switch (language) {
      case "de":
        return "German";
      case "es":
        return "Spanish";
      case "fr":
        return "French";
      default:
        return "English";
    }
  }, [language]);

  const lessonLabel = useMemo(() => {
    switch (lessonId) {
      case "basic-2":
        return "Basic Lesson 2";
      default:
        return "Basic Lesson 1";
    }
  }, [lessonId]);

  const computedProgress = useMemo(() => {
    // Prefer backend progress if available
    if (progress) return progress;

    // Fallback for older backend: show minimal progress using session messages if possible
    // (We only know current index; total is unknown without backend progress)
    // Keep calm and avoid misleading totals.
    return null;
  }, [progress]);

  const statusLabel = (p: ProgressStatus) => {
    if (p === "completed") return "✅ completed";
    if (p === "needs_review") return "🔁 needs review";
    return "⏳ in progress";
  };

  const mapReasonToGuidance = (evaluation?: Evaluation): string | null => {
    if (!evaluation) return null;

    if (evaluation.result === "correct") return null;

    const base =
      evaluation.result === "almost"
        ? "Almost — you're close."
        : "Not quite — let’s try again.";

    const reason = (evaluation.reasonCode || "").toUpperCase();

    switch (reason) {
      case "ARTICLE":
        return `${base} Watch the article.`;
      case "WORD_ORDER":
        return `${base} Check the word order.`;
      case "WRONG_LANGUAGE":
        return `${base} Answer in the selected language.`;
      case "SPELLING":
        return `${base} Check the spelling.`;
      case "PUNCTUATION":
        return `${base} Watch punctuation.`;
      default:
        return base;
    }
  };

  const pushTutorBubble = (text: string) => {
    setMessages((prev) => [...prev, { sender: "tutor", text }]);
  };

  const restoreMessagesFromSession = (session: BackendSession) => {
    const restored: Message[] = session.messages.map((m) => ({
      sender: m.role === "assistant" ? "tutor" : "student",
      text: m.content,
    }));
    setMessages(restored);
  };

  // --------------------------------
  // Start flow (with resume choice)
  // --------------------------------
  const handleStartClicked = async () => {
    setErrorMessage(null);
    const cleanUserId = userId.trim();
    if (!cleanUserId) {
      setErrorMessage("Please enter a User ID to start or resume.");
      return;
    }

    setTutorName(tutorNameInput.trim() || "Tutor");

    // Phase 2.2 resume: if progress exists, offer Continue/Restart
    // We detect existing session via GET.
    setStartLoading(true);
    try {
      const existing = await getSession(cleanUserId);

      const looksResumable =
        existing &&
        existing.messages &&
        existing.messages.length > 0 &&
        (existing.lessonId ? existing.lessonId === lessonId : true) &&
        (existing.language ? existing.language === language : true);

      if (looksResumable) {
        setResumeState({ mode: "choice", existing });
        return;
      }

      // No resumable session => normal start
      await startFreshOrContinue({ restart: false });
    } catch (e) {
      // If session fetch fails, still allow starting
      await startFreshOrContinue({ restart: false });
    } finally {
      setStartLoading(false);
    }
  };

  const startFreshOrContinue = async (options: { restart: boolean }) => {
    setErrorMessage(null);
    const cleanUserId = userId.trim();
    if (!cleanUserId) return;

    const res = await startLesson(cleanUserId, language, lessonId, options.restart ? { restart: true } : undefined);

    // Restore messages from backend session
    const restored: Message[] = res.session.messages.map((m) => ({
      sender: m.role === "assistant" ? "tutor" : "student",
      text: m.content,
    }));

    // Tutor speaks first: if backend provides tutorMessage but session messages are empty, show it
    if (restored.length === 0 && res.tutorMessage) {
      restored.push({ sender: "tutor", text: res.tutorMessage });
    }

    setMessages(restored);
    setProgress(res.progress ?? null);
    setSessionStarted(true);
    setResumeState({ mode: "none" });
  };

  const handleContinueResume = async () => {
    if (resumeState.mode !== "choice") return;

    // Continue where left off: use stored session messages
    restoreMessagesFromSession(resumeState.existing);
    setSessionStarted(true);
    setResumeState({ mode: "none" });
  };

  const handleRestartLesson = async () => {
    // Restart requires backend support. We send restart:true.
    // If backend ignores it, you should add restart support server-side; UI stays calm regardless.
    setStartLoading(true);
    try {
      await startFreshOrContinue({ restart: true });
    } catch {
      setErrorMessage("Could not restart right now. Please try again.");
    } finally {
      setStartLoading(false);
    }
  };

  // --------------------
  // Submit answer (Phase 2.2 feedback pipeline)
  // --------------------
  const handleSubmitAnswer = async () => {
    const clean = answer.trim();
    if (!clean || sendLoading) return;

    setErrorMessage(null);
    setSendLoading(true);

    // Immediate student echo
    setMessages((prev) => [...prev, { sender: "student", text: clean }]);
    setAnswer("");

    try {
      const res = await submitAnswer(userId.trim(), language, lessonId, clean);

      // 1) Reason-based retry feedback (only when backend provides evaluation)
      const guidance = mapReasonToGuidance(res.evaluation);
      if (guidance) {
        pushTutorBubble(guidance);
      }

      // 2) Hint display (only when backend sends hint)
      // Attempt 2 => light hint, Attempt 3+ => stronger hint, final attempt => answer/explanation (backend decides)
      if (res.hint && res.hint.text) {
        const hintPrefix =
          res.hint.level >= 3 ? "Hint (strong): " : "Hint: ";
        pushTutorBubble(`${hintPrefix}${res.hint.text}`);
      }

      // 3) Tutor message (normal AI flow)
      pushTutorBubble(res.tutorMessage);

      // 4) Progress update (if provided)
      setProgress(res.progress ?? null);
    } catch (err) {
      console.error(err);
      setErrorMessage("Could not send your message right now. Please try again.");
    } finally {
      setSendLoading(false);
    }
  };

  const handleComposerKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmitAnswer();
    }
  };

  // Lesson completion (prefer progress, fallback to tutor message text)
  const lessonComplete =
    computedProgress?.status === "completed" ||
    messages.some(
      (msg) =>
        msg.sender === "tutor" &&
        msg.text.toLowerCase().includes("completed this lesson")
    );

  const progressLine = (() => {
    if (!computedProgress) return null;
    return `Question ${computedProgress.current} of ${computedProgress.total}`;
  })();

  const statusLine = (() => {
    if (!computedProgress) return null;
    return statusLabel(computedProgress.status);
  })();

  // --------------------
  // Render
  // --------------------
  return (
    <div>
      {!sessionStarted ? (
        <section className="card">
          <h2 className="sectionTitle">Start lesson</h2>

          <div className="formGrid">
            <input
              className="input"
              type="text"
              placeholder="Enter your user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="off"
            />

            <input
              className="input"
              type="text"
              placeholder="Tutor name (optional)"
              value={tutorNameInput}
              onChange={(e) => setTutorNameInput(e.target.value)}
              autoComplete="off"
            />

            <select
              className="select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
            </select>

            <select
              className="select"
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
            >
              <option value="basic-1">Basic Lesson 1</option>
              <option value="basic-2">Basic Lesson 2</option>
            </select>

            {errorMessage && <div className="error">{errorMessage}</div>}

            {resumeState.mode === "choice" ? (
              <div className="resumeBox">
                <div className="resumeTitle">We found your previous progress.</div>
                <div className="resumeActions">
                  <button className="button" onClick={handleContinueResume} disabled={startLoading}>
                    Continue where you left off
                  </button>
                  <button className="button buttonSecondary" onClick={handleRestartLesson} disabled={startLoading}>
                    Restart lesson
                  </button>
                </div>
              </div>
            ) : (
              <button className="button" onClick={handleStartClicked} disabled={startLoading}>
                {startLoading ? "Starting..." : "Start lesson"}
              </button>
            )}

            <div className="helper">
              Tip: using the same User ID resumes your session.
            </div>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="chatHeader">
            <div>
              <h2 className="sectionTitle">Lesson chat</h2>
              <div className="chatMeta">
                {languageLabel} · {lessonLabel}
                {progressLine ? ` · ${progressLine}` : ""}
                {statusLine ? ` · ${statusLine}` : ""}
              </div>
            </div>

            <button
              className="button buttonSecondary"
              onClick={() => {
                setSessionStarted(false);
                setMessages([]);
                setAnswer("");
                setErrorMessage(null);
                setProgress(null);
                setResumeState({ mode: "none" });
              }}
            >
              Exit
            </button>
          </div>

          {errorMessage && <div className="error">{errorMessage}</div>}

          <div className="chatWindow" aria-live="polite">
            {messages.map((msg, index) => {
              const prev = messages[index - 1];
              const isGrouped = prev && prev.sender === msg.sender;

              return (
              <div key={index} className={`bubbleRow ${msg.sender} ${isGrouped ? "grouped" : ""}`}>
                <div className={`bubble ${msg.sender}`}>
                  {!isGrouped && (
                  <div className="bubbleName">
                    {msg.sender === "tutor" ? tutorName : userId}
                  </div>
                  )}
                  <div className="bubbleText">{msg.text}</div>
                </div>
              </div>
              );
            })}

            {sendLoading && (
              <div className="bubbleRow tutor grouped">
                <div className="bubble tutor">
                  <div className="bubbleText">{(tutorName || "Tutor" )} is Typing...</div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <a
            className="footerLink"
            href="https://forms.gle/TUTGu4z68fUcECfu8"
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Give feedback
          </a>

          {lessonComplete ? (
            <div className="endState">
              <div>
                <div style={{ fontWeight: 700 }}>Lesson finished.</div>
                <div className="helper">Great work — you can restart anytime.</div>
              </div>

              <button
                className="button buttonSecondary"
                onClick={() => {
                  setSessionStarted(false);
                  setMessages([]);
                  setAnswer("");
                  setErrorMessage(null);
                  setProgress(null);
                  setUserId("");
                  setTutorNameInput("");
                  setTutorName("Tutor");
                  setResumeState({ mode: "none" });
                }}
              >
                Start new lesson
              </button>
            </div>
          ) : (
            <div className="composer">
              <input
                ref={answerInputRef}
                className="input composerInput"
                type="text"
                placeholder="Type your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={sendLoading}
                autoComplete="off"
              />
              <button
                className="button"
                onClick={handleSubmitAnswer}
                disabled={sendLoading || !answer.trim()}
              >
                Send
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Lesson;
