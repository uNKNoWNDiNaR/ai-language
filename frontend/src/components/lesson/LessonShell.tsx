import type { ReactNode } from "react";

type LessonShellProps = {
  children: ReactNode;
};

export function LessonShell({ children }: LessonShellProps) {
  return (
    <div className="lessonPage">
      <style>{`
        * { box-sizing: border-box; }

        .lessonPage {
          min-height: 100vh;
          background: var(--app-bg-gradient, var(--bg));
          color: var(--text);
          font-family: inherit;
        }

        .lessonShell {
          max-width: 920px;
          margin: 0 auto;
          padding: 24px 18px 28px;
        }

        .lessonShell button {
          transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease,
            transform 0.1s ease;
        }

        .lessonShell button:active {
          transform: translateY(1px);
        }

        .lessonShell button:focus-visible,
        .lessonShell input:focus-visible,
        .lessonShell select:focus-visible {
          outline: 2px solid var(--accent-soft);
          outline-offset: 2px;
        }

        .lessonShell input:focus-visible,
        .lessonShell select:focus-visible {
          border-color: var(--accent-strong);
        }

        .fadeIn {
          animation: fadeInUp 0.4s ease both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

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

        .lessonHome {
          display: grid;
          gap: 16px;
        }

        .lessonHomeCard {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
          box-shadow: var(--shadow-sm);
        }

        .lessonHomeRow {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
        }

        .lessonHomeActionsRow {
          margin-top: 192px;
          justify-items: end;
          grid-template-columns: 1fr;
        }

        .lessonInfoGroup {
          display: flex;
          flex-wrap: nowrap;
          gap: 10px;
          align-items: center;
        }

        .lessonActionRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 8px;
        }

        .lessonActionCenter {
          justify-content: center;
          justify-self: end;
          margin-top: 0;
        }

        .lessonActionArea {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .lessonActionStack {
          display: flex;
          flex-direction: column;
          gap: 14px;
          align-items: stretch;
        }

        .lessonPrimaryBtn,
        .lessonSecondaryBtn {
          padding: 12px 20px;
          border-radius: 14px;
          border: 1px solid var(--border);
          font-size: 15px;
          cursor: pointer;
        }

        .lessonActionBtn {
          width: 240px;
          height: 36px;
          font-size: 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: normal;
          text-align: center;
          line-height: 1.1;
        }

        .lessonPrimaryBtn {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
          box-shadow: var(--shadow-sm);
        }

        .lessonPrimaryBtn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          background: var(--surface-muted);
          border-color: var(--border);
          color: var(--text-muted);
          box-shadow: none;
        }

        .lessonSecondaryBtn {
          background: white;
          color: var(--text);
        }

        .lessonSecondaryBtn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          background: var(--surface-muted);
        }

        .lessonCardTitle {
          font-weight: 600;
          margin-bottom: 4px;
        }

        .lessonCardMeta {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 10px;
        }

        .lessonInfoPill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface-muted);
          font-size: 13px;
          color: var(--text);
        }

        .lessonInfoIcon {
          font-size: 16px;
        }

        .lessonInfoText {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .lessonPrefsArea {
          justify-self: end;
          position: relative;
        }

        .lessonPrefsButton {
          width: 66px;
          height: 66px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface-muted);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
        }

        .lessonPrefsIcon {
          width: 30px;
          height: 30px;
        }

        .lessonActionBrand {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: var(--accent-soft);
          color: var(--accent-strong);
          font-weight: 700;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border);
        }

        .lessonPrefsMenu {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          min-width: 220px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          box-shadow: var(--shadow-md);
          display: grid;
          gap: 10px;
          z-index: 20;
        }

        .lessonPrefsField {
          display: grid;
          gap: 6px;
        }

        .lessonPrefsLabel {
          font-size: 12px;
          color: var(--text-muted);
        }

        .lessonPrefsSelect {
          width: 100%;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
        }

        .lessonPrefsAction {
          margin-top: 4px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: white;
          cursor: pointer;
          font-size: 13px;
          text-align: left;
        }

        .lessonPrefsAction:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .lessonPrefsActionWarm {
          background: #FFF3E0;
          color: #D97706;
          border-color: #F4C783;
        }

        .lessonPracticeBanner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid #C7DAFF;
          background: #EAF1FF;
          margin-bottom: 10px;
          box-shadow: var(--shadow-sm);
        }

        .lessonPracticeBannerText {
          font-size: 13px;
          color: #2F6BFF;
          font-weight: 600;
        }

        .lessonReviewBtn {
          border-color: #2F6BFF !important;
          background: #2F6BFF !important;
          color: white !important;
        }

        .lessonPracticeScreen {
          display: grid;
          gap: 12px;
          margin-bottom: 12px;
        }

        .lessonPracticeHeader {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .lessonPracticeTitle {
          font-weight: 600;
        }

        .lessonPracticeCue {
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
        }

        .lessonPracticeCue.required {
          background: #FFF3E0;
          color: #D97706;
          border: 1px solid #F4C783;
        }

        .lessonPracticeCue.review {
          background: #EAF1FF;
          color: #2F6BFF;
          border: 1px solid #C7DAFF;
        }

        .lessonPracticePanel {
          background: #F3F5FA;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
        }

        .lessonPracticeInline {
          background: #FFF3E0;
          border: 1px solid #F4C783;
          border-radius: 16px;
          padding: 6px;
        }

        .lessonRevealCard {
          max-width: 74%;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: var(--shadow-sm);
          display: grid;
          gap: 10px;
        }

        .lessonRevealLabel {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--text-muted);
          margin-bottom: 4px;
        }

        .lessonRevealAnswer {
          padding: 8px 10px;
          border-radius: 10px;
          background: var(--accent-soft);
          border: 1px dashed var(--accent);
        }

        .lessonError {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(220, 38, 38, 0.25);
          background: #FEECEC;
          color: #991b1b;
          font-size: 13px;
          margin-bottom: 12px;
        }
      `}</style>

      <div className="lessonShell">{children}</div>
    </div>
  );
}
