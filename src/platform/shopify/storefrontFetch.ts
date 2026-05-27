/**
 * platform/shopify/storefrontFetch.ts
 *
 * Shared Shopify Storefront API fetch utility.
 * Extracted from useCart.ts (was storefrontQuery) and useCheckout.ts
 * (was storefrontFetch) — both were identical implementations.
 *
 * All Shopify platform modules import from here so the API version,
 * auth header, and cart ID key are defined in exactly one place.
 */

// ─── Cart ID persistence ──────────────────────────────────────────────────────

/** localStorage key for the Shopify cart GID. Shared across useCart and useCheckout. */
export const CART_ID_KEY = "miraQ_shopify_cart_id";

/**
 * Reads the stored Shopify cart GID from localStorage.
 * Returns null if localStorage is unavailable or no cart has been created yet.
 */
export function getStoredCartId(): string | null {
  try {
    return localStorage.getItem(CART_ID_KEY);
  } catch {
    return null;
  }
}

// ─── GraphQL fetch ────────────────────────────────────────────────────────────

export interface GqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Executes a Shopify Storefront API GraphQL request.
 *
 * @param query          GraphQL query or mutation string.
 * @param variables      Variables object, or undefined for queries with no variables.
 * @param shopDomain     Shopify store domain, e.g. "mystore.myshopify.com".
 *                       Falls back to window.location.origin when empty so local
 *                       dev proxies work without configuration.
 * @param storefrontToken Shopify Storefront public access token.
 */
export async function storefrontFetch<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  shopDomain: string,
  storefrontToken: string,
): Promise<GqlResponse<T>> {
  const origin = shopDomain ? `https://${shopDomain}` : window.location.origin;
  const res = await fetch(`${origin}/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Storefront API HTTP ${res.status}`);
  return res.json();
}
