import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatMessage,
  FlowContext,
  ChatResponse,
  PaginationData,
} from "../types/api";
import { createApiClient } from "../services/api";
import { isFlowPrompt, buildFlowContext } from "../utils/flow";

const SESSION_KEY = "shop_chat_session_id";
const EMAIL_KEY = "shop_chat_email";

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

export interface UseChatOptions {
  /** Runtime API base URL (from data-api-url or prop). Overrides VITE_BASE. */
  apiUrl?: string;
  /** API key for Authorization header */
  apiKey?: string;
  /** Pre-configured customer ID */
  customerId?: number;
  /** Pre-configured customer email */
  customerEmail?: string;
}

export function useChat(options: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(
    options.customerEmail || loadEmail(),
  );

  // ── Pagination state ──
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const lastQueryRef = useRef<string | null>(null);

  const sessionIdRef = useRef<string>(loadSessionId() ?? uuidv4());
  // Persist the generated session_id immediately so it survives page refresh
  saveSessionId(sessionIdRef.current);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const flowRef = useRef<FlowContext>({ flow_state: "idle" });

  // Create the API client once using the runtime apiUrl (falls back to VITE_BASE)
  const apiRef = useRef(createApiClient(options.apiUrl, options.apiKey));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const updateEmail = useCallback((email: string) => {
    setUserEmail(email);
    saveEmail(email);
  }, []);

  /** Focus the chat input */
  const focusInput = useCallback(() => {
    // Small delay to ensure DOM updates (loading state change) have rendered
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  /* ── helper: process a chat API response into a bot message ── */
  const processChatResponse = useCallback((res: ChatResponse) => {
    if (res.session_id) {
      sessionIdRef.current = res.session_id;
      saveSessionId(res.session_id);
    }

    flowRef.current = buildFlowContext(flowRef.current, res);

    // Update pagination state
    if (res.pagination) {
      setPagination(res.pagination);
    } else {
      setPagination(null);
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
      cart: res.cart,
      paymentUrl: res.payment_url,
      timestamp: new Date(),
      isFlowPrompt: isFlowPrompt(res.intent, res.flow_state),
      pagination: res.pagination,
    };
    return botMsg;
  }, []);

  /* ── build the user_context payload ── */
  const buildUserContext = useCallback(() => {
    return {
      ...(userEmail ? { email: userEmail } : {}),
      ...(options.customerId ? { customer_id: options.customerId } : {}),
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
    };
  }, [userEmail, options.customerId]);

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
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      // Store the last query for pagination (load more)
      lastQueryRef.current = text.trim();

      try {
        const res: ChatResponse = await apiRef.current.sendChat({
          message: text.trim(),
          session_id: sessionIdRef.current,
          page: 1,
          user_context: buildUserContext(),
        });

        const botMsg = processChatResponse(res);
        setMessages((prev) => [...prev, botMsg]);
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
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [buildUserContext, processChatResponse, focusInput],
  );

  /* ── load more (next page) ── */
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
      setMessages((prev) => [...prev, botMsg]);
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
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      focusInput();
    }
  }, [pagination, loading, buildUserContext, processChatResponse, focusInput]);

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
        setMessages((prev) => [...prev, errMsg]);
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
          },
        });

        if (res.session_id) {
          sessionIdRef.current = res.session_id;
          saveSessionId(res.session_id);
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
        setMessages((prev) => [...prev, botMsg]);
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
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        focusInput();
      }
    },
    [userEmail, options.customerId, focusInput],
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
    setMessages([]);
    sessionStorage.removeItem(SESSION_KEY);
    sessionIdRef.current = uuidv4();
    saveSessionId(sessionIdRef.current);
    flowRef.current = { flow_state: "idle" };
    setPagination(null);
    lastQueryRef.current = null;
    focusInput();
  }, [focusInput]);

  return {
    messages,
    loading,
    error,
    userEmail,
    updateEmail,
    sendMessage,
    handleOrderProduct,
    clearAll,
    bottomRef,
    inputRef,
    pagination,
    loadMore,
  };
}
