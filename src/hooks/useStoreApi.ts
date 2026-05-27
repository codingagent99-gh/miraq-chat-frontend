/**
 * hooks/useStoreApi.ts
 *
 * Platform-switching re-export.
 * Mirrors the pattern in hooks/useCart.ts — see that file for details.
 *
 * ChatWidget.tsx calls this identically for both platforms:
 *   const { storeApiFetch } = useStoreApi({ nonce, nonceExpires, cartToken });
 *
 * On Shopify, nonce/nonceExpires/cartToken are silently ignored and
 * storeApiFetch returns a 501 stub (CheckoutPanel is not rendered on Shopify).
 */

import { useStoreApi as wcUseStoreApi } from "../platform/woocommerce/useStoreApi";
import { useStoreApi as shopifyUseStoreApi } from "../platform/shopify/useStoreApi";

const PLATFORM = (import.meta.env.VITE_PLATFORM ?? "woocommerce") as
  | "woocommerce"
  | "shopify";

export const useStoreApi =
  PLATFORM === "shopify" ? shopifyUseStoreApi : wcUseStoreApi;

// ── Shared type re-exports ────────────────────────────────────────────────────
export type { StoreApiFetch, UseStoreApiReturn } from "../platform/types";
