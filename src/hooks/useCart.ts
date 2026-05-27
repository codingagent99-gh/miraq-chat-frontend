/**
 * hooks/useCart.ts
 *
 * Platform-switching re-export.
 * Set VITE_PLATFORM=woocommerce (default) or VITE_PLATFORM=shopify in your
 * .env file. The correct implementation is resolved at build time — no
 * runtime branching, no bundle bloat from the unused platform.
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

const PLATFORM = (import.meta.env.VITE_PLATFORM ?? "woocommerce") as
  | "woocommerce"
  | "shopify";

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
