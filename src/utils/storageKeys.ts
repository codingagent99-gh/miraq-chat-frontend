/**
 * Browser-storage keys used by the widget.
 *
 * None of them contain anything that identifies the shopper — no customer
 * ID, no email, in the key or the value. Two shoppers on one browser are
 * kept apart by the backend instead: it never hands one customer's
 * conversation to another (routes/chat.py starts a fresh one), and
 * /chat/history only returns a conversation to the customer who owns it.
 */
export const SESSION_KEY = "shop_chat_session_id"; // localStorage: current conversation id
export const AI_ENABLED_KEY = "silfra_ai_enabled"; // localStorage: "true" / "false"
export const SCREEN_KEY = "silfra_screen"; // sessionStorage: last widget screen
export const CHAT_ACTIVE_KEY = "silfra_chat_active"; // sessionStorage: time of the last chat turn (ms)

/**
 * "Mid-conversation in this visit" for the welcome screen (requirements
 * FR-1.3): a chat turn in this tab within the last 30 minutes — the same gap
 * the backend uses to tell visits apart (services/whats_new.VISIT_GAP). Only a
 * timestamp is stored; nothing about the shopper.
 */
const CHAT_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export function markChatActive(): void {
  try {
    sessionStorage.setItem(CHAT_ACTIVE_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — the welcome screen just shows more often
  }
}

export function isChatActive(): boolean {
  try {
    const t = Number(sessionStorage.getItem(CHAT_ACTIVE_KEY));
    return t > 0 && Date.now() - t < CHAT_ACTIVE_WINDOW_MS;
  } catch {
    return false;
  }
}

// Older builds put the customer ID (or email) into key names:
//   shop_chat_session_id_<customerId or email>
//   silfra_ai_enabled_<customerId or email or "guest">
//   silfra_screen_<customerId or email or "guest">   (sessionStorage)
//   shop_chat_email                                   (the email itself)
const LEGACY_LOCAL_PREFIXES = [`${SESSION_KEY}_`, `${AI_ENABLED_KEY}_`];
const LEGACY_LOCAL_KEYS = ["shop_chat_email"];
const LEGACY_SESSION_PREFIXES = [`${SCREEN_KEY}_`];

function keysOf(store: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null) out.push(k);
  }
  return out;
}

/** Move the current shopper's own old value to the new key, if any. */
function carryOver(store: Storage, oldKey: string, newKey: string): void {
  const v = store.getItem(oldKey);
  if (v !== null) store.setItem(newKey, v);
}

/**
 * Delete every identity-bearing key left by older builds. The shopper on the
 * page now keeps their own place (conversation, AI choice, screen): their old
 * values move to the new keys first. Everyone else's are simply removed.
 * Runs once per page load, before the widget reads storage. Never throws.
 */
export function purgeLegacyIdentityKeys(
  customerId?: number | string,
  customerEmail?: string,
): void {
  // The exact owner suffixes the old builds computed (`??` keeps "", so a
  // guest's old keys ended in "_" / had no suffix at all).
  const sessionOwner = customerId ?? customerEmail;
  const prefOwner = customerId ?? customerEmail ?? "guest";
  try {
    if (sessionOwner) {
      carryOver(localStorage, `${SESSION_KEY}_${sessionOwner}`, SESSION_KEY);
    }
    carryOver(localStorage, `${AI_ENABLED_KEY}_${prefOwner}`, AI_ENABLED_KEY);
    for (const k of keysOf(localStorage)) {
      if (
        LEGACY_LOCAL_KEYS.includes(k) ||
        LEGACY_LOCAL_PREFIXES.some((p) => k.startsWith(p))
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // localStorage unavailable (privacy mode, blocked) — nothing to clean.
  }
  try {
    carryOver(sessionStorage, `${SCREEN_KEY}_${prefOwner}`, SCREEN_KEY);
    for (const k of keysOf(sessionStorage)) {
      if (LEGACY_SESSION_PREFIXES.some((p) => k.startsWith(p))) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // sessionStorage unavailable — nothing to clean.
  }
}
