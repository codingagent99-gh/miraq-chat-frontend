/**
 * hooks/useCart.ts
 *
 * Platform-switching re-export.
 * Set VITE_PLATFORM=woocommerce (default) or VITE_PLATFORM=shopify in your
 * .env file. The correct implementation is resolved at build time — no
 * runtime branching, no bundle bloat from the unused platform.
 *
 * PLATFORM comes from platform/current.ts rather than reading
 * import.meta.env.VITE_PLATFORM again here. This file previously did its own
 * `?? "woocommerce"` fallback with no validation — a typo'd VITE_PLATFORM
 * would silently build the WooCommerce cart implementation for a Shopify
 * store with no warning anywhere. platform/current.ts's resolvePlatform()
 * does the same fallback but logs loudly when the value isn't recognized,
 * and is the same constant ChatWidget.tsx and useStoreApi.ts now read too —
 * one build can no longer disagree with itself about which platform it is.
 *
 * Usage throughout the app stays identical:
 *   import { useCart } from "./hooks/useCart";
 *
 * Also re-exports shared cart types so the rest of the app has a single
 * import location:
 *   import { useCart, PlatformCart } from "./hooks/useCart";
 */

import { useCart as wcUseCart } from "../platform/woocommerce/useCart";
import { useCart as shopifyUseCart } from "../platform/shopify/useCart";
import { PLATFORM } from "../platform/current";

export const useCart = PLATFORM === "shopify" ? shopifyUseCart : wcUseCart;

// ── Shared type re-exports ────────────────────────────────────────────────────
export type {
  PlatformCart,
  PlatformCartItem,
  PlatformCartItemPrices,
  UseCartReturn,
  AddItemFn,
} from "../platform/types";

// Backward-compat aliases — migrate callers to PlatformCart when convenient.
export type {
  WCCart,
  WCCartItem,
  WCCartItemPrices,
} from "../platform/woocommerce/useCart";
