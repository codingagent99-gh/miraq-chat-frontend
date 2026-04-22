import type { ChatMessage } from "../types/api";

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
