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
      timeout: 60_000,
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

/** One option from the billing_field_type (Order Type) select field. */
export interface WpOrderTypeOption {
  value: string; // e.g. "existing_deal"
  label: string; // e.g. "Existing Deal"
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

/**
 * Fetches Order Type options from the dedicated /order-types endpoint.
 *
 * billing_field_type is registered by THWCFE outside WooCommerce's standard
 * checkout fields filter, so it never appears in /checkout-fields. The plugin
 * exposes a dedicated endpoint that reads directly from THWCFE's option store.
 *
 * Response shape: [{ value: "existing_deal", label: "Existing Deal" }, ...]
 */
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
// Addresses saved by the "Multiple Addresses for WooCommerce" (THWMA) plugin.
// Exposed via the custom /saved-addresses endpoint in class-api.php.

export interface ThwmaSavedAddress {
  id: string; // "address_0", "address_1", etc. — THWMA's key
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

/**
 * Returns the wp_rest nonce injected by PHP at page load via wp_add_inline_script.
 *
 * WHY we read from window instead of fetching /refresh-nonce:
 *   The REST endpoint runs as anonymous user (user 0) because WordPress has no
 *   prior authenticated context when it executes. wp_create_nonce('wp_rest')
 *   inside that request produces a nonce tied to user 0. When the browser then
 *   sends its WP auth cookie (real user) + that nonce (user 0), WordPress sees
 *   a mismatch and returns 403 rest_cookie_invalid_nonce.
 *
 *   PHP injects this value during a normal authenticated page load where the
 *   real user identity is already established, so the nonce is always correct.
 *   See wp_add_inline_script('silfra-chat-widget', ...) in class-widget.php.
 */
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

/**
 * Returns all THWMA saved shipping addresses for the currently logged-in user.
 * Returns an empty array if the user is a guest or the fetch fails.
 *
 * Omits X-WP-Nonce entirely when no nonce is available (guest users) so
 * WordPress does not attempt cookie auth and return 403.
 */
export async function fetchWpSavedAddresses(
  wpBase: string,
): Promise<ThwmaSavedAddress[]> {
  const nonce = getWpRestNonce();

  // Do not attempt the call for guests — the endpoint requires auth and
  // sending an empty X-WP-Nonce actively triggers a 403 from WordPress.
  if (!nonce) return [];

  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/saved-addresses`, {
    credentials: "include",
    headers: { "X-WP-Nonce": nonce },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as ThwmaSavedAddress[]) : [];
}

/**
 * Saves a new shipping address to the THWMA address book for the current user.
 * Called when the user adds a new address in multi-address mode.
 *
 * Returns { success: false, id: "" } silently for guests (no nonce available).
 */
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
