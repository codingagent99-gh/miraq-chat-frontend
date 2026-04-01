import axios, { type AxiosInstance } from "axios";
import type {
  ChatRequest,
  ChatResponse,
  HistoryResponse,
  Product,
} from "../types/api";

// Helper to scrape WooCommerce session from cookies
function getWooCommerceSession() {
  const cookies = document.cookie.split(";");
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();
    if (cookie.startsWith("wp_woocommerce_session_")) {
      return cookie.split("=")[1];
    }
  }
  return "";
}

export function createApiClient(baseURL?: string, apiKey?: string) {
  const resolvedBase = baseURL || import.meta.env.VITE_BASE || "";

  console.log("[MiraQ API] baseURL resolved to:", resolvedBase);

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
  async function sendChat(
    body: ChatRequest,
    sessionId: string,
  ): Promise<ChatResponse> {
    const { data } = await client.post<ChatResponse>("/chat", body, {
      headers: {
        "X-MiraQ-Session": sessionId,
        "X-WC-Session": getWooCommerceSession(),
      },
    });
    return data;
  }

  /* ── /chat/history ── */
  async function fetchHistory(sessionId: string): Promise<HistoryResponse> {
    const { data } = await client.get<HistoryResponse>("/chat/history", {
      headers: {
        "X-MiraQ-Session": sessionId,
        "X-WC-Session": getWooCommerceSession(),
      },
    });
    return data;
  }

  /* ── /chat/clear/:id ── */
  async function clearHistory(sessionId: string): Promise<void> {
    await client.delete(`/chat/clear/${sessionId}`);
  }

  /* ── /products/categories ── */
  async function fetchCategories(): Promise<any[]> {
    const { data } = await client.get<{ categories: any[] }>(
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
  async function placeOrder(body: any, sessionId: string): Promise<any> {
    const { data } = await client.post<any>("/order/place", body, {
      headers: {
        "X-MiraQ-Session": sessionId,
        "X-WC-Session": getWooCommerceSession(),
      },
    });
    return data;
  }

  /* ── /health ── */
  async function healthCheck(): Promise<any> {
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
