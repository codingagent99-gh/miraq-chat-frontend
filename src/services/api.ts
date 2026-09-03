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

  /* ── /chat/order-status (Shopify) ──
   * Polled after returning from Shopify's hosted checkout, since the widget
   * has no client-side order id the way Woo's in-widget checkout does — see
   * ChatWidget.tsx's silfra_awaiting_shopify_order handling. */
  async function checkOrderStatus(
    sessionId: string,
  ): Promise<{ confirmed: boolean; bot_message: string | null }> {
    const { data } = await client.get("/chat/order-status", {
      params: { session_id: sessionId },
      headers: { "X-MiraQ-Session": sessionId },
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
    checkOrderStatus,
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

// ── wp_rest nonce bootstrap ────────────────────────────────────────────────
//
// Why the nonce is required at all: /saved-addresses and /company-addresses
// use permission_callback => 'is_user_logged_in'. WordPress will not resolve
// a session cookie to a user inside a REST request without a valid wp_rest
// nonce, so a missing nonce reads as "logged out" and 401s — credentials:
// "include" on its own is not enough.
//
// The ONLY source of this nonce is window.__miraqWpRestNonce, printed at page
// load by class-widget.php for logged-in users. It deliberately cannot be
// fetched at runtime, and an earlier draft of this module that tried to do so
// via /refresh-nonce could never have worked:
//
//   Core's rest_cookie_check_errors() calls wp_set_current_user(0) whenever a
//   cookie-authenticated REST request arrives with no X-WP-Nonce header —
//   which is exactly how a bootstrap call would have to arrive. Every nonce
//   minted inside that request is therefore bound to the anonymous user and
//   fails wp_verify_nonce() the moment a real user replays it.
//
// Consequences that follow from that, and are load-bearing below:
//   - there is no cache to populate and no concurrent callers to de-dupe;
//     the value is a page-load constant
//   - a 401/403 cannot be recovered from by refetching, because there is
//     nowhere fresher to fetch from. The nonce outlives 12h, so the realistic
//     trigger is a tab left open overnight, and the fix is a page reload
//   - /refresh-nonce remains useful only for the wc_store_api nonce on GUEST
//     carts, where user 0 is the correct binding
// ───────────────────────────────────────────────────────────────────────────

function readCachedWpRestNonce(): string {
  return ((window as any).__miraqWpRestNonce as string) || "";
}

/**
 * Resolves the wp_rest nonce printed at page load.
 *
 * Takes no arguments by design — see the block comment above. There is no
 * site-origin to fetch from and no force-refresh to perform; the value either
 * exists on window or the user is logged out.
 *
 * @returns The nonce, or "" when absent. Callers treat "" as "not available"
 *          and degrade to an empty result rather than surfacing an error.
 */
export async function ensureWpRestNonce(): Promise<string> {
  const nonce = readCachedWpRestNonce();
  if (!nonce) {
    console.warn(
      "[MiraQ] No wp_rest nonce on window — user is logged out, or " +
        "class-widget.php is not printing __miraqWpRestNonce.",
    );
  }
  return nonce;
}

/**
 * fetch() wrapper that attaches the wp_rest nonce.
 *
 * Returns null when no nonce is available at all, so callers can distinguish
 * "couldn't try" from "tried and got a bad status".
 *
 * No retry on 401/403: the nonce is a page-load constant, so a second attempt
 * would send the identical value and fail identically. A rejection here means
 * the nonce has expired (tab open past ~12h) or the session ended, and only a
 * page reload can mint a new one. That case is logged rather than silently
 * collapsing into an empty list.
 */
async function wpRestFetch(
  wpBase: string,
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const nonce = await ensureWpRestNonce();
  if (!nonce) return null;

  const send = (n: string) =>
    fetch(`${wpBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.headers ?? {}),
        "X-WP-Nonce": n,
      },
    });

  const res = await send(nonce);

  if (res.status === 401 || res.status === 403) {
    console.warn(
      `[MiraQ] ${path} rejected the wp_rest nonce (${res.status}). It is ` +
        "printed once at page load and cannot be refreshed from the client — " +
        "reload the page. If this happens on a fresh load, check that the " +
        "user is logged in and class-widget.php is printing " +
        "__miraqWpRestNonce.",
    );
  }

  return res;
}

// ── WP REST API fetch helpers ──────────────────────────────────────────────

export async function fetchWpCountries(wpBase: string): Promise<WpCountry[]> {
  const res = await fetch(`${wpBase}/wp-json/custom-api/v1/countries`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Countries fetch failed: ${res.status}`);
  return res.json();
}

/**
 * /reps is registered with permission_callback => '__return_true' (see
 * class-api.php:62) so that customers get the rep picker at checkout, not
 * just logged-in staff. It therefore takes no nonce — the previous version
 * gated this on getWpRestNonce() and returned [] for everyone, which looked
 * like a permissions problem but was purely client-side.
 */
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

export async function fetchWpSavedAddresses(
  wpBase: string,
): Promise<ThwmaSavedAddress[]> {
  const res = await wpRestFetch(
    wpBase,
    "/wp-json/custom-api/v1/saved-addresses",
  );
  if (!res || !res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as ThwmaSavedAddress[]) : [];
}

/**
 * Shape returned by GET /company-addresses for each matching address.
 *
 * One row is ONE ADDRESS, not one customer — a single account with six saved
 * destinations produces six rows. `id` is "<user_id>:<address_key>" and is the
 * only field safe to use as a React key or <option> value; `user_id` repeats
 * across rows and will collide.
 *
 * Rows come from the THWMA address book (`thwma_custom_address`), which is the
 * same source the site's own shipping_address_selector reads. It is a separate
 * store from the customer's stock WooCommerce account address, and the two
 * routinely disagree on both company label and street formatting.
 *
 * Each row carries flat `shipping_*` keys and an equivalent nested `shipping`
 * object; prefer the nested form. There is no `billing` block — this lookup is
 * keyed on the shipping company, so only shipping details are returned.
 */
export interface WpCompanyAddress {
  /**
   * Unique PER ADDRESS: "<user_id>:<address_key>" on the current plugin.
   * Typed as string | number because older plugin builds returned a bare
   * numeric user ID here — always coerce with String() before comparing it
   * against a DOM value, which is always a string.
   */
  id: string | number;
  user_id: number;
  address_key: string;
  email: string;
  company: string;

  shipping_first_name: string;
  shipping_last_name: string;
  shipping_company: string;
  shipping_address_1: string;
  shipping_address_2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postcode: string;
  shipping_country: string;

  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    phone: string;
  };
}

/** Envelope wrapper the endpoint returns. */
interface WpCompanyAddressResponse {
  success: boolean;
  count: number;
  /** True when the scan stopped early — there may be further matches. */
  truncated?: boolean;
  data: WpCompanyAddress[];
}

/**
 * Looks up saved shipping addresses filed under a company name.
 *
 * Matching is PARTIAL and case-insensitive, matching the site's own selector:
 * "beck" returns "BECK", "Beck Group" and "The Beck Group Architecture".
 *
 * Requires the user to be logged in; returns [] otherwise so callers can just
 * render nothing. Not self-scoped — any logged-in customer can look up any
 * company name (see get_my_company_addresses in class-api.php).
 */
export async function fetchCompanyAddresses(
  wpBase: string,
  company: string,
): Promise<WpCompanyAddress[]> {
  if (!company.trim()) return [];
  const res = await wpRestFetch(
    wpBase,
    `/wp-json/custom-api/v1/company-addresses?company=${encodeURIComponent(company)}`,
  );
  if (!res || !res.ok) return [];
  const data = await res.json();

  // Current contract: { success, count, truncated, data: [...] }.
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as WpCompanyAddressResponse).data)
  ) {
    return (data as WpCompanyAddressResponse).data;
  }

  // Legacy contract: a bare array. Kept so a widget build served to a site
  // still running the older plugin doesn't silently show an empty picker.
  if (Array.isArray(data)) return data as WpCompanyAddress[];

  return [];
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
  const res = await wpRestFetch(
    wpBase,
    "/wp-json/custom-api/v1/saved-addresses",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(address),
    },
  );
  if (!res || !res.ok) return { success: false, id: "" };
  return res.json() as Promise<{ success: boolean; id: string }>;
}
