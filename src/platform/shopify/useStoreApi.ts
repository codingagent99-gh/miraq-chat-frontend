/**
 * platform/shopify/useStoreApi.ts
 *
 * Shopify platform stub for useStoreApi.
 *
 * storeApiFetch is a WooCommerce-specific REST wrapper used exclusively by
 * CheckoutPanel. Since Shopify checkout is not yet implemented, this returns
 * a no-op stub so ChatWidget.tsx compiles without changes.
 *
 * When Shopify checkout is added, replace the stub with a real implementation
 * that calls the Storefront API cartCreate/checkoutCreate mutations and
 * redirects to cart.checkoutUrl.
 *
 * All actual Shopify cart operations live in platform/shopify/useCart.ts and
 * call the Storefront GraphQL API directly — they do NOT go through storeApiFetch.
 */

import { useCallback } from "react";
import type { UseStoreApiReturn } from "../types";

interface UseStoreApiOptions {
  /** Accepted for API compatibility with the WC version — ignored on Shopify. */
  nonce?: string;
  nonceExpires?: number;
  cartToken?: string;
}

export function useStoreApi(
  _options: UseStoreApiOptions = {},
): UseStoreApiReturn {
  /**
   * No-op stub — CheckoutPanel (the only consumer of storeApiFetch) is
   * WooCommerce-only for now and is not rendered on the Shopify platform.
   *
   * TODO: replace with Shopify checkout redirect logic when ready.
   */
  const storeApiFetch = useCallback(
    async (_path: string, _init?: RequestInit): Promise<Response> => {
      console.warn(
        "[MiraQ] storeApiFetch called on Shopify platform — not yet implemented. " +
          "Shopify checkout should redirect to cart.checkoutUrl instead.",
      );
      return new Response(
        JSON.stringify({ error: "storeApiFetch not implemented for Shopify" }),
        { status: 501, headers: { "Content-Type": "application/json" } },
      );
    },
    [],
  );

  const resetCartToken = useCallback(() => {
    // No-op: Shopify uses a cart GID stored in localStorage, not a session token.
  }, []);

  return { storeApiFetch, resetCartToken };
}
