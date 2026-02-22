import axios, { type AxiosInstance } from "axios";
import type {
  ChatRequest,
  ChatResponse,
  HistoryResponse,
  Product,
  Order,
} from "../types/api";

/**
 * Create an API client with a runtime baseURL.
 *
 * Resolution order:
 *   1. Runtime `baseURL` param (from <script data-api-url="...">)
 *   2. Build-time VITE_BASE env var (from .env)
 *   3. Empty string (relative URLs — same origin)
 */
export function createApiClient(baseURL?: string, apiKey?: string) {
  const resolvedBase = baseURL || import.meta.env.VITE_BASE || "";

  console.log("[MiraQ API] baseURL resolved to:", resolvedBase, {
    runtimeParam: baseURL,
    envVar: import.meta.env.VITE_BASE,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const client: AxiosInstance = axios.create({
    baseURL: resolvedBase,
    headers,
    timeout: 30_000,
  });

  /* ── /chat ── */
  async function sendChat(body: ChatRequest): Promise<ChatResponse> {
    const { data } = await client.post<ChatResponse>("/chat", body);
    return data;
  }

  /* ── /chat/history/:id ── */
  async function fetchHistory(sessionId: string): Promise<HistoryResponse> {
    const { data } = await client.get<HistoryResponse>(
      `/chat/history/${sessionId}`,
    );
    return data;
  }

  /* ── /chat/clear/:id ── */
  async function clearHistory(sessionId: string): Promise<void> {
    await client.delete(`/chat/clear/${sessionId}`);
  }

  /* ── /products/categories ── */
  async function fetchCategories(): Promise<Category[]> {
    const { data } = await client.get<{ categories: Category[] }>(
      "/products/categories",
    );
    return data.categories;
  }

  /* ── /products/:id ── */
  async function fetchProduct(id: number): Promise<Product> {
    const { data } = await client.get<{ product: Product }>(`/products/${id}`);
    return data.product;
  }

  /* ── /order/place ── */
  async function placeOrder(
    body: PlaceOrderRequest,
  ): Promise<PlaceOrderResponse> {
    const { data } = await client.post<PlaceOrderResponse>(
      "/order/place",
      body,
    );
    return data;
  }

  /* ── /health ── */
  async function healthCheck(): Promise<{
    status: string;
    woocommerce_connected: boolean;
  }> {
    const { data } = await client.get("/health");
    return data;
  }

  return {
    sendChat,
    fetchHistory,
    clearHistory,
    fetchCategories,
    fetchProduct,
    placeOrder,
    healthCheck,
  };
}

// ── Shared request/response types ──

export interface Category {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface PlaceOrderRequest {
  product_id: number;
  quantity?: number;
  session_id?: string;
  user_context?: {
    email?: string;
    customer_id?: number;
  };
}

export interface PlaceOrderResponse {
  success: boolean;
  order?: Order;
  bot_message: string;
  error?: string;
  session_id?: string;
}
