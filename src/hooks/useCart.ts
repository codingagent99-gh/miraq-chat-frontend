import { useState, useCallback, useEffect } from "react";
import type { StoreApiFetch } from "./useStoreApi";

// ── WooCommerce Store API cart shape ──────────────────────────────────────────
// Prices are in minor currency units (e.g. paise for INR, cents for USD).
// Divide by 10^currency_minor_unit to get display value.

export interface WCCartItemPrices {
  price: string;
  regular_price: string;
  currency_code: string;
  currency_symbol: string;
  currency_minor_unit: number;
}

export interface WCCartItem {
  key: string;
  id: number;
  name: string;
  quantity: number;
  images: { src: string; thumbnail: string }[];
  prices: WCCartItemPrices;
  totals: {
    line_total: string;
    line_subtotal: string;
  };
  variation: { attribute: string; value: string }[];
}

export interface WCCart {
  items: WCCartItem[];
  items_count: number;
  totals: {
    total_items: string;
    total_shipping: string;
    total_tax: string;
    total_price: string;
    currency_code: string;
    currency_symbol: string;
    currency_minor_unit: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function useCart(storeApiFetch: StoreApiFetch) {
  const [cart, setCart] = useState<WCCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch current cart state ──
  const fetchCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storeApiFetch("/cart");
      if (!res.ok) throw new Error(`Cart fetch failed: ${res.status}`);
      const data: WCCart = await res.json();
      setCart(data);
    } catch (e) {
      setError("Could not load cart.");
      console.error("[MiraQ] fetchCart:", e);
    } finally {
      setLoading(false);
    }
  }, [storeApiFetch]);
  // Add this useEffect inside useChat, after storeApiFetch is defined
  useEffect(() => {
    async function bootstrapCart() {
      try {
        const res = await storeApiFetch("/cart");
        console.log("store api res", res);
        // storeApiFetch already captures Nonce + Cart-Token from response headers
        // into nonceRef and cartTokenRef automatically — nothing else needed here
      } catch (e) {
        console.warn("[MiraQ] Cart bootstrap failed", e);
      }
    }
    bootstrapCart();
  }, []); // runs once on mount

  // ── Add item (called by useChat when backend fires trigger_frontend_cart_add) ──
  const addItem = useCallback(
    async (
      productId: number,
      quantity = 1,
      variationId?: number,
      variationAttributes?: { attribute: string; value: string }[],
    ): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await storeApiFetch("/cart/add-item", {
          method: "POST",
          body: JSON.stringify({
            id: variationId ?? productId, // ← use variation ID if provided, else parent
            quantity,
            ...(variationAttributes?.length
              ? { variation: variationAttributes }
              : {}),
          }),
        });
        if (!res.ok) throw new Error(`Add item failed: ${res.status}`);
        const data: WCCart = await res.json();
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

  // ── Remove item by cart item key ──
  const removeItem = useCallback(
    async (key: string): Promise<void> => {
      setLoading(true);
      try {
        const res = await storeApiFetch("/cart/remove-item", {
          method: "POST",
          body: JSON.stringify({ key }),
        });
        if (!res.ok) throw new Error(`Remove item failed: ${res.status}`);
        const data: WCCart = await res.json();
        setCart(data);
      } catch (e) {
        console.error("[MiraQ] removeItem:", e);
      } finally {
        setLoading(false);
      }
    },
    [storeApiFetch],
  );

  // ── Update quantity (removeItem if qty < 1) ──
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
        const data: WCCart = await res.json();
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
  };
}
