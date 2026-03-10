import type { ChatMessage } from "../types/api";

const HISTORY_KEY = "shop_chat_history";
const MAX_MESSAGES = 20;
const FULL_PAYLOAD_TAIL = 4; // keep rich data on last N messages only

/** Fields stripped from older messages to keep storage compact. */
const HEAVY_FIELDS: (keyof ChatMessage)[] = [
  "products",
  "orders",
  "cart",
  "purchase_info",
  "pagination",
  "orderPagination",
  "filterSuggestions",
  "suggestions",
  "paymentUrl",
];

/** Returns true when sessionStorage is accessible (guards against SSR / private browsing). */
export function isSessionStorageAvailable(): boolean {
  try {
    const testKey = "__ss_test__";
    sessionStorage.setItem(testKey, "1");
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read chat history from sessionStorage.
 * Returns [] on missing or corrupt data.
 * Revives `timestamp` strings back to Date objects.
 */
export function loadChatHistory(): ChatMessage[] {
  if (!isSessionStorageAvailable()) return [];
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((msg) => ({
      ...msg,
      timestamp: new Date(msg.timestamp as unknown as string),
    }));
  } catch {
    return [];
  }
}

/**
 * Persist messages to sessionStorage, enforcing the 20-message FIFO cap.
 * Strips heavy payload fields from all but the last FULL_PAYLOAD_TAIL messages
 * to keep storage compact.
 * Silently ignores QuotaExceededError and other storage errors.
 */
export function saveChatHistory(messages: ChatMessage[]): void {
  if (!isSessionStorageAvailable()) return;
  try {
    const capped = messages.slice(-MAX_MESSAGES);
    const tailStart = Math.max(0, capped.length - FULL_PAYLOAD_TAIL);
    const toStore = capped.map((msg, idx) => {
      if (idx >= tailStart) return msg;
      // Strip heavy fields from older messages
      const slim = { ...msg } as Partial<ChatMessage>;
      for (const field of HEAVY_FIELDS) {
        delete slim[field];
      }
      // All HEAVY_FIELDS are optional in ChatMessage, so the cast is safe
      return slim as ChatMessage;
    });
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(toStore));
  } catch (err) {
    // Silently suppress all storage errors (QuotaExceededError, SecurityError,
    // InvalidStateError, etc.) — chat history is best-effort and non-critical.
    void err;
  }
}

/** Remove the history key from sessionStorage. */
export function clearChatHistory(): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

/**
 * Pure function: append newMsgs to prev, then slice to keep only the last
 * MAX_MESSAGES entries (FIFO — oldest drop off the front).
 */
export function enqueuMessages(
  prev: ChatMessage[],
  ...newMsgs: ChatMessage[]
): ChatMessage[] {
  return [...prev, ...newMsgs].slice(-MAX_MESSAGES);
}
