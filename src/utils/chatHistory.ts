import type { ChatMessage } from "../types/api";

// 🚀 Increased from 20 to 500!
// This allows users to scroll up and load massive amounts of history
// without the app secretly deleting older messages to save space,
// while still protecting the browser from crashing if a session gets absurdly long.
const MAX_MESSAGES = 500;

/**
 * Pure function: append newMsgs to prev, then slice to keep only the last MAX_MESSAGES.
 */
export function enqueuMessages(
  prev: ChatMessage[],
  ...newMsgs: ChatMessage[]
): ChatMessage[] {
  return [...prev, ...newMsgs].slice(-MAX_MESSAGES);
}
