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

export function createApiClient(
  baseURL?: string,
  apiKey?: string,
  licenseId?: string,
) {
  const resolvedBase = baseURL || "";
  console.log("[MiraQ API] baseURL resolved to:", resolvedBase);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (licenseId) {
    headers["X-MiraQ-License-Id"] = licenseId;
  }

  const client: AxiosInstance = axios.create({
    baseURL: resolvedBase,
    headers,
    timeout: 30_000,
  });

  /* ── /chat ── */
  // In sendChat — replace the existing function body:
  async function sendChat(
    body: ChatRequest,
    sessionId: string,
  ): Promise<ChatResponse> {
    try {
      const { data } = await client.post<ChatResponse>("/chat", body, {
        headers: {
          "X-MiraQ-Session": sessionId,
          "X-WC-Session": getWooCommerceSession(),
        },
        timeout: 60_000,
      });
      return data;
    } catch (err: any) {
      if (
        err.response?.status === 429 &&
        err.response?.data?.error?.code === "DAILY_LIMIT_REACHED"
      ) {
        const e: any = new Error("DAILY_LIMIT_REACHED");
        e.isDailyLimitError = true;
        e.limitData = err.response.data.error; // { limit, used, reset_at }
        throw e;
      }
      throw err;
    }
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

  /* ── /products/:id/similar ── */
  async function fetchSimilarProducts(
    id: number,
  ): Promise<{ products: Product[]; source: "cross_sell" | "related" }> {
    const { data } = await client.get<{
      products: Product[];
      source: "cross_sell" | "related";
    }>(`/products/${id}/similar`);
    return data;
  }

  /* ── /products/similar/save ── */
  async function saveSimilarMessage(
    sessionId: string,
    text: string,
    products: Product[],
  ): Promise<void> {
    await client.post("/products/similar/save", {
      session_id: sessionId,
      text,
      products,
    });
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

  async function submitCartResult(
    body: {
      session_id: string;
      success: boolean;
      product_name: string;
      quantity: number;
    },
    sessionId: string,
  ): Promise<{ bot_message: string; actions: any[]; suggestions: string[] }> {
    const { data } = await client.post("/chat/cart-result", body, {
      headers: {
        "X-MiraQ-Session": sessionId,
        "X-WC-Session": getWooCommerceSession(),
      },
    });
    return data;
  }

  async function submitOrderConfirmation(
    body: { session_id: string; order_id: string | number },
    sessionId: string,
  ): Promise<{ success: boolean; bot_message: string }> {
    const { data } = await client.post("/chat/order-confirmed", body, {
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
    fetchSimilarProducts,
    saveSimilarMessage,
    placeOrder,
    submitCartResult,
    submitOrderConfirmation,
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

/** One option from the billing_field_type (Order Type) select field. */
export interface WpOrderTypeOption {
  value: string; // e.g. "existing_deal"
  label: string; // e.g. "Existing Deal"
}

// ── WP REST API fetch helpers ──────────────────────────────────────────────

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

export async function fetchWpOrderTypes(
  wpBase: string,
): Promise<WpOrderTypeOption[]> {
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/order-types`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Order types fetch failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data as WpOrderTypeOption[];
  console.warn("[MiraQ] Unexpected /order-types shape:", data);
  return [];
}

// ── THWMA Saved Addresses ──────────────────────────────────────────────────

export interface ThwmaSavedAddress {
  id: string;
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  heading: string;
}

function getWpRestNonce(): string {
  const nonce = (window as any).__miraqWpRestNonce;
  if (nonce) return nonce as string;
  console.warn(
    "[MiraQ] wp_rest nonce not found on window. " +
      "Ensure the user is logged in and class-widget.php is deploying the fix. " +
      "Saved address calls will be skipped.",
  );
  return "";
}

export async function fetchWpSavedAddresses(
  wpBase: string,
): Promise<ThwmaSavedAddress[]> {
  const nonce = getWpRestNonce();
  if (!nonce) return [];
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/saved-addresses`, {
    credentials: "include",
    headers: { "X-WP-Nonce": nonce },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as ThwmaSavedAddress[]) : [];
}

export async function saveWpAddress(
  wpBase: string,
  address: {
    first_name: string;
    last_name: string;
    company?: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  },
): Promise<{ success: boolean; id: string }> {
  const nonce = getWpRestNonce();
  if (!nonce) return { success: false, id: "" };
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/saved-addresses`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-WP-Nonce": nonce,
    },
    body: JSON.stringify(address),
  });
  if (!res.ok) return { success: false, id: "" };
  return res.json() as Promise<{ success: boolean; id: string }>;
}
