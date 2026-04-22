import { useRef, useCallback } from "react";

export type StoreApiFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

interface UseStoreApiOptions {
  nonce?: string;
  nonceExpires?: number;
  cartToken?: string;
}

/**
 * Manages WooCommerce Store API authentication.
 * Handles nonce expiry and refresh transparently.
 * Single source of truth — share one instance via ChatWidget.
 */
export function useStoreApi({
  nonce,
  nonceExpires,
  cartToken,
}: UseStoreApiOptions) {
  const nonceRef = useRef<string>(nonce ?? "");
  const nonceExpiresRef = useRef<number>(nonceExpires ?? 0);
  const cartTokenRef = useRef<string>(cartToken ?? "");
  const siteOrigin = import.meta.env.VITE_WP_BASE_URL || window.location.origin;

  // Returns a valid nonce, refreshing if within 1 minute of expiry
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

  // Wraps fetch for any /wc/store/v1/* call.
  // Automatically attaches nonce + cart token, captures refreshed nonce from response.
  const storeApiFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const freshNonceValue = await getFreshNonce();

      const response = await fetch(`${siteOrigin}/wp-json/wc/store/v1${path}`, {
        ...init,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Nonce: freshNonceValue,
          "Cart-Token": cartTokenRef.current,
          ...(init.headers ?? {}),
        },
      });

      // WC returns a rotated nonce on every response — keep it fresh
      const rotatedNonce = response.headers.get("Nonce");
      if (rotatedNonce) {
        nonceRef.current = rotatedNonce;
        nonceExpiresRef.current = Date.now() + 12 * 60 * 60 * 1000;
      }

      return response;
    },
    [getFreshNonce, siteOrigin],
  );

  return { storeApiFetch };
}
