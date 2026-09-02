/**
 * hooks/useStoreApi.ts
 *
 * Platform-switching re-export.
 * Mirrors the pattern in hooks/useCart.ts — see that file for details on why
 * PLATFORM comes from platform/current.ts rather than reading
 * import.meta.env.VITE_PLATFORM again locally.
 *
 * ChatWidget.tsx calls this identically for both platforms:
 *   const { storeApiFetch } = useStoreApi({ nonce, nonceExpires, cartToken });
 *
 * On Shopify, nonce/nonceExpires/cartToken are silently ignored and
 * storeApiFetch returns a 501 stub (CheckoutPanel is not rendered on Shopify).
 */

import { useStoreApi as wcUseStoreApi } from "../platform/woocommerce/useStoreApi";
import { useStoreApi as shopifyUseStoreApi } from "../platform/shopify/useStoreApi";
import { PLATFORM } from "../platform/current";

export const useStoreApi =
  PLATFORM === "shopify" ? shopifyUseStoreApi : wcUseStoreApi;

// ── Shared type re-exports ────────────────────────────────────────────────────
export type { StoreApiFetch, UseStoreApiReturn } from "../platform/types";
