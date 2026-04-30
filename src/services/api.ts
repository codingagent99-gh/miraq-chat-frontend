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
  async function fetchHistory(
    sessionId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<HistoryResponse> {
    const { data } = await client.get<HistoryResponse>(
      `/chat/history?page=${page}&limit=${limit}`,
      {
        headers: {
          "X-MiraQ-Session": sessionId,
          "X-WC-Session": getWooCommerceSession(),
        },
      },
    );
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

// ── WP REST API types ──────────────────────────────────────────────────────

export interface WpCountry {
  code: string;
  name: string;
  states: { code: string; name: string }[];
}

export interface WpRep {
  value: string; // user_email — stored as _billing_project_rep meta
  label: string; // display_name e.g. "Adria W."
}

// ── WP REST API fetch helpers ──────────────────────────────────────────────
// These call your plugin's custom-api/v1 endpoints directly on the WP site.
// They are intentionally separate from createApiClient (which points at the
// MiraQ chat backend, not WordPress).

export async function fetchWpCountries(wpBase: string): Promise<WpCountry[]> {
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/countries`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Countries fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchWpReps(wpBase: string): Promise<WpRep[]> {
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/reps`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Reps fetch failed: ${res.status}`);
  return res.json();
}
