import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "../types/api";
import { sendChat, clearHistory } from "../services/api";

const SESSION_KEY = "coffee_chat_session_id";
const EMAIL_KEY = "coffee_chat_email";

function loadSessionId(): string | undefined {
  return sessionStorage.getItem(SESSION_KEY) ?? undefined;
}
function saveSessionId(id: string) {
  sessionStorage.setItem(SESSION_KEY, id);
}

function loadEmail(): string | undefined {
  return localStorage.getItem(EMAIL_KEY) ?? undefined;
}
function saveEmail(email: string) {
  localStorage.setItem(EMAIL_KEY, email);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(loadEmail());
  const sessionIdRef = useRef<string | undefined>(loadSessionId());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /* auto-scroll */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* update email */
  const updateEmail = useCallback((email: string) => {
    setUserEmail(email);
    saveEmail(email);
  }, []);

  /* ── send ── */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);

      /* optimistic user bubble */
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await sendChat({
          message: text.trim(),
          session_id: sessionIdRef.current,
          user_context: userEmail ? { email: userEmail } : undefined,
        });

        /* persist session */
        if (res.session_id) {
          sessionIdRef.current = res.session_id;
          saveSessionId(res.session_id);
        }

        const botMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: res.bot_message,
          products: res.products?.length ? res.products : undefined,
          orders: res.orders?.length ? res.orders : undefined,
          purchase_info: res.purchase_info,
          intent: res.intent,
          suggestions: res.suggestions?.length ? res.suggestions : undefined,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(detail);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: `Oops — ${detail}. Please try again.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [userEmail],
  );

  /* ── clear ── */
  const clearAll = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await clearHistory(sessionIdRef.current);
      } catch (_e) {
        /* best-effort */
      }
    }
    setMessages([]);
    sessionIdRef.current = undefined;
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  return {
    messages,
    loading,
    error,
    userEmail,
    updateEmail,
    sendMessage,
    clearAll,
    bottomRef,
  };
}
