import { useState } from "react";
import styles from "./ChatHeader.module.css";

interface Props {
  onClear: () => void;
  userEmail?: string;
  onEmailUpdate: (email: string) => void;
}

export default function ChatHeader({
  onClear,
  userEmail,
  onEmailUpdate,
}: Props) {
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [tempEmail, setTempEmail] = useState(userEmail || "");

  const handleEmailSave = () => {
    if (tempEmail.includes("@")) {
      onEmailUpdate(tempEmail);
      setShowEmailInput(false);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {/* <span className={styles.icon}>☕</span> */}
        <div>
          <h1 className={styles.title}>Coffee Assistant</h1>
          {/* <p className={styles.sub}>Your personal assistant</p> */}
        </div>
      </div>

      <div className={styles.actions}>
        {/* Email button */}
        <button
          className={styles.emailBtn}
          onClick={() => setShowEmailInput(!showEmailInput)}
          title={
            userEmail ? `Email: ${userEmail}` : "Set email for order history"
          }
        >
          {userEmail ? "✅" : "📧"}
        </button>

        {/* Clear button */}
        <button
          className={styles.clearBtn}
          onClick={onClear}
          title="Clear conversation"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>

      {/* Email input popup */}
      {showEmailInput && (
        <div className={styles.emailPopup}>
          <input
            type="email"
            className={styles.emailInput}
            placeholder="your@email.com"
            value={tempEmail}
            onChange={(e) => setTempEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEmailSave()}
            autoFocus
          />
          <button className={styles.emailSaveBtn} onClick={handleEmailSave}>
            Save
          </button>
        </div>
      )}
    </header>
  );
}
