/**
 * platform/woocommerce/useCart.ts
 *
 * WooCommerce Store API cart state.
 * Moved from hooks/useCart.ts — logic is unchanged.
 * Now returns PlatformCart so it satisfies UseCartReturn.
 */

import { useState, useCallback, useEffect } from "react";
import type { StoreApiFetch } from "../types";
import type {
  PlatformCart,
  PlatformCartItem,
  PlatformCartItemPrices,
  UseCartReturn,
} from "../types";

// ── Re-export WC-specific aliases for any code that still imports them ────────
/** @deprecated Import PlatformCart from platform/types instead. */
export type WCCartItemPrices = PlatformCartItemPrices;
/** @deprecated Import PlatformCartItem from platform/types instead. */
export type WCCartItem = PlatformCartItem;
/** @deprecated Import PlatformCart from platform/types instead. */
export type WCCart = PlatformCart;

// ─────────────────────────────────────────────────────────────────────────────

export function useCart(storeApiFetch: StoreApiFetch): UseCartReturn {
  const [cart, setCart] = useState<PlatformCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Bootstrap: prime the nonce + Cart-Token refs on first render ──────────
  useEffect(() => {
    async function bootstrap() {
      try {
        await storeApiFetch("/cart");
        // storeApiFetch captures Nonce + Cart-Token from response headers
        // automatically — nothing else needed here.
      } catch (e) {
        console.warn("[MiraQ] WC cart bootstrap failed", e);
      }
    }
    bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch current cart state ──────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storeApiFetch("/cart");
      if (!res.ok) throw new Error(`Cart fetch failed: ${res.status}`);
      const data: PlatformCart = await res.json();
      setCart(data);
    } catch (e) {
      setError("Could not load cart.");
      console.error("[MiraQ] fetchCart:", e);
    } finally {
      setLoading(false);
    }
  }, [storeApiFetch]);

  // ── Add item ──────────────────────────────────────────────────────────────
  const addItem = useCallback(
    async (
      productId: number | string,
      quantity = 1,
      variationId?: number | string,
      variationAttributes?: { attribute: string; value: string }[],
    ): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await storeApiFetch("/cart/add-item", {
          method: "POST",
          body: JSON.stringify({
            id: variationId ?? productId,
            quantity,
            ...(variationAttributes?.length
              ? { variation: variationAttributes }
              : {}),
          }),
        });
        if (!res.ok) throw new Error(`Add item failed: ${res.status}`);
        const data: PlatformCart = await res.json();
        setCart(data);
      } catch (e) {
        setError("Could not add item to cart.");
        console.error("[MiraQ] addItem:", e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [storeApiFetch],
  );

  // ── Remove item by cart item key ──────────────────────────────────────────
  const removeItem = useCallback(
    async (key: string): Promise<void> => {
      setLoading(true);
      try {
        const res = await storeApiFetch("/cart/remove-item", {
          method: "POST",
          body: JSON.stringify({ key }),
        });
        if (!res.ok) throw new Error(`Remove item failed: ${res.status}`);
        const data: PlatformCart = await res.json();
        setCart(data);
      } catch (e) {
        console.error("[MiraQ] removeItem:", e);
      } finally {
        setLoading(false);
      }
    },
    [storeApiFetch],
  );

  // ── Update quantity (remove if qty < 1) ───────────────────────────────────
  const updateQuantity = useCallback(
    async (key: string, quantity: number): Promise<void> => {
      if (quantity < 1) {
        await removeItem(key);
        return;
      }
      setLoading(true);
      try {
        const res = await storeApiFetch("/cart/update-item", {
          method: "POST",
          body: JSON.stringify({ key, quantity }),
        });
        if (!res.ok) throw new Error(`Update quantity failed: ${res.status}`);
        const data: PlatformCart = await res.json();
        setCart(data);
      } catch (e) {
        console.error("[MiraQ] updateQuantity:", e);
      } finally {
        setLoading(false);
      }
    },
    [storeApiFetch, removeItem],
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
