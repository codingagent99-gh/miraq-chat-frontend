/**
 * platform/shopify/useCart.ts
 *
 * Shopify cart operations via the Ajax Cart API (/cart/add.js, /cart/change.js,
 * /cart.js). This replaces the previous Storefront GraphQL implementation.
 *
 * WHY THE CHANGE:
 * The Storefront API creates an isolated server-side cart that is only referenced
 * by the GID stored in localStorage. The Shopify theme (cart drawer, cart page,
 * header badge) reads from the session-cookie cart managed by the Ajax Cart API.
 * These two systems are completely independent — mutations to the Storefront API
 * cart are invisible to the theme. Using the Ajax Cart API writes directly to the
 * same session cart the theme already reads, so items added via the widget appear
 * on the main site immediately.
 *
 * Checkout: redirects to /checkout (the standard Shopify checkout entry point).
 * storefrontToken and shopDomain are accepted but unused — kept for API
 * compatibility with ChatWidget.tsx so no call-site changes are needed.
 *
 * Callers (useChatActions → addItem):
 *   addItem(variantGidOrNumericId, qty)
 *   Both "gid://shopify/ProductVariant/123456789" and plain "123456789" are
 *   accepted — toVariantId() normalises either form to the numeric ID that
 *   the Ajax Cart API expects.
 */

import { useState, useCallback, useEffect } from "react";
import type {
  PlatformCart,
  PlatformCartItem,
  UseCartReturn,
  StoreApiFetch,
} from "../types";

// ─── Ajax Cart API response types ─────────────────────────────────────────────

interface AjaxCartItem {
  key: string; // line-item key, e.g. "40284981846101:abc"
  variant_id: number;
  product_id: number;
  product_title: string;
  variant_title: string | null;
  title: string; // "Product – Variant" combined
  quantity: number;
  price: number; // unit price in minor units
  final_price: number; // after discounts
  line_price: number; // quantity × price
  final_line_price: number; // quantity × final_price
  image: string | null;
  options_with_values: { name: string; value: string }[];
  currency: string;
}

interface AjaxCart {
  token: string;
  item_count: number;
  items: AjaxCartItem[];
  items_subtotal_price: number;
  total_price: number;
  total_discount: number;
  currency: string;
  requires_shipping?: boolean;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

/** Derives a display symbol from an ISO currency code using the Intl API. */
function currencySymbol(code: string): string {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(0)
        .replace(/[\d,.\s]/g, "")
        .trim() || code
    );
  } catch {
    return code;
  }
}

/** Maps an Ajax Cart API response to PlatformCart for CartPanel. */
function mapAjaxCart(ajaxCart: AjaxCart): PlatformCart {
  const cc = ajaxCart.currency;
  const sym = currencySymbol(cc);

  const items: PlatformCartItem[] = ajaxCart.items.map((item) => {
    // Exclude the synthetic "Default Title" / "Title" option for single-variant
    // products so CartPanel doesn't render a meaningless variation label.
    const variation = item.options_with_values
      .filter(
        (o) =>
          o.name.toLowerCase() !== "title" &&
          o.value.toLowerCase() !== "default title",
      )
      .map((o) => ({ attribute: o.name, value: o.value }));

    // Build a clean display name; omit variant portion if it's the default.
    const displayName =
      item.variant_title && item.variant_title.toLowerCase() !== "default title"
        ? `${item.product_title} – ${item.variant_title}`
        : item.product_title;

    const img = item.image ?? "";

    return {
      key: item.key, // used for remove / update operations
      id: String(item.variant_id),
      name: displayName,
      quantity: item.quantity,
      images: img ? [{ src: img, thumbnail: img }] : [],
      prices: {
        price: String(item.final_price),
        regular_price: String(item.price),
        currency_code: cc,
        currency_symbol: sym,
        currency_minor_unit: 2,
      },
      totals: {
        line_total: String(item.final_line_price),
        line_subtotal: String(item.line_price),
      },
      variation,
    };
  });

  return {
    items,
    items_count: ajaxCart.item_count,
    totals: {
      total_items: String(ajaxCart.items_subtotal_price),
      total_items_tax: "0", // Ajax API doesn't expose tax breakdown before checkout
      total_shipping: "0", // calculated at checkout
      total_tax: "0",
      total_price: String(ajaxCart.total_price),
      currency_code: cc,
      currency_symbol: sym,
      currency_minor_unit: 2,
    },
    needs_shipping: ajaxCart.requires_shipping ?? true,
    // Standard Shopify checkout entry point. ShopifyCheckoutPanel redirects here.
    checkoutUrl: "/checkout",
  };
}

// ─── Ajax Cart API helpers ────────────────────────────────────────────────────

/**
 * Normalises a Shopify variant identifier to a plain numeric ID.
 * Accepts either:
 *   - A GID string:  "gid://shopify/ProductVariant/123456789" → 123456789
 *   - A numeric string or number: "123456789" / 123456789    → 123456789
 */
function toVariantId(id: number | string): number {
  const str = String(id);
  const gidMatch = str.match(/\/(\d+)$/);
  return gidMatch ? parseInt(gidMatch[1], 10) : parseInt(str, 10);
}

/** GET /cart.js — returns the current session cart. */
async function ajaxGetCart(): Promise<AjaxCart> {
  const res = await fetch("/cart.js", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Ajax Cart GET HTTP ${res.status}`);
  return res.json();
}

/** POST to an Ajax Cart endpoint, returns the parsed JSON body. */
async function ajaxPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ajax Cart POST ${path} HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param _storeApiFetch    Accepted for API compatibility — unused on Shopify.
 * @param _storefrontToken  Accepted for API compatibility — unused; cart now
 *                          goes through the Ajax Cart API, not the Storefront API.
 * @param _shopDomain       Accepted for API compatibility — unused; all Ajax
 *                          requests are same-origin relative paths.
 */
export function useCart(
  _storeApiFetch?: StoreApiFetch,
  _storefrontToken = "",
  _shopDomain = "",
): UseCartReturn {
  const [cart, setCart] = useState<PlatformCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Bootstrap: load the session cart on mount ─────────────────────────────
  useEffect(() => {
    // Clean up any stale Storefront API cart GID left by the old implementation.
    try {
      localStorage.removeItem("miraQ_shopify_cart_id");
    } catch {
      // localStorage unavailable — ignore
    }

    (async () => {
      try {
        const ajaxCart = await ajaxGetCart();
        // Only hydrate state if the cart has items; avoids overwriting a null
        // state with an empty cart object on first visit.
        if (ajaxCart.item_count > 0) {
          setCart(mapAjaxCart(ajaxCart));
        }
      } catch (e) {
        console.warn("[MiraQ] Shopify cart bootstrap failed", e);
      }
    })();
  }, []);

  // ── fetchCart ─────────────────────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ajaxCart = await ajaxGetCart();
      setCart(mapAjaxCart(ajaxCart));
    } catch (e) {
      setError("Could not load cart.");
      console.error("[MiraQ] Shopify fetchCart:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── addItem ───────────────────────────────────────────────────────────────
  /**
   * Adds a variant to the cart via POST /cart/add.js.
   *
   * @param productId  Shopify variant identifier — either a full GID
   *                   ("gid://shopify/ProductVariant/123456789") or a plain
   *                   numeric ID / string. variationId is ignored because
   *                   each Shopify variant already encodes all option values.
   * @param quantity   Units to add (default 1).
   */
  const addItem = useCallback(
    async (
      productId: number | string,
      quantity = 1,
      _variationId?: number | string,
      _variationAttributes?: { attribute: string; value: string }[],
    ): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const variantId = toVariantId(productId);

        // /cart/add.js only returns the lines that were just added, not the
        // full cart, so we follow up with a /cart.js fetch for complete state.
        await ajaxPost<{ items: AjaxCartItem[] }>("/cart/add.js", {
          items: [{ id: variantId, quantity }],
        });

        const ajaxCart = await ajaxGetCart();
        setCart(mapAjaxCart(ajaxCart));
      } catch (e) {
        setError("Could not add item to cart.");
        console.error("[MiraQ] Shopify addItem:", e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ── removeItem ────────────────────────────────────────────────────────────
  /**
   * Removes a line item by its Ajax Cart key (item.key from PlatformCartItem).
   * Setting quantity to 0 via /cart/change.js removes the line entirely and
   * returns the updated full cart.
   */
  const removeItem = useCallback(async (key: string): Promise<void> => {
    setLoading(true);
    try {
      const ajaxCart = await ajaxPost<AjaxCart>("/cart/change.js", {
        id: key,
        quantity: 0,
      });
      setCart(mapAjaxCart(ajaxCart));
    } catch (e) {
      console.error("[MiraQ] Shopify removeItem:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── updateQuantity ────────────────────────────────────────────────────────
  const updateQuantity = useCallback(
    async (key: string, quantity: number): Promise<void> => {
      // Delegate to removeItem for quantity < 1 (consistent with WC version).
      if (quantity < 1) {
        await removeItem(key);
        return;
      }
      setLoading(true);
      try {
        const ajaxCart = await ajaxPost<AjaxCart>("/cart/change.js", {
          id: key,
          quantity,
        });
        setCart(mapAjaxCart(ajaxCart));
      } catch (e) {
        console.error("[MiraQ] Shopify updateQuantity:", e);
      } finally {
        setLoading(false);
      }
    },
    [removeItem],
  );

  return {
    cart,
    loading,
    error,
    fetchCart,
    addItem,
    removeItem,
    updateQuantity,
    setCart,
  };
}
