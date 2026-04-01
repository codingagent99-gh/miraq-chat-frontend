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
  const lastQueryRef = useRef<string | null>(null);

  const sessionIdRef = useRef<string>(loadSessionId(userId) ?? uuidv4());

  const prevUserIdRef = useRef<string | number | undefined>(userId);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const flowRef = useRef<FlowContext>({ flow_state: "idle" });

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const apiRef = useRef(createApiClient(options.apiUrl, options.apiKey));

  // ── 🚀 HYDRATE CHAT HISTORY FROM POSTGRES DATABASE ──
  useEffect(() => {
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
    } else {
      // Ensure the current ID is saved
      saveSessionId(sessionIdRef.current, userId);
    }

    async function fetchDatabaseHistory() {
      setLoading(true);
      try {
        const res = await apiRef.current.fetchHistory(sessionIdRef.current);
        if (res.messages && res.messages.length > 0) {
          // Rebuild React message objects from DB rows
          const formattedHistory: ChatMessage[] = res.messages.map(
            (m: any) => ({
              id: uuidv4(),
              role: m.role,
              text: m.message,
              intent: m.intent,
              timestamp: new Date(m.timestamp),
            }),
          );
          setMessages(formattedHistory);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const updateEmail = useCallback((email: string) => {
    setUserEmail(email);
    saveEmail(email);
  }, []);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  const processChatResponse = useCallback(
    (res: ChatResponse) => {
      if (res.session_id) {
        sessionIdRef.current = res.session_id;
        saveSessionId(res.session_id, userId);
      }

      flowRef.current = buildFlowContext(flowRef.current, res);

      setPagination(res.pagination || null);
      setOrderPagination(res.order_pagination || null);

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
        const res: ChatResponse = await apiRef.current.sendChat(
          {
            message: text.trim(),
            session_id: sessionIdRef.current,
            page: 1,
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // 🚀 Pass Session ID to api wrapper!

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
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // 🚀 Pass Session ID!

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
            suggestion_retry: suggestion,
            user_context: buildUserContext(),
          },
          sessionIdRef.current,
        ); // 🚀 Pass Session ID!

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
          user_context: buildUserContext(),
        },
        sessionIdRef.current,
      ); // 🚀 Pass Session ID!

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
          user_context: buildUserContext(),
        },
        sessionIdRef.current,
      ); // 🚀 Pass Session ID!

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
    localStorage.removeItem(sessionKey(userId)); // 🚀 Clear from localStorage
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
