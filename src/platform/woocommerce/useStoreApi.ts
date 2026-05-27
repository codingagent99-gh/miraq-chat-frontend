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
  nonceExpires,
  cartToken,
}: UseStoreApiOptions): UseStoreApiReturn {
  const nonceRef = useRef<string>(nonce ?? "");
  const nonceExpiresRef = useRef<number>(nonceExpires ?? 0);
  const cartTokenRef = useRef<string>(cartToken ?? "");

  const resetCartToken = useCallback(() => {
    cartTokenRef.current = "";
  }, []);

  const siteOrigin = import.meta.env.VITE_WP_BASE_URL || window.location.origin;

  // Returns a valid nonce, refreshing if within 1 minute of expiry.
  const getFreshNonce = useCallback(async (): Promise<string> => {
    if (Date.now() < nonceExpiresRef.current - 60_000) {
      return nonceRef.current;
    }
    try {
      const res = await fetch(
        `${siteOrigin}/wp-json/custom-api/v1/refresh-nonce`,
        { credentials: "include" },
      );
      const data = await res.json();
      nonceRef.current = data.nonce;
      nonceExpiresRef.current = data.expires; // already in ms from PHP
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

      const response = await fetch(`${siteOrigin}/wp-json/wc/store/v1${path}`, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Nonce: freshNonce,
          "Cart-Token": cartTokenRef.current,
          ...(init.headers ?? {}),
        },
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

      return response;
    },
    [getFreshNonce, siteOrigin],
  );

  return { storeApiFetch, resetCartToken };
}
