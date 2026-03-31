import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatMessage,
  FlowContext,
  ChatResponse,
  PaginationData,
  FilterSuggestion,
} from "../types/api";
import { createApiClient } from "../services/api";
import { isFlowPrompt, buildFlowContext } from "../utils/flow";
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  enqueuMessages,
} from "../utils/chatHistory";

const SESSION_KEY_PREFIX = "shop_chat_session_id";
const EMAIL_KEY = "shop_chat_email";

/** Build a user-scoped session key. */
function sessionKey(userId?: string | number): string {
  return userId ? `${SESSION_KEY_PREFIX}_${userId}` : SESSION_KEY_PREFIX;
}

function loadSessionId(userId?: string | number): string | undefined {
  return sessionStorage.getItem(sessionKey(userId)) ?? undefined;
}
function saveSessionId(id: string, userId?: string | number) {
  sessionStorage.setItem(sessionKey(userId), id);
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
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "bot",
  text: "How can I help?",
  timestamp: new Date(),
};

export function useChat(options: UseChatOptions = {}) {
  // Stable user identifier used to scope storage keys
  const userId = options.customerId ?? options.customerEmail;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const persisted = loadChatHistory(userId);
    return persisted.length > 0 ? persisted : [WELCOME_MESSAGE];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(
    options.customerEmail || loadEmail(),
  );

  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [orderPagination, setOrderPagination] = useState<PaginationData | null>(
    null,
  );
  const lastQueryRef = useRef<string | null>(null);

  const sessionIdRef = useRef<string>(loadSessionId(userId) ?? uuidv4());
  saveSessionId(sessionIdRef.current, userId);

  // Track the previous userId so we can detect user switches
  const prevUserIdRef = useRef<string | number | undefined>(userId);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const flowRef = useRef<FlowContext>({ flow_state: "idle" });

  // Always-current snapshot of messages — avoids stale closure in editMessage
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const apiRef = useRef(createApiClient(options.apiUrl, options.apiKey));

  // ── Detect user change and reset session ──
  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    if (prevUserId === userId) return;

    // User has changed — load the new user's data (or start fresh)
    prevUserIdRef.current = userId;

    const persisted = loadChatHistory(userId);
    setMessages(persisted.length > 0 ? persisted : [WELCOME_MESSAGE]);

    sessionIdRef.current = loadSessionId(userId) ?? uuidv4();
    saveSessionId(sessionIdRef.current, userId);

    flowRef.current = { flow_state: "idle" };
    setPagination(null);
    setOrderPagination(null);
    lastQueryRef.current = null;
    setError(null);
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    saveChatHistory(messages, userId);
  }, [messages, userId]);

  const updateEmail = useCallback((email: string) => {
    setUserEmail(email);
    saveEmail(email);
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  /* ── process a chat API response into a bot message ── */
  const processChatResponse = useCallback(
    (res: ChatResponse) => {
      if (res.session_id) {
        sessionIdRef.current = res.session_id;
        saveSessionId(res.session_id, userId);
      }

      flowRef.current = buildFlowContext(flowRef.current, res);

      if (res.pagination) {
        setPagination(res.pagination);
      } else {
        setPagination(null);
      }

      if (res.order_pagination) {
        setOrderPagination(res.order_pagination);
      } else {
        setOrderPagination(null);
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
        filterSuggestions: res.filter_suggestions?.length
          ? res.filter_suggestions
          : undefined,
        cart: res.cart,
        paymentUrl: res.payment_url,
        timestamp: new Date(),
        isFlowPrompt: isFlowPrompt(res.intent, res.flow_state),
        pagination: res.pagination,
        orderPagination: res.order_pagination,
      };
      return botMsg;
    },
    [userId],
  );

  /* ── build the user_context payload ── */
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

  /* ── send message ── */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        text: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => enqueuMessages(prev, userMsg));
      setLoading(true);
      lastQueryRef.current = text.trim();

      try {
        const res: ChatResponse = await apiRef.current.sendChat({
          message: text.trim(),
          session_id: sessionIdRef.current,
          page: 1,
          user_context: buildUserContext(),
        });

        const botMsg = processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));
      } catch (err) {
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
    [buildUserContext, processChatResponse, focusInput],
  );

  /* ── edit a previous user message — truncates history from that point ── */
  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      if (!newText.trim() || loading) return;

      // Find the message to edit in the current snapshot
      const currentMessages = messagesRef.current;
      const idx = currentMessages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;

      setError(null);

      // Reset flow context — we're rewinding to an earlier point
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

      // Replace everything from the edited message onward with the new user msg,
      // then apply the FIFO cap
      setMessages(enqueuMessages(currentMessages.slice(0, idx), userMsg));
      setLoading(true);

      try {
        const res: ChatResponse = await apiRef.current.sendChat({
          message: newText.trim(),
          session_id: sessionIdRef.current,
          page: 1,
          user_context: buildUserContext(),
        });

        const botMsg = processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(detail);
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
    [loading, buildUserContext, processChatResponse, focusInput],
  );

  /* ── send filter suggestion retry ── */
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
        const res: ChatResponse = await apiRef.current.sendChat({
          message: suggestion.label,
          session_id: sessionIdRef.current,
          page: 1,
          suggestion_retry: suggestion,
          user_context: buildUserContext(),
        });

        const botMsg = processChatResponse(res);
        setMessages((prev) => enqueuMessages(prev, botMsg));
      } catch (err) {
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
    [buildUserContext, processChatResponse, focusInput],
  );

  /* ── load more products (next page) ── */
  const loadMore = useCallback(async () => {
    if (!pagination || !pagination.has_more || !lastQueryRef.current) return;
    if (loading) return;

    const nextPage = pagination.page + 1;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat({
        message: lastQueryRef.current,
        session_id: sessionIdRef.current,
        page: nextPage,
        user_context: buildUserContext(),
      });

      const botMsg = processChatResponse(res);
      setMessages((prev) => enqueuMessages(prev, botMsg));
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Failed to load more results.";
      setError(detail);
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
  }, [pagination, loading, buildUserContext, processChatResponse, focusInput]);

  /* ── load more orders (next page) ── */
  const loadMoreOrders = useCallback(async () => {
    if (!orderPagination || !orderPagination.has_more || !lastQueryRef.current)
      return;
    if (loading) return;

    const nextPage = orderPagination.page + 1;
    setLoading(true);
    setError(null);

    try {
      const res: ChatResponse = await apiRef.current.sendChat({
        message: lastQueryRef.current,
        session_id: sessionIdRef.current,
        page: nextPage,
        user_context: buildUserContext(),
      });

      const botMsg = processChatResponse(res);
      setMessages((prev) => enqueuMessages(prev, botMsg));
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Failed to load more orders.";
      setError(detail);
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
  ]);

  /* ── place order ── */
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
        const res = await apiRef.current.placeOrder({
          product_id: productId,
          quantity: 1,
          session_id: sessionIdRef.current,
          user_context: {
            email: userEmail,
            ...(options.customerId ? { customer_id: options.customerId } : {}),
            ...(options.customerRole ? { role: options.customerRole } : {}),
          },
        });

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

  /* ── clear ── */
  const clearAll = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await apiRef.current.clearHistory(sessionIdRef.current);
      } catch (_e) {
        /* best-effort */
      }
    }
    clearChatHistory(userId);
    setMessages([WELCOME_MESSAGE]);
    sessionStorage.removeItem(sessionKey(userId));
    sessionIdRef.current = uuidv4();
    saveSessionId(sessionIdRef.current, userId);
    flowRef.current = { flow_state: "idle" };
    setPagination(null);
    setOrderPagination(null);
    lastQueryRef.current = null;
    focusInput();
  }, [focusInput, userId]);

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
    bottomRef,
    inputRef,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
  };
}
