/**
 * platform/types.ts
 *
 * Canonical cart types shared by every platform adapter (WooCommerce, Shopify, …).
 * The shape mirrors WooCommerce's Store API response so existing UI components
 * (CartPanel, CheckoutPanel, etc.) work without modification.
 *
 * Platform adapters in platform/woocommerce/ and platform/shopify/ both return
 * PlatformCart. Shopify-specific fields (e.g. checkoutUrl) are marked optional
 * so WC code never needs to know about them.
 */

import type React from "react";

// ─── Re-exported so the rest of the app imports from one place ───────────────
// If you previously imported AddressDict / ShippingPackage from their own
// files you can keep doing so; this is just for convenience.
export type { AddressDict } from "../types/actions";
export type { ShippingPackage } from "../types/checkout";

// ─── Cart item ────────────────────────────────────────────────────────────────

export interface PlatformCartItemPrices {
  /**
   * Unit price in minor currency units (e.g. paise, cents).
   * Divide by 10^currency_minor_unit to get display value.
   * Shopify adapter pre-multiplies by 100 so this is always comparable.
   */
  price: string;
  regular_price: string;
  currency_code: string;
  currency_symbol: string;
  currency_minor_unit: number;
}

export interface PlatformCartItem {
  /** Unique cart-line identifier.
   *  WC  → WooCommerce cart item key (hash string)
   *  Shopify → Cart line GID (gid://shopify/CartLine/…)
   */
  key: string;
  /** Product/variant identifier.
   *  WC      → numeric product/variation ID
   *  Shopify → ProductVariant GID string
   */
  id: number | string;
  name: string;
  quantity: number;
  images: { src: string; thumbnail: string }[];
  prices: PlatformCartItemPrices;
  totals: {
    line_total: string;
    line_subtotal: string;
  };
  variation: { attribute: string; value: string }[];
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface PlatformCart {
  items: PlatformCartItem[];
  items_count: number;
  totals: {
    total_items: string;
    total_items_tax: string;
    total_shipping: string;
    total_tax: string;
    total_price: string;
    currency_code: string;
    currency_symbol: string;
    currency_minor_unit: number;
  };

  // ── WooCommerce-specific (present when VITE_PLATFORM=woocommerce) ───────────
  billing_address?: import("../types/actions").AddressDict;
  shipping_address?: import("../types/actions").AddressDict;
  shipping_rates?: import("../types/checkout").ShippingPackage[];
  payment_methods?: string[];
  needs_shipping?: boolean;
  has_calculated_shipping?: boolean;
  needs_payment?: boolean;
  payment_requirements?: string[];

  // ── Shopify-specific (present when VITE_PLATFORM=shopify) ──────────────────
  /** Shopify hosted-checkout URL. Use this when redirecting to Shopify checkout. */
  checkoutUrl?: string;
}

// ─── Hook return shapes ───────────────────────────────────────────────────────

/** Consistent addItem signature across all platform adapters.
 *
 *  WooCommerce: productId = numeric product ID, variationId = numeric variation ID
 *  Shopify:     productId = variant GID  (variationId is ignored — each Shopify
 *               variant already has a unique GID used as the merchandise ID)
 */
export type AddItemFn = (
  productId: number | string,
  quantity?: number,
  variationId?: number | string,
  variationAttributes?: { attribute: string; value: string }[],
) => Promise<void>;

export interface UseCartReturn {
  cart: PlatformCart | null;
  loading: boolean;
  error: string | null;
  fetchCart: () => Promise<void>;
  addItem: AddItemFn;
  removeItem: (key: string) => Promise<void>;
  updateQuantity: (key: string, quantity: number) => Promise<void>;
  setCart: React.Dispatch<React.SetStateAction<PlatformCart | null>>;
}

/** REST fetch wrapper used by WooCommerce adapters and CheckoutPanel.
 *  Shopify adapter returns a no-op stub (CheckoutPanel is WC-only for now).
 */
export type StoreApiFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

export interface UseStoreApiReturn {
  storeApiFetch: StoreApiFetch;
  resetCartToken: () => void;
}
