import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatMessage,
  FlowContext,
  ChatResponse,
  PaginationData,
  FilterSuggestion,
} from "../types/api";
import type { ChatAction } from "../types/actions";
import { createApiClient } from "../services/api";
import { isFlowPrompt, buildFlowContext } from "../utils/flow";
import { enqueuMessages } from "../utils/chatHistory";

// 🚀 Shifted to localStorage so sessions survive tab closes
const SESSION_KEY_PREFIX = "shop_chat_session_id";
const EMAIL_KEY = "shop_chat_email";

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
  wpBaseUrl?: string;
  onViewCart?: () => void;
  onAddToCart?: (
    productId: number,
    quantity: number,
    variationId?: number,
    variationAttributes?: { attribute: string; value: string }[],
  ) => Promise<void>;
  licenseId?: string;
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
  const lastQueryRef = useRef<string | null>(null);

  // State Variables for History Pagination
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const sessionIdRef = useRef<string>(loadSessionId(userId) ?? uuidv4());

  const prevUserIdRef = useRef<string | number | undefined>(userId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const flowRef = useRef<FlowContext>({ flow_state: "idle" });

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const justLoadedHistoryRef = useRef(false);

  const apiRef = useRef(
    createApiClient(options.apiUrl, options.apiKey, options.licenseId),
  );
  // ── Nonce state for WooCommerce Store API ──
  const nonceRef = useRef<string>(options.nonce ?? "");
  const nonceExpiresRef = useRef<number>(options.nonceExpires ?? 0);
  const cartTokenRef = useRef<string>(options.cartToken ?? "");
  // Site URL = current origin since widget runs ON the WP site
  const siteOrigin = options.wpBaseUrl || window.location.origin;
  const getFreshNonce = useCallback(async (): Promise<string> => {
    // 1-minute buffer before actual expiry
    if (Date.now() < nonceExpiresRef.current - 60_000) {
      return nonceRef.current;
    }
    // Expired — hit the WP refresh endpoint
    try {
      const res = await fetch(
        `${siteOrigin}/wp-json/custom-api/v1/refresh-nonce`,
        { credentials: "include" },
      );
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
      setError(null);
      setHistoryPage(1); // Reset history page
    } else {
      // Ensure the current ID is saved
      saveSessionId(sessionIdRef.current, userId);
    }

    async function fetchDatabaseHistory() {
      setLoading(true);
      try {
        const res = await apiRef.current.fetchHistory(sessionIdRef.current, 1);
        console.log("[MiraQ DEBUG] fetchHistory on mount", {
          sessionId: sessionIdRef.current,
          messageCount: res.messages?.length,
        });
        if (res.messages && res.messages.length > 0) {
          // Rebuild React message objects from DB rows
          const formattedHistory: ChatMessage[] = res.messages.map(
            (m: any) => ({
              id: uuidv4(),
              role: m.role,
              text: m.message,
              intent: m.intent,
              timestamp: new Date(m.timestamp),
              products: m.products,
              categories: m.categories,
              suggestions: m.suggestions,
              actions: m.actions,
              metadata: m.metadata,
            }),
          );
          setMessages(formattedHistory);
          setHasMoreHistory(res.has_more);
          if (res.next_page) setHistoryPage(res.next_page);
        } else {
          setMessages([WELCOME_MESSAGE]); // Fresh chat
        }
      } catch (err) {
        console.error("Failed to fetch database history", err);
        setMessages([WELCOME_MESSAGE]); // Fallback on network error
      } finally {
        setLoading(false);
      }
    }

    fetchDatabaseHistory();
  }, [userId]);

  // ── 🚀 LOAD OLDER HISTORY (Triggered on Scroll Up) ──
  const loadMoreHistory = useCallback(async () => {
    if (loadingHistory || !hasMoreHistory) return;

    setLoadingHistory(true);
    try {
      const res = await apiRef.current.fetchHistory(
        sessionIdRef.current,
        historyPage,
      );
      if (res.messages && res.messages.length > 0) {
        const olderMessages: ChatMessage[] = res.messages.map((m: any) => ({
          id: uuidv4(),
          role: m.role,
          text: m.message,
          intent: m.intent,
          timestamp: new Date(m.timestamp),
          products: m.products,
          categories: m.categories,
          suggestions: m.suggestions,
          actions: m.actions,
          metadata: m.metadata,
        }));

        justLoadedHistoryRef.current = true;
        // Prepend older messages to the top of the array
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMoreHistory(res.has_more);
        if (res.next_page) setHistoryPage(res.next_page);
      }
    } catch (err) {
      console.error("Failed to load more history", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, hasMoreHistory, loadingHistory]);

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

  // Scroll to bottom when a NEW message arrives (but NOT when loading older history)
  useEffect(() => {
    if (justLoadedHistoryRef.current) {
      justLoadedHistoryRef.current = false;
      return;
    }
    const container = bottomRef.current?.closest(
      ".xpert-chat-messages",
    ) as HTMLElement | null;
    if (container && container.offsetParent !== null) {
      scrollToBottom("smooth");
    }
  }, [messages.length, loading, loadingHistory, scrollToBottom]);

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
      setError(null);

      // The bulk-address edit panel sends a structured payload encoded as
      // "__BULK_ADDR__<json>". Send the full encoded string to the API, but
      // show a friendly bubble instead of raw JSON in the conversation.
      const _isBulkAddr = text.trim().startsWith("__BULK_ADDR__");
      const _displayText = _isBulkAddr
        ? "✏️ Updated billing & shipping address"
        : text.trim();

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: _displayText,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, userMsg));
      setLoading(true);
      lastQueryRef.current = text.trim();

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
        const detail =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: `Oops – ${detail}. Please try again.`,
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
      options,
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
        const detail =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: `Oops – ${detail}. Please try again.`,
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
      options,
      processChatResponse,
      focusInput,
    ],
  );

  const sendFilterSuggestion = useCallback(
    async (suggestion: FilterSuggestion) => {
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
        const detail =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(detail);
        setPagination(null);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: `Oops – ${detail}. Please try again.`,
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
      options,
      processChatResponse,
      focusInput,
    ],
  );

  const loadMore = useCallback(async () => {
    if (!pagination || !pagination.has_more || !lastQueryRef.current || loading)
      return;

    const nextPage = pagination.page + 1;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat(
        {
          message: lastQueryRef.current,
          session_id: sessionIdRef.current,
          page: nextPage,
          platform: options.platform ?? "woocommerce",
          user_context: buildUserContext(),
        },
        sessionIdRef.current,
      ); // Pass Session ID!

      const botMsg = await processChatResponse(res);
      setMessages((prev) => enqueuMessages(prev, botMsg));
    } catch (err) {
      if (handleDailyLimit(err)) return; // ← add this one line, rest unchanged
      const detail =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(detail);
      setPagination(null);
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: `Oops – ${detail}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, errMsg));
    } finally {
      setLoading(false);
      focusInput();
    }
  }, [
    pagination,
    handleDailyLimit,
    options,
    loading,
    buildUserContext,
    processChatResponse,
    focusInput,
  ]);

  const loadMoreOrders = useCallback(async () => {
    if (
      !orderPagination ||
      !orderPagination.has_more ||
      !lastQueryRef.current ||
      loading
    )
      return;

    const nextPage = orderPagination.page + 1;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat(
        {
          message: lastQueryRef.current,
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
      const detail =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(detail);
      setPagination(null);
      const errMsg: ChatMessage = {
        id: uuidv4(),
        role: "bot",
        text: `Oops – ${detail}. Please try again.`,
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, errMsg));
    } finally {
      setLoading(false);
      focusInput();
    }
  }, [
    orderPagination,
    loading,
    buildUserContext,
    processChatResponse,
    focusInput,
    handleDailyLimit,
    options,
  ]);

  const handleOrderProduct = useCallback(
    async (productId: number) => {
      if (!userEmail) {
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: "⚠️ Please set your email address first (click the 📧 button in the header) to place an order.",
          timestamp: new Date(),
        };
        setMessages((prev) => enqueuMessages(prev, errMsg));
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await apiRef.current.placeOrder(
          {
            product_id: productId,
            quantity: 1,
            session_id: sessionIdRef.current,
            user_context: {
              email: userEmail,
              ...(options.customerId
                ? { customer_id: options.customerId }
                : {}),
              ...(options.customerRole ? { role: options.customerRole } : {}),
            },
          },
          sessionIdRef.current,
        ); // 🚀 Pass Session ID!

        if (res.session_id) {
          sessionIdRef.current = res.session_id;
          saveSessionId(res.session_id, userId);
        }

        flowRef.current = { flow_state: "awaiting_anything_else" };

        const botMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: res.bot_message,
          orders: res.order ? [res.order] : undefined,
          timestamp: new Date(),
          suggestions: [
            "Show me more products",
            "Check my orders",
            "No, that's all",
          ],
          isFlowPrompt: true,
        };
        setMessages((prev) => enqueuMessages(prev, botMsg));
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Failed to place order.";
        setError(detail);
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: "bot",
          text: `❌ Order failed: ${detail}`,
          timestamp: new Date(),
        };
        setMessages((prev) => enqueuMessages(prev, errMsg));
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [userEmail, options.customerId, focusInput, userId],
  );

  const clearAll = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await apiRef.current.clearHistory(sessionIdRef.current);
      } catch (_e) {
        /* best-effort */
      }
    }
    setMessages([WELCOME_MESSAGE]);
    localStorage.removeItem(sessionKey(userId));
    sessionIdRef.current = uuidv4();
    saveSessionId(sessionIdRef.current, userId);
    flowRef.current = { flow_state: "idle" };
    setPagination(null);
    setOrderPagination(null);
    lastQueryRef.current = null;
    focusInput();
  }, [focusInput, userId]);

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
      setMessages((prev) => enqueuMessages(prev, syntheticMsg));
    },
    [],
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
    handleOrderProduct,
    clearAll,
    appendBotMessage,
    handleCartResult,
    getSessionId: () => sessionIdRef.current,
    bottomRef,
    inputRef,
    scrollToBottom,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
    loadMoreHistory,
    hasMoreHistory,
    loadingHistory,
    dailyLimitHit,
    limitResetAt,
  };
}
