import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { pluginApiUrl } from "../utils/pluginApi";
import type {
  ChatMessage,
  FlowContext,
  ChatResponse,
  PaginationData,
  FilterSuggestion,
  HistoryResponse,
  HistorySearchResponse,
} from "../types/api";
import type { ChatAction } from "../types/actions";
import { createApiClient } from "../services/api";
import { isFlowPrompt, buildFlowContext } from "../utils/flow";
import { enqueuMessages } from "../utils/chatHistory";

// 🚀 Shifted to localStorage so sessions survive tab closes
const SESSION_KEY_PREFIX = "shop_chat_session_id";
const EMAIL_KEY = "shop_chat_email";

// ── Scroll diagnostics (temporary) ─────────────────────────────────────────
// Off unless the tester runs, in the store page's console:
//   localStorage.setItem("miraq_debug_scroll", "1"); location.reload();
// Turn off with localStorage.removeItem("miraq_debug_scroll").
// Safe to ship: when the flag is absent nothing below runs.
const SCROLL_DEBUG = (() => {
  try {
    return localStorage.getItem("miraq_debug_scroll") === "1";
  } catch {
    return false;
  }
})();
// Bump when the scroll code changes, so the log proves which bundle loaded.
const SCROLL_BUILD = "scroll-anchor-v3";
function scrollDebug(...args: unknown[]) {
  if (SCROLL_DEBUG) console.log("[MiraQ scroll]", ...args);
}
function scrollSnapshot(el: HTMLElement | null) {
  if (!el) return { container: "NOT FOUND" };
  return {
    top: Math.round(el.scrollTop),
    height: el.scrollHeight,
    client: el.clientHeight,
  };
}
// CSS that changes how a programmatic scrollTop assignment behaves. A store
// theme can set these on our container (or on *), which a bare local test
// page never does.
function scrollStyles(el: HTMLElement | null) {
  if (!el) return {};
  const c = getComputedStyle(el);
  return {
    containerScrollBehavior: c.scrollBehavior,
    containerOverflowAnchor: (c as any).overflowAnchor,
    containerOverflowY: c.overflowY,
    htmlScrollBehavior: getComputedStyle(document.documentElement)
      .scrollBehavior,
    bodyScrollBehavior: getComputedStyle(document.body).scrollBehavior,
  };
}
// After a restore, report every change to the container's position or height
// for 2s — catches late image loads and anything else that moves the view.
function watchScroll(el: HTMLElement, label: string) {
  if (!SCROLL_DEBUG) return;
  const start = performance.now();
  let last = `${el.scrollTop}|${el.scrollHeight}`;
  const tick = () => {
    const now = `${el.scrollTop}|${el.scrollHeight}`;
    const ms = Math.round(performance.now() - start);
    if (now !== last) {
      scrollDebug(`${label} +${ms}ms changed`, scrollSnapshot(el));
      last = now;
    }
    if (ms < 2000) requestAnimationFrame(tick);
    else scrollDebug(`${label} watch end`, scrollSnapshot(el));
  };
  requestAnimationFrame(tick);
}
if (SCROLL_DEBUG) console.log("[MiraQ scroll] debug on | build:", SCROLL_BUILD);

/**
 * User-facing text for a failed request.
 *
 * NEVER surfaces the raw Error.message. On an axios failure that message is
 * "Request failed with status code 500", which is what the chat was showing
 * the user — an HTTP status code is not an explanation, and it hid the fact
 * that the backend already sends a written reason in the 500 body. So:
 * prefer the server's own bot_message, then fall back to something a shopper
 * can act on.
 *
 * 429 is not handled here — handleDailyLimit intercepts it before this runs.
 */
function friendlyError(err: unknown, fallback?: string): string {
  const response = (err as any)?.response;

  const fromServer = response?.data?.bot_message;
  if (typeof fromServer === "string" && fromServer.trim()) {
    return fromServer.trim();
  }

  // No response at all — request never completed (offline, DNS, CORS, timeout).
  if (!response) {
    return "I couldn't reach the server. Check your connection and try again.";
  }

  const status = response.status;
  if (typeof status === "number" && status >= 500) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  return fallback || "Something went wrong. Please try again.";
}

/**
 * Friendly bubble text for a message carrying a structured card payload.
 *
 * Cards submit "__SENTINEL__<json>" so the backend flow handlers receive exact
 * data. That raw string is what gets sent and stored, but it is not what the
 * user meant to say, so it never appears in the transcript. `_display_message`
 * in routes/chat.py performs the same rewrite when history is replayed — the
 * two must stay in step or a reload will change how a turn reads.
 *
 * Anything unrecognised is returned untouched.
 */
function describeSentinel(text: string): string {
  if (text.startsWith("__DATE_RANGE__")) {
    try {
      const payload = JSON.parse(text.slice("__DATE_RANGE__".length) || "{}");
      if (payload?.all_time) return "📅 All time";
      if (payload?.after && payload?.before) {
        return `📅 ${payload.after} to ${payload.before}`;
      }
    } catch {
      /* fall through to the generic label */
    }
    return "📅 Selected a date range";
  }
  if (text.startsWith("__BULK_ADDR__")) {
    return "✏️ Updated billing & shipping address";
  }
  return text;
}

/**
 * Rebuilds a ChatMessage from a `/chat/history` row.
 *
 * This must stay in sync with the live-response builder in
 * `processChatResponse` below. Previously this only copied a handful of
 * fields (products/categories/suggestions/actions/metadata), silently
 * dropping `orders` and `allowOrderDownload` — so any order list (and its
 * CSV download button) that a user saw during a live turn would vanish the
 * moment the widget remounted and rehydrated from history (e.g. navigating
 * to another page on the site). `cart`/`paymentUrl`/pagination/etc. were
 * dropped too, for the same reason.
 */
function mapHistoryEntryToMessage(m: any): ChatMessage {
  return {
    id: uuidv4(),
    dbId: typeof m.id === "number" ? m.id : undefined,
    role: m.role,
    text: m.message,
    intent: m.intent,
    timestamp: new Date(m.timestamp),
    products: m.products,
    orders: m.orders,
    purchase_info: m.purchase_info,
    categories: m.categories,
    suggestions: m.suggestions,
    filterSuggestions: m.filter_suggestions,
    actions: m.actions,
    metadata: m.metadata,
    cart: m.cart,
    paymentUrl: m.payment_url,
    pagination: m.pagination,
    orderPagination: m.order_pagination,
    variantOptions: m.variant_options,
    // Backend stores this the same place it does on a live response
    // (`metadata.allow_order_download`) — but history rows may also send it
    // top-level, so check both rather than assume.
    allowOrderDownload:
      m.metadata?.allow_order_download === true ||
      m.allow_order_download === true,
  };
}

/**
 * Set while the message list shows a slice loaded around a search hit
 * (/chat/history/window) rather than the tail of the current session.
 * Older pages then come by message-id cursor instead of /chat/history page
 * numbers, and newer pages load as the user scrolls down.
 */
interface HistoryView {
  conversationId: string;
  /** Newer messages exist below the loaded slice */
  hasMoreAfter: boolean;
}

/** Messages per /chat/history/window request around a search hit */
const JUMP_WINDOW_SIZE = 30;

function sessionKey(userId?: string | number): string {
  return userId ? `${SESSION_KEY_PREFIX}_${userId}` : SESSION_KEY_PREFIX;
}

function loadSessionId(userId?: string | number): string | undefined {
  return localStorage.getItem(sessionKey(userId)) ?? undefined;
}
function saveSessionId(id: string, userId?: string | number) {
  localStorage.setItem(sessionKey(userId), id);
}

function loadEmail(): string | undefined {
  return localStorage.getItem(EMAIL_KEY) ?? undefined;
}
function saveEmail(email: string) {
  localStorage.setItem(EMAIL_KEY, email);
}

export interface UseChatOptions {
  apiUrl?: string;
  apiKey?: string;
  customerId?: number;
  customerEmail?: string;
  customerRole?: string;
  platform?: "shopify" | "woocommerce";
  nonce?: string;
  nonceExpires?: number;
  cartToken?: string;
  /** WP site origin from the injected config (see WidgetOptions.wpBaseUrl). */
  wpBaseUrl?: string;
  /** Tenant identifier from the injected config (see WidgetOptions.licenseId). */
  licenseId?: string;
  onViewCart?: () => void;
  onAddToCart?: (
    productId: number,
    quantity: number,
    variationId?: number,
    variationAttributes?: { attribute: string; value: string }[],
  ) => Promise<void>;
  /** New actions envelope callback — called when `response.actions` is non-empty.
   *  When this fires, the legacy `trigger_frontend_*` handling is skipped. */
  onActions?: (actions: ChatAction[]) => void;
  /** Called with SHOW_BULK_ORDER_BUTTON / SHOW_RECENTLY_ORDERED_BUTTON */
  onPersistentActions?: (actions: ChatAction[]) => void;
  /** Called after add-to-cart so ChatWidget can surface the similar products prompt. */
  onSimilarProductsPrompt?: (id: number, name: string) => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "bot",
  text: "How can I help?",
  timestamp: new Date(),
};

export function useChat(options: UseChatOptions = {}) {
  const userId = options.customerId ?? options.customerEmail;

  // 🚀 Start with an empty array. The useEffect will load the history.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(
    options.customerEmail || loadEmail(),
  );

  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [orderPagination, setOrderPagination] = useState<PaginationData | null>(
    null,
  );
  const [dailyLimitHit, setDailyLimitHit] = useState(false);
  const [limitResetAt, setLimitResetAt] = useState<string | null>(null);
  // Set on a 400/404 tenant-config error from /chat (missing/unrecognized
  // license). Never cleared automatically — it's a config bug, not a
  // transient state — so ServerDownOverlay can show it distinctly instead
  // of implying the usual auto-retry.
  const [tenantConfigError, setTenantConfigError] = useState<string | null>(
    null,
  );
  const lastQueryRef = useRef<string | null>(null);
  // The filter chip behind the current product list, if it came from one.
  // Page 1 of a chip is answered by the suggestion_retry path, not by
  // re-classifying the label — so later pages must send the same payload.
  const lastSuggestionRetryRef = useRef<FilterSuggestion | null>(null);

  // State Variables for History Pagination
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Synchronous twin of loadingHistory. The state value only changes on the
  // next render, and a fast scroll fires several scroll events before that —
  // each one saw loadingHistory=false and requested the same page again, so
  // its messages were prepended twice and the view jumped. The ref flips
  // immediately, so only one request per page can be in flight.
  const historyInFlightRef = useRef(false);

  // ── Search jump state (see HistoryView) ──
  // The ref is what async callbacks read; the state drives rendering.
  const [historyView, setHistoryView] = useState<HistoryView | null>(null);
  const historyViewRef = useRef<HistoryView | null>(null);
  const updateHistoryView = useCallback((v: HistoryView | null) => {
    historyViewRef.current = v;
    setHistoryView(v);
  }, []);
  // Bumped whenever the list is replaced wholesale (jump, back to latest,
  // user change). A history request that started under an older generation
  // is discarded on arrival, so a slow page can't land in the wrong list.
  const viewGenRef = useRef(0);
  const [loadingNewerHistory, setLoadingNewerHistory] = useState(false);
  const newerInFlightRef = useRef(false);
  // Client id of the search hit to centre once the jumped-to slice renders.
  const pendingJumpRef = useRef<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionIdRef = useRef<string>(loadSessionId(userId) ?? uuidv4());

  const prevUserIdRef = useRef<string | number | undefined>(userId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // DOM nodes for each rendered message, keyed by message id — lets us find
  // and scroll to a specific message rather than always the container bottom.
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prevMessagesLengthRef = useRef(0);
  const flowRef = useRef<FlowContext>({ flow_state: "idle" });

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const justLoadedHistoryRef = useRef(false);
  // Scroll position captured just before older history is prepended, so the
  // view can stay on the message the user was reading (see the layout effect
  // below). null when no prepend is pending.
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);

  const apiRef = useRef(
    createApiClient(options.apiUrl, options.apiKey, options.licenseId),
  );

  // ── Nonce state for WooCommerce Store API ──
  const nonceRef = useRef<string>(options.nonce ?? "");
  const nonceExpiresRef = useRef<number>(options.nonceExpires ?? 0);
  const cartTokenRef = useRef<string>(options.cartToken ?? "");
  // Site URL: runtime config first (one bundle, any install), then the dev-only
  // Vite var, then the current origin — the widget normally runs ON the WP site.
  const siteOrigin =
    options.wpBaseUrl ||
    import.meta.env.VITE_WP_BASE_URL ||
    window.location.origin;

  const getFreshNonce = useCallback(async (): Promise<string> => {
    // 1-minute buffer before actual expiry
    if (Date.now() < nonceExpiresRef.current - 60_000) {
      return nonceRef.current;
    }
    // Expired — hit the WP refresh endpoint
    try {
      const res = await fetch(pluginApiUrl(siteOrigin, "/refresh-nonce"), {
        credentials: "include",
      });
      const data = await res.json();
      nonceRef.current = data.nonce;
      nonceExpiresRef.current = data.expires;
    } catch (e) {
      console.warn("[MiraQ] Nonce refresh failed, using stale nonce", e);
    }
    return nonceRef.current;
  }, [siteOrigin]);

  const storeApiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const nonce = await getFreshNonce();

      const response = await fetch(`${siteOrigin}/wp-json/wc/store/v1${path}`, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Nonce: nonce,
          "Cart-Token": cartTokenRef.current,
          ...(init.headers ?? {}),
        },
      });

      // WooCommerce returns a fresh nonce on every response — capture it
      const freshNonce = response.headers.get("Nonce");
      if (freshNonce) {
        nonceRef.current = freshNonce;
        nonceExpiresRef.current = Date.now() + 12 * 60 * 60 * 1000;
      }

      const freshCartToken = response.headers.get("Cart-Token");
      if (freshCartToken) {
        cartTokenRef.current = freshCartToken;
      }

      return response;
    },
    [getFreshNonce, siteOrigin],
  );

  // ── LATEST PAGE OF THE CURRENT SESSION ──
  // Used on mount / user change, and by returnToLatest to leave a search jump.
  const fetchLatestHistory = useCallback(async () => {
    const gen = ++viewGenRef.current;
    updateHistoryView(null);
    setLoading(true);
    try {
      const res = await apiRef.current.fetchHistory(
        sessionIdRef.current,
        1,
        undefined,
        options.customerId,
      );
      if (gen !== viewGenRef.current) return;
      console.log("[MiraQ DEBUG] fetchHistory on mount", {
        sessionId: sessionIdRef.current,
        messageCount: res.messages?.length,
      });
      if (res.messages && res.messages.length > 0) {
        // Rebuild React message objects from DB rows
        const formattedHistory: ChatMessage[] = res.messages.map(
          mapHistoryEntryToMessage,
        );
        setMessages(formattedHistory);
        setHasMoreHistory(res.has_more);
        if (res.next_page) setHistoryPage(res.next_page);
      } else {
        setMessages([WELCOME_MESSAGE]); // Fresh chat
      }
    } catch (err) {
      if (gen !== viewGenRef.current) return;
      console.error("Failed to fetch database history", err);
      setMessages([WELCOME_MESSAGE]); // Fallback on network error
    } finally {
      setLoading(false);
    }
  }, [options.customerId, updateHistoryView]);

  // ── INITIAL CHAT HISTORY FROM POSTGRES ──
  useEffect(() => {
    if (!userId) return;
    const prevUserId = prevUserIdRef.current;

    // If the user changed (e.g., they logged in), reset the session anchor
    if (prevUserId !== userId) {
      prevUserIdRef.current = userId;
      sessionIdRef.current = loadSessionId(userId) ?? uuidv4();
      saveSessionId(sessionIdRef.current, userId);
      flowRef.current = { flow_state: "idle" };
      setPagination(null);
      setOrderPagination(null);
      lastQueryRef.current = null;
      lastSuggestionRetryRef.current = null;
      setError(null);
      setHistoryPage(1); // Reset history page
    } else {
      // Ensure the current ID is saved
      saveSessionId(sessionIdRef.current, userId);
    }

    fetchLatestHistory();
  }, [userId]);

  // ── 🚀 LOAD OLDER HISTORY (Triggered on Scroll Up) ──
  const loadMoreHistory = useCallback(async () => {
    if (historyInFlightRef.current) {
      if (!loadingHistory)
        scrollDebug("loadMoreHistory skipped: request already in flight");
      return;
    }
    if (loadingHistory || !hasMoreHistory) return;
    historyInFlightRef.current = true;
    scrollDebug(
      "loadMoreHistory start | page",
      historyPage,
      scrollSnapshot(
        bottomRef.current?.closest(
          ".xpert-chat-messages",
        ) as HTMLElement | null,
      ),
    );

    setLoadingHistory(true);
    const gen = viewGenRef.current;
    try {
      // After a search jump, older pages come by cursor from the jumped-to
      // conversation; page numbers only describe the tail of this session.
      const view = historyViewRef.current;
      let res: HistoryResponse;
      if (view) {
        const firstDbId = messagesRef.current.find(
          (m) => m.dbId != null,
        )?.dbId;
        if (firstDbId == null) {
          res = { messages: [], has_more: false, next_page: null };
        } else {
          const w = await apiRef.current.fetchHistoryWindow(
            sessionIdRef.current,
            view.conversationId,
            { before: firstDbId },
            undefined,
            options.customerId,
          );
          res = {
            messages: w.messages ?? [],
            has_more: !!w.has_more_before,
            next_page: null,
          };
        }
      } else {
        res = await apiRef.current.fetchHistory(
          sessionIdRef.current,
          historyPage,
          undefined,
          options.customerId,
        );
      }
      // The list was replaced (jump / back to latest) while this was in flight.
      if (gen !== viewGenRef.current) return;
      if (res.messages && res.messages.length > 0) {
        const olderMessages: ChatMessage[] = res.messages.map(
          mapHistoryEntryToMessage,
        );

        // Remember where the user is before the list grows above them.
        const container = bottomRef.current?.closest(
          ".xpert-chat-messages",
        ) as HTMLElement | null;
        prependAnchorRef.current = container
          ? { height: container.scrollHeight, top: container.scrollTop }
          : null;
        scrollDebug(
          "history arrived | older msgs",
          olderMessages.length,
          "| anchor",
          prependAnchorRef.current,
          "| has_more",
          res.has_more,
        );
        justLoadedHistoryRef.current = true;
        // Prepend older messages to the top of the array
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMoreHistory(res.has_more);
        if (res.next_page) setHistoryPage(res.next_page);
      } else {
        // An empty page means there is nothing older; without this the
        // loader row stayed and every scroll near the top re-requested it.
        setHasMoreHistory(false);
      }
    } catch (err) {
      console.error("Failed to load more history", err);
    } finally {
      historyInFlightRef.current = false;
      setLoadingHistory(false);
    }
  }, [historyPage, hasMoreHistory, loadingHistory, options.customerId]);

  // ── SEARCH JUMP: load newer messages below a jumped-to slice ──
  const loadNewerHistory = useCallback(async () => {
    const view = historyViewRef.current;
    if (!view || !view.hasMoreAfter || newerInFlightRef.current) return;

    let lastDbId: number | undefined;
    const msgs = messagesRef.current;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].dbId != null) {
        lastDbId = msgs[i].dbId;
        break;
      }
    }
    if (lastDbId == null) {
      updateHistoryView({ ...view, hasMoreAfter: false });
      return;
    }

    newerInFlightRef.current = true;
    setLoadingNewerHistory(true);
    const gen = viewGenRef.current;
    try {
      const w = await apiRef.current.fetchHistoryWindow(
        sessionIdRef.current,
        view.conversationId,
        { after: lastDbId },
        undefined,
        options.customerId,
      );
      if (gen !== viewGenRef.current) return;
      const newer = (w.messages ?? []).map(mapHistoryEntryToMessage);
      if (newer.length > 0) {
        // Appended below the reader — no auto-scroll.
        justLoadedHistoryRef.current = true;
        setMessages((prev) => [...prev, ...newer]);
      }
      updateHistoryView({
        ...view,
        hasMoreAfter: newer.length > 0 && !!w.has_more_after,
      });
    } catch (err) {
      console.error("Failed to load newer history", err);
    } finally {
      newerInFlightRef.current = false;
      setLoadingNewerHistory(false);
    }
  }, [options.customerId, updateHistoryView]);

  /**
   * Centres a rendered message vertically in the messages container.
   * Always an instant jump, never smooth: a smooth scroll that passes near the
   * top fires loadMoreHistory, and the prepend's anchor restore (layout effect
   * above) would cut the animation short wherever it happened to be. From an
   * instant position the restore keeps the hit exactly where it was put.
   */
  const centerMessage = useCallback(
    (id: string) => {
      const container = bottomRef.current?.closest(
        ".xpert-chat-messages",
      ) as HTMLElement | null;
      const target = messageRefs.current.get(id);
      if (!container || !target) return;
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      const top = Math.max(
        0,
        container.scrollTop +
          (tRect.top - cRect.top) -
          Math.max(0, (container.clientHeight - tRect.height) / 2),
      );
      container.scrollTop = top;
    },
    [],
  );

  const flashMessage = useCallback((id: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedMessageId(id);
    highlightTimerRef.current = setTimeout(
      () => setHighlightedMessageId(null),
      2500,
    );
  }, []);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  // Jumped-to slice has rendered: centre the hit before paint. Runs before
  // the auto-scroll effect below, which justLoadedHistoryRef tells to stand
  // down. Product images in the slice load after this and can push the hit
  // down, so it is re-centred once they have had a moment.
  useLayoutEffect(() => {
    const id = pendingJumpRef.current;
    if (!id) return;
    pendingJumpRef.current = null;
    centerMessage(id);
    flashMessage(id);
    const t = setTimeout(() => centerMessage(id), 400);
    return () => clearTimeout(t);
  }, [messages, centerMessage, flashMessage]);

  /**
   * Shows a search hit in the chat. If it is already in the loaded list it is
   * just scrolled to; otherwise the list is replaced by a slice around it.
   * Resolves false when the slice could not be loaded (caller keeps the
   * search open so the user can try again).
   */
  const jumpToMessage = useCallback(
    async (conversationId: string, messageId: number): Promise<boolean> => {
      const view = historyViewRef.current;
      const listConversation = view
        ? view.conversationId
        : sessionIdRef.current;
      if (listConversation === conversationId) {
        const existing = messagesRef.current.find((m) => m.dbId === messageId);
        if (existing) {
          centerMessage(existing.id);
          flashMessage(existing.id);
          return true;
        }
      }

      const gen = ++viewGenRef.current;
      try {
        const w = await apiRef.current.fetchHistoryWindow(
          sessionIdRef.current,
          conversationId,
          { around: messageId },
          JUMP_WINDOW_SIZE,
          options.customerId,
        );
        if (gen !== viewGenRef.current) return false;
        const rows = (w.messages ?? []).map(mapHistoryEntryToMessage);
        const target = rows.find((m) => m.dbId === messageId);
        if (!target) return false;

        justLoadedHistoryRef.current = true;
        prependAnchorRef.current = null;
        pendingJumpRef.current = target.id;
        setMessages(rows);
        setHasMoreHistory(!!w.has_more_before);
        updateHistoryView({
          conversationId,
          hasMoreAfter: !!w.has_more_after,
        });
        return true;
      } catch (err) {
        console.error("Failed to load search result", err);
        return false;
      }
    },
    [options.customerId, centerMessage, flashMessage, updateHistoryView],
  );

  /** Leaves a search jump and reloads the latest page of the current session. */
  const returnToLatest = useCallback(async () => {
    setHasMoreHistory(false);
    setHistoryPage(1);
    await fetchLatestHistory();
  }, [fetchLatestHistory]);

  // Anything that adds a NEW turn must land at the live end of the current
  // session, never inside a past slice. Cheap no-op in normal mode.
  const isDetached = useCallback(() => {
    const v = historyViewRef.current;
    return !!v && (v.conversationId !== sessionIdRef.current || v.hasMoreAfter);
  }, []);
  const ensureLive = useCallback(async () => {
    if (isDetached()) await returnToLatest();
  }, [isDetached, returnToLatest]);

  const searchHistory = useCallback(
    (q: string, signal?: AbortSignal): Promise<HistorySearchResponse> =>
      apiRef.current.searchHistory(
        sessionIdRef.current,
        q,
        options.customerId,
        signal,
      ),
    [options.customerId],
  );

  /**
   * Scrolls the chat messages container to the bottom.
   *
   * Uses direct scrollTop manipulation on the nearest .xpert-chat-messages
   * ancestor instead of scrollIntoView. scrollIntoView walks up the entire
   * DOM tree and tries to scroll every ancestor — Shopify themes commonly set
   * overflow:hidden on <html>/<body> for their drawer animations, which the
   * browser treats as a scroll container and silently blocks the scroll.
   * Setting scrollTop directly on our own container is immune to this.
   */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = bottomRef.current;
    if (!el) return;
    const container = el.closest(".xpert-chat-messages") as HTMLElement | null;
    if (container) {
      if (behavior === "instant") {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }
    }
    // No fallback — if our container isn't found, do nothing.
    // Falling back to scrollIntoView would scroll the host page.
  }, []);

  /**
   * Registers (or clears, on unmount) the DOM node for a rendered message,
   * keyed by message id. ChatWidget wires this up as a ref callback on each
   * message row so scrollMessageToTop can find a specific message later.
   */
  const registerMessageRef = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) {
        messageRefs.current.set(id, el);
      } else {
        messageRefs.current.delete(id);
      }
    },
    [],
  );

  /**
   * Scrolls so a message's TOP aligns with the top of the messages
   * container, rather than following the container's bottom.
   *
   * Answers arrive as one full block, not streamed token-by-token, so
   * scrolling to the container bottom on arrival jumped straight past the
   * start of a long answer and left the user having to scroll back up to
   * read it from the top. Anchoring to the new message's own top fixes
   * that; the user scrolls down themselves from there.
   */
  const scrollMessageToTop = useCallback(
    (id: string, behavior: ScrollBehavior = "smooth") => {
      const container = bottomRef.current?.closest(
        ".xpert-chat-messages",
      ) as HTMLElement | null;
      const target = messageRefs.current.get(id);
      if (!container || !target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = container.scrollTop + (targetRect.top - containerRect.top);
      container.scrollTo({ top, behavior });
    },
    [],
  );

  // Older history was just prepended: shift scrollTop by exactly the height
  // that was added above, so the message the user was reading stays put.
  // Layout effect = runs before paint, so there is no visible jump. Browsers'
  // own scroll anchoring can't be relied on for this: Safari has none, and
  // Chrome/Firefox skip it when the scroll position is 0 — which is exactly
  // where a fast upward scroll ends.
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!anchor) return;
    prependAnchorRef.current = null;
    const container = bottomRef.current?.closest(
      ".xpert-chat-messages",
    ) as HTMLElement | null;
    if (container) {
      const target = anchor.top + (container.scrollHeight - anchor.height);
      container.scrollTop = target;
      if (SCROLL_DEBUG) {
        scrollDebug(
          "restore | anchor",
          anchor,
          "| target",
          target,
          "| after set",
          scrollSnapshot(container),
          scrollStyles(container),
        );
        watchScroll(container, "after restore");
      }
    } else {
      scrollDebug("restore skipped: container not found");
    }
  }, [messages]);

  // Scroll when the message list changes (but NOT when loading older
  // history). A brand-new bot reply gets its TOP aligned to the container
  // so the user reads it from the start; everything else — the user's own
  // outgoing message, the loading dots appearing/disappearing — keeps
  // following the bottom as before.
  useEffect(() => {
    if (justLoadedHistoryRef.current) {
      justLoadedHistoryRef.current = false;
      prevMessagesLengthRef.current = messages.length;
      scrollDebug("scroll effect: history prepend, no auto-scroll");
      return;
    }
    const container = bottomRef.current?.closest(
      ".xpert-chat-messages",
    ) as HTMLElement | null;
    if (!container || container.offsetParent === null) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    const grew = messages.length > prevMessagesLengthRef.current;
    const lastMessage = messages[messages.length - 1];
    prevMessagesLengthRef.current = messages.length;

    scrollDebug(
      "scroll effect: auto-scroll |",
      grew && lastMessage?.role === "bot" ? "to new bot message" : "to bottom",
      "| msgs",
      messages.length,
      "| loading",
      loading,
      scrollSnapshot(container),
    );
    if (grew && lastMessage?.role === "bot") {
      // Wait a frame so the new message has actually painted before we
      // measure its position.
      requestAnimationFrame(() => scrollMessageToTop(lastMessage.id, "smooth"));
      return;
    }

    scrollToBottom("smooth");
    // loadingHistory is deliberately NOT a dependency. It flips to true the
    // moment the user scrolls near the top, and re-running this effect then
    // fell through to scrollToBottom() above — yanking the user back to the
    // latest message every time they tried to read older ones.
  }, [messages, loading, scrollToBottom, scrollMessageToTop]);

  const updateEmail = useCallback((email: string) => {
    setUserEmail(email);
    saveEmail(email);
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  const handleDailyLimit = useCallback((err: any): boolean => {
    if (!err?.isDailyLimitError) return false;
    setDailyLimitHit(true);
    setLimitResetAt(err.limitData?.reset_at ?? null);
    return true;
  }, []);

  const handleTenantConfigError = useCallback((err: any): boolean => {
    if (!err?.isTenantConfigError) return false;
    // Config bug (missing/unknown tenant) — log loudly, don't retry.
    console.error("[MiraQ] Tenant config error:", err.tenantConfigDetail);
    setTenantConfigError(err.tenantConfigDetail ?? "unknown tenant");
    return true;
  }, []);

  const processChatResponse = useCallback(
    async (res: ChatResponse) => {
      if (res.session_id) {
        sessionIdRef.current = res.session_id;
        saveSessionId(res.session_id, userId);
      }

      flowRef.current = buildFlowContext(flowRef.current, res);
      setPagination(res.pagination || null);
      setOrderPagination(res.order_pagination || null);

      // ── Action categorisation ───────────────────────────────────────────
      // Three buckets:
      //   • imperativeActions  – fire-and-forget (ADD_TO_CART, OPEN_CART_PANEL …)
      //   • renderActions      – stored on botMsg so MessageRow can render them
      //   • persistentActions  – drive persistent UI state (Bulk Order button …)
      const allActions = res.actions ?? [];

      const RENDER_TYPES = new Set([
        "SHOW_BULK_ORDER_CONFIRMATION",
        "SHOW_BULK_VARIANT_PROMPT",
        "SHOW_BULK_ADDRESS_CONFIRMATION",
        "SHOW_PRODUCT_RECENT_ORDERS",
        "SHOW_DATE_RANGE_PICKER",
      ]);
      const PERSISTENT_TYPES = new Set([
        "SHOW_BULK_ORDER_BUTTON",
        "SHOW_RECENTLY_ORDERED_BUTTON",
      ]);

      const imperativeActions = allActions.filter(
        (a) => !RENDER_TYPES.has(a.type) && !PERSISTENT_TYPES.has(a.type),
      );
      const renderActions = allActions.filter((a) => RENDER_TYPES.has(a.type));
      const persistentActions = allActions.filter((a) =>
        PERSISTENT_TYPES.has(a.type),
      );

      if (imperativeActions.length > 0) {
        options.onActions?.(imperativeActions);
      } else if (allActions.length === 0) {
        // ── Legacy trigger_frontend_* fallback ────────────────────────────
        if (res.action === "trigger_frontend_view_cart") {
          options.onViewCart?.();
        }
        if (res.action === "trigger_frontend_cart_add") {
          const { product_id, quantity, variation_id, variation_attributes } =
            res.metadata ?? {};
          if (product_id) {
            try {
              await options.onAddToCart?.(
                product_id,
                quantity ?? 1,
                variation_id,
                variation_attributes ?? [],
              );
            } catch {
              return {
                id: uuidv4(),
                role: "bot" as const,
                text: "❌ Sorry, I couldn't add that item to your cart. Please try selecting the item again.",
                timestamp: new Date(),
                isFlowPrompt: false,
              };
            }
          }
        }
      }

      if (persistentActions.length > 0) {
        options.onPersistentActions?.(persistentActions);
      }
      // ───────────────────────────────────────────────────────────────────

      const botMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: res.bot_message,
        products: res.products?.length ? res.products : undefined,
        orders: res.orders?.length ? res.orders : undefined,
        allowOrderDownload: res.metadata?.allow_order_download === true,
        categories: res.categories?.length ? res.categories : undefined,
        purchase_info: res.purchase_info,
        intent: res.intent,
        suggestions: res.suggestions?.length ? res.suggestions : undefined,
        filterSuggestions: res.filter_suggestions?.length
          ? res.filter_suggestions
          : undefined,
        cart: res.cart,
        paymentUrl: res.payment_url,
        timestamp: new Date(),
        isFlowPrompt: isFlowPrompt(res.intent, res.flow_state),
        pagination: res.pagination,
        orderPagination: res.order_pagination,
        variantOptions: res.variant_options,
        actions: renderActions.length > 0 ? renderActions : undefined,
      };
      return botMsg;
    },
    [userId, storeApiFetch, options], // ← add storeApiFetch, options
  );

  const buildUserContext = useCallback(() => {
    return {
      ...(userEmail ? { email: userEmail } : {}),
      ...(options.customerId ? { customer_id: options.customerId } : {}),
      ...(options.customerRole ? { role: options.customerRole } : {}),
      flow_state: flowRef.current.flow_state,
      pending_product_id: flowRef.current.pending_product_id,
      pending_product_name: flowRef.current.pending_product_name,
      pending_quantity: flowRef.current.pending_quantity,
      pending_variation_id: flowRef.current.pending_variation_id,
      pending_shipping_address: flowRef.current.pending_shipping_address,
      use_existing_address: flowRef.current.use_existing_address,
      use_new_address: flowRef.current.use_new_address,
      resolved_attributes: flowRef.current.resolved_attributes,
      pending_order_id: flowRef.current.pending_order_id,
      pending_semantic_match: flowRef.current.pending_semantic_match,
    };
  }, [userEmail, options.customerId, options.customerRole]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      await ensureLive();
      setError(null);

      // Cards can send a structured payload encoded as "__SENTINEL__<json>".
      // The full encoded string goes to the API — the flow handlers need the
      // exact data — but the conversation shows a friendly bubble rather than
      // raw JSON. The same rewrite exists server-side for /history, so a
      // reload renders these the same way this turn did.
      const _displayText = describeSentinel(text.trim());

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: _displayText,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, userMsg));
      setLoading(true);
      lastQueryRef.current = text.trim();
      lastSuggestionRetryRef.current = null;

      try {
        const res: ChatResponse = await apiRef.current.sendChat(
          {
            message: text.trim(),
            session_id: sessionIdRef.current,
            page: 1,
            platform: options.platform ?? "woocommerce",
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // Pass Session ID to api wrapper!

        // Capture product context BEFORE processChatResponse resets flowRef
        const _pendingId = flowRef.current.pending_product_id;
        const _pendingName = flowRef.current.pending_product_name;

        const botMsg = await processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));

        // ── Similar products nudge ──
        if (
          options.onSimilarProductsPrompt &&
          res.intent === "add_to_cart" &&
          _pendingId &&
          _pendingName
        ) {
          options.onSimilarProductsPrompt(_pendingId, _pendingName);
        }
      } catch (err) {
        if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
        if (handleTenantConfigError(err)) return;
        const detail = friendlyError(err);
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: detail,
          timestamp: new Date(),
        };
        setMessages((prev) => enqueuMessages(prev, errMsg));
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [
      buildUserContext,
      processChatResponse,
      focusInput,
      handleDailyLimit,
      handleTenantConfigError,
      options,
      ensureLive,
    ],
  );

  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      if (!newText.trim() || loading) return;

      const currentMessages = messagesRef.current;
      const idx = currentMessages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      setError(null);
      flowRef.current = { flow_state: "idle" };
      setPagination(null);
      setOrderPagination(null);
      lastQueryRef.current = newText.trim();
      lastSuggestionRetryRef.current = null;

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: newText.trim(),
        timestamp: new Date(),
      };

      setMessages(enqueuMessages(currentMessages.slice(0, idx), userMsg));
      setLoading(true);

      try {
        const res: ChatResponse = await apiRef.current.sendChat(
          {
            message: newText.trim(),
            session_id: sessionIdRef.current,
            page: 1,
            platform: options.platform ?? "woocommerce",
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // Pass Session ID!

        const botMsg = await processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));
      } catch (err) {
        if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
        if (handleTenantConfigError(err)) return;
        const detail = friendlyError(err);
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: detail,
          timestamp: new Date(),
        };
        setMessages((prev) => enqueuMessages(prev, errMsg));
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [
      loading,
      buildUserContext,
      handleDailyLimit,
      handleTenantConfigError,
      options,
      processChatResponse,
      focusInput,
    ],
  );

  const sendFilterSuggestion = useCallback(
    async (suggestion: FilterSuggestion) => {
      await ensureLive();
      setError(null);

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: suggestion.label,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, userMsg));
      setLoading(true);
      lastQueryRef.current = suggestion.label;
      lastSuggestionRetryRef.current = suggestion;

      try {
        const res: ChatResponse = await apiRef.current.sendChat(
          {
            message: suggestion.label,
            session_id: sessionIdRef.current,
            page: 1,
            platform: options.platform ?? "woocommerce",
            suggestion_retry: suggestion,
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // 🚀 Pass Session ID!

        // Capture product context BEFORE processChatResponse resets flowRef
        const _pendingId = flowRef.current.pending_product_id;
        const _pendingName = flowRef.current.pending_product_name;

        const botMsg = await processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));

        // ── Similar products nudge ──
        if (
          options.onSimilarProductsPrompt &&
          res.intent === "add_to_cart" &&
          _pendingId &&
          _pendingName
        ) {
          options.onSimilarProductsPrompt(_pendingId, _pendingName);
        }
      } catch (err) {
        if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
        if (handleTenantConfigError(err)) return;
        const detail = friendlyError(err);
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: detail,
          timestamp: new Date(),
        };
        setMessages((prev) => enqueuMessages(prev, errMsg));
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [
      buildUserContext,
      handleDailyLimit,
      handleTenantConfigError,
      options,
      processChatResponse,
      focusInput,
      ensureLive,
    ],
  );

  // Where "Load More" gets its page and query from. Normally that's the hook
  // state set by the live turn. But a product click is a full page
  // navigation: the widget remounts and rebuilds the list from /chat/history,
  // and the button comes back from the bot message's own stored pagination
  // while `pagination` / `lastQueryRef` are back to null — so the click used
  // to return silently. Fall back to the last bot message (the same one
  // ChatWidget shows the button for) and the user turn just before it.
  const resolveLoadMoreSource = useCallback(
    (kind: "products" | "orders", live: PaginationData | null) => {
      const msgs = messagesRef.current;
      let botIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "bot") {
          botIdx = i;
          break;
        }
      }
      const bot = botIdx >= 0 ? msgs[botIdx] : null;
      const stored =
        kind === "products" ? bot?.pagination : bot?.orderPagination;

      let query = lastQueryRef.current;
      if (!query) {
        for (let i = botIdx - 1; i >= 0; i--) {
          if (msgs[i].role === "user" && msgs[i].text?.trim()) {
            query = msgs[i].text.trim();
            break;
          }
        }
      }
      return { pg: live ?? stored ?? null, query };
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (loading) return;
    await ensureLive();
    const { pg, query } = resolveLoadMoreSource("products", pagination);
    if (!pg || !pg.has_more || !query) {
      console.warn("[MiraQ] loadMore skipped", {
        livePagination: pagination,
        resolvedPagination: pg,
        query,
      });
      return;
    }

    const nextPage = pg.page + 1;
    lastQueryRef.current = query;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat(
        {
          message: query,
          session_id: sessionIdRef.current,
          page: nextPage,
          platform: options.platform ?? "woocommerce",
          ...(lastSuggestionRetryRef.current
            ? { suggestion_retry: lastSuggestionRetryRef.current }
            : {}),
          user_context: buildUserContext(),
        },
        sessionIdRef.current,
      ); // Pass Session ID!

      const botMsg = await processChatResponse(res);
      setMessages((prev) => enqueuMessages(prev, botMsg));
    } catch (err) {
      if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
      if (handleTenantConfigError(err)) return;
      const detail = friendlyError(err);
      setError(detail);
      setPagination(null);
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: detail,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, errMsg));
    } finally {
      setLoading(false);
      focusInput();
    }
  }, [
    pagination,
    resolveLoadMoreSource,
    handleDailyLimit,
    handleTenantConfigError,
    options,
    loading,
    buildUserContext,
    processChatResponse,
    focusInput,
    ensureLive,
  ]);

  const loadMoreOrders = useCallback(async () => {
    if (loading) return;
    await ensureLive();
    const { pg, query } = resolveLoadMoreSource("orders", orderPagination);
    if (!pg || !pg.has_more || !query) {
      console.warn("[MiraQ] loadMoreOrders skipped", {
        livePagination: orderPagination,
        resolvedPagination: pg,
        query,
      });
      return;
    }

    const nextPage = pg.page + 1;
    lastQueryRef.current = query;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat(
        {
          message: query,
          session_id: sessionIdRef.current,
          page: nextPage,
          platform: options.platform ?? "woocommerce",
          user_context: buildUserContext(),
        },
        sessionIdRef.current,
      );

      const botMsg = await processChatResponse(res);
      setMessages((prev) => enqueuMessages(prev, botMsg));
    } catch (err) {
      if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
      if (handleTenantConfigError(err)) return;
      const detail = friendlyError(err);
      setError(detail);
      setPagination(null);
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: detail,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, errMsg));
    } finally {
      setLoading(false);
      focusInput();
    }
  }, [
    orderPagination,
    resolveLoadMoreSource,
    loading,
    buildUserContext,
    processChatResponse,
    focusInput,
    handleDailyLimit,
    handleTenantConfigError,
    options,
    ensureLive,
  ]);

  const appendBotMessage = useCallback(
    (payload: string | Partial<ChatMessage>) => {
      const overrides =
        typeof payload === "string" ? { text: payload } : payload;
      const syntheticMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: "",
        timestamp: new Date(),
        intent: "system",
        metadata: { synthetic: true },
        ...overrides,
      };
      const append = () =>
        setMessages((prev) => enqueuMessages(prev, syntheticMsg));
      // e.g. an add-to-cart from a product card inside a past slice.
      // Synchronous otherwise, exactly as before.
      if (isDetached()) void ensureLive().then(append);
      else append();
    },
    [isDetached, ensureLive],
  );

  const handleCartResult = useCallback(
    async ({
      success,
      name,
      quantity,
    }: {
      success: boolean;
      name: string;
      quantity: number;
    }) => {
      let botText = success
        ? `✅ Added **${name}** ×${quantity} to your cart.`
        : `⚠️ Couldn't add **${name}** to your cart. Please try again.`;
      let resultActions: ChatAction[] = success
        ? [{ type: "OPEN_CART_PANEL" as const, payload: {} }]
        : [];
      let resultSuggestions = success
        ? ["Proceed to checkout", "Continue shopping", "View cart"]
        : ["Try again", "View cart", "Browse products"];

      try {
        const data = await apiRef.current.submitCartResult(
          {
            session_id: sessionIdRef.current,
            success,
            product_name: name,
            quantity,
          },
          sessionIdRef.current,
        );
        botText = data.bot_message ?? botText;
        resultActions = data.actions ?? resultActions;
        resultSuggestions = data.suggestions ?? resultSuggestions;
      } catch (err) {
        console.warn(
          "[useChat] handleCartResult: backend unreachable, using fallback",
          err,
        );
      }

      appendBotMessage({
        text: botText,
        suggestions: resultSuggestions,
        intent: success ? "add_to_cart" : "error",
      });

      if (resultActions.length > 0) {
        options.onActions?.(resultActions);
      }
    },
    [appendBotMessage, options],
  );

  return {
    messages,
    loading,
    error,
    userEmail,
    updateEmail,
    sendMessage,
    editMessage,
    sendFilterSuggestion,
    appendBotMessage,
    handleCartResult,
    getSessionId: () => sessionIdRef.current,
    bottomRef,
    inputRef,
    scrollToBottom,
    registerMessageRef,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
    loadMoreHistory,
    hasMoreHistory,
    loadingHistory,
    // ── History search ──
    searchHistory,
    jumpToMessage,
    returnToLatest,
    loadNewerHistory,
    hasNewerHistory: !!historyView?.hasMoreAfter,
    loadingNewerHistory,
    /** Showing a past slice — new turns would not land at the live end */
    isViewingPast:
      historyView !== null &&
      (historyView.conversationId !== sessionIdRef.current ||
        historyView.hasMoreAfter),
    /** The slice belongs to a different conversation than the open session */
    isViewingOtherConversation:
      historyView !== null &&
      historyView.conversationId !== sessionIdRef.current,
    highlightedMessageId,
    dailyLimitHit,
    limitResetAt,
    tenantConfigError,
  };
}
