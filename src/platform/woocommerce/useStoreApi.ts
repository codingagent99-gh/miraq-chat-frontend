/**
 * platform/woocommerce/useStoreApi.ts
 *
 * WooCommerce Store API authentication layer.
 * Handles nonce expiry + rotation, Cart-Token persistence.
 * Moved from hooks/useStoreApi.ts — logic is unchanged.
 */

import { useRef, useCallback } from "react";
import type { StoreApiFetch, UseStoreApiReturn } from "../types";

interface UseStoreApiOptions {
  nonce?: string;
  nonceExpires?: number;
  cartToken?: string;
}

export function useStoreApi({
  nonce,
  cartToken,
}: UseStoreApiOptions): UseStoreApiReturn {
  const nonceRef = useRef<string>(nonce ?? "");
  const nonceExpiresRef = useRef<number>(0);
  const cartTokenRef = useRef<string>(cartToken ?? "");

  const resetCartToken = useCallback(() => {
    console.log(
      "[MiraQ DEBUG] resetCartToken() called — clearing ref (was:",
      cartTokenRef.current || "(empty)",
      ")",
    );
    cartTokenRef.current = "";
  }, []);

  const siteOrigin = import.meta.env.VITE_WP_BASE_URL || window.location.origin;

  // Returns a valid nonce, refreshing if within 1 minute of expiry.
  const getFreshNonce = useCallback(async (): Promise<string> => {
    if (Date.now() < nonceExpiresRef.current - 60_000) {
      return nonceRef.current;
    }
    try {
      const res = await fetch(`${siteOrigin}/wp-json/wc/store/v1/cart`, {
        credentials: "include",
      });
      const rotatedNonce = res.headers.get("Nonce");
      const rotatedCartToken = res.headers.get("Cart-Token");
      console.log("[MiraQ DEBUG] nonce bootstrap ← /cart", {
        status: res.status,
        gotNonce: !!rotatedNonce,
        nonceValue: rotatedNonce,
      });
      if (rotatedNonce) {
        nonceRef.current = rotatedNonce;
        nonceExpiresRef.current = Date.now() + 12 * 60 * 60 * 1000;
      }
      if (rotatedCartToken) {
        cartTokenRef.current = rotatedCartToken;
      }
    } catch (e) {
      console.warn("[MiraQ] Nonce refresh failed, using stale nonce", e);
    }
    return nonceRef.current;
  }, [siteOrigin]);

  /**
   * Wraps fetch for any /wc/store/v1/* call.
   * Automatically attaches nonce + cart token, captures rotated nonce from response.
   */
  const storeApiFetch: StoreApiFetch = useCallback(
    async (path, init = {}) => {
      const freshNonce = await getFreshNonce();

      // Only attach Cart-Token when we have a real one — an empty string is
      // still a *present* header to WC's Store API and forces headless/JWT
      // mode instead of falling back to the cookie session.
      const sentToken = cartTokenRef.current;
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("Nonce", freshNonce);
      if (sentToken) headers.set("Cart-Token", sentToken);

      console.log("[MiraQ DEBUG] storeApiFetch → " + path, {
        sentCartToken:
          sentToken || "(none — should fall back to cookie session)",
      });

      const response = await fetch(`${siteOrigin}/wp-json/wc/store/v1${path}`, {
        ...init,
        credentials: "include",
        headers,
      });

      // WC rotates the nonce on every response — keep it fresh.
      const rotatedNonce = response.headers.get("Nonce");
      if (rotatedNonce) {
        nonceRef.current = rotatedNonce;
        nonceExpiresRef.current = Date.now() + 12 * 60 * 60 * 1000;
      }

      // WC also rotates Cart-Token — stale token breaks /checkout.
      const rotatedCartToken = response.headers.get("Cart-Token");
      if (rotatedCartToken) {
        cartTokenRef.current = rotatedCartToken;
      }

      console.log("[MiraQ DEBUG] storeApiFetch ← " + path, {
        status: response.status,
        sentCartToken: sentToken || "(none)",
        receivedCartToken: rotatedCartToken || "(none)",
        tokenChanged: !!rotatedCartToken && rotatedCartToken !== sentToken,
      });
      return response;
    },
    [getFreshNonce, siteOrigin],
  );

  return { storeApiFetch, resetCartToken };
}
