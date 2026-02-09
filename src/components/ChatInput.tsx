import { useState, useRef, type KeyboardEvent } from "react";
import styles from "./ChatInput.module.css";

interface Props {
  loading: boolean;
  onSend: (text: string) => void;
}

export default function ChatInput({ loading, onSend }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (!value.trim() || loading) return;
    onSend(value.trim());
    setValue("");
    inputRef.current?.focus();
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.bar}>
      <textarea
        ref={inputRef}
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Ask me about coffee…"
        rows={1}
        disabled={loading}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        className={styles.sendBtn}
        onClick={submit}
        disabled={loading || !value.trim()}
        aria-label="Send"
      >
        {loading ? (
          <span className={styles.spinner} />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
      </button>
    </div>
  );
}
