import { useCallback } from "react";
import { toast } from "react-toastify";
import { assertNever } from "../types/actions";
import type { ChatAction } from "../types/actions";
import type { PlatformCartItem } from "../platform/types";

// ── Dependency injection — keeps the hook testable and decoupled ──────────────

export interface ActionHandlerDeps {
  addItem: (
    productId: number | string,
    quantity: number,
    variationId?: number | string,
    variation?: { attribute: string; value: string }[],
  ) => Promise<void>;
  updateQuantity: (key: string, quantity: number) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  fetchCart: () => Promise<void>;
  /** Current cart items — used to resolve product_id/variation_id → cart item key */
  cartItems: PlatformCartItem[] | undefined;
  setIsCartOpen: (open: boolean) => void;
  setIsCheckoutOpen: (open: boolean) => void;
}

// ── Resolve a cart item key from optional key / product_id / variation_id ────

function resolveCartKey(
  deps: ActionHandlerDeps,
  opts: { key?: string; product_id?: number; variation_id?: number },
): string | null {
  if (opts.key) return opts.key;
  if (!deps.cartItems?.length) return null;

  // The Store API stores the item with id = variation_id ?? product_id
  const targetId = opts.variation_id ?? opts.product_id;
  if (targetId == null) return null;

  const found = deps.cartItems.find((item) => item.id === targetId);
  if (!found) {
    console.warn("[ChatAction] Could not resolve cart key for", opts);
    return null;
  }
  return found.key;
}

// ── Handle a single action ────────────────────────────────────────────────────

async function handleSingleAction(
  action: ChatAction,
  deps: ActionHandlerDeps,
): Promise<void> {
  switch (action.type) {
    case "ADD_TO_CART": {
      const { product_id, quantity, variation_id, variation } = action.payload;
      await deps.addItem(product_id, quantity, variation_id, variation);
      toast.success("Added to cart 🛒");
      break;
    }

    case "SHOPIFY_ADD_TO_CART": {
      // variant_id is the full Shopify GID ("gid://shopify/ProductVariant/…").
      // useCart.ts → addItem passes it straight to cartLinesAdd as merchandiseId.
      const { variant_id, quantity } = action.payload;
      await deps.addItem(variant_id, quantity);
      toast.success("Added to cart 🛒");
      break;
    }

    case "UPDATE_CART_ITEM": {
      const { quantity, ...rest } = action.payload;
      const key = resolveCartKey(deps, rest);
      if (!key) {
        console.warn(
          "[ChatAction] UPDATE_CART_ITEM: could not resolve key",
          action.payload,
        );
        break;
      }
      await deps.updateQuantity(key, quantity);
      break;
    }

    case "REMOVE_CART_ITEM": {
      const key = resolveCartKey(deps, action.payload);
      if (!key) {
        console.warn(
          "[ChatAction] REMOVE_CART_ITEM: could not resolve key",
          action.payload,
        );
        break;
      }
      await deps.removeItem(key);
      break;
    }

    case "OPEN_CART_PANEL": {
      deps.setIsCartOpen(true);
      await deps.fetchCart();
      break;
    }

    case "OPEN_CHECKOUT_PANEL": {
      deps.setIsCheckoutOpen(true);
      break;
    }

    case "PROPOSE_CHECKOUT_ADDRESS": {
      console.info(
        "[ChatAction] PROPOSE_CHECKOUT_ADDRESS received — handler arrives in PR 3",
        action.payload,
      );
      break;
    }

    // ── UI-only actions — rendered inside MessageRow, not dispatched ──────
    case "SHOW_BULK_ORDER_BUTTON":
    case "SHOW_RECENTLY_ORDERED_BUTTON":
    case "SHOW_BULK_ORDER_CONFIRMATION":
    case "SHOW_BULK_VARIANT_PROMPT":
    case "SHOW_BULK_ADDRESS_CONFIRMATION":
    case "SHOW_PRODUCT_RECENT_ORDERS":
      // Rendered directly in MessageRow; nothing for the action dispatcher to do.
      break;

    default:
      assertNever(action);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatActions({
  addItem,
  updateQuantity,
  removeItem,
  fetchCart,
  cartItems,
  setIsCartOpen,
  setIsCheckoutOpen,
}: ActionHandlerDeps) {
  const dispatchActions = useCallback(
    async (actions: ChatAction[] | undefined) => {
      if (!actions || actions.length === 0) return;

      const deps: ActionHandlerDeps = {
        addItem,
        updateQuantity,
        removeItem,
        fetchCart,
        cartItems,
        setIsCartOpen,
        setIsCheckoutOpen,
      };

      for (const action of actions) {
        try {
          await handleSingleAction(action, deps);
        } catch (err) {
          console.error("[ChatAction] failed", action.type, err);
          if (
            action.type === "ADD_TO_CART" ||
            action.type === "SHOPIFY_ADD_TO_CART"
          ) {
            toast.error("Could not add item to cart. Please try again.");
          }
        }
      }
    },
    [
      addItem,
      updateQuantity,
      removeItem,
      fetchCart,
      cartItems,
      setIsCartOpen,
      setIsCheckoutOpen,
    ],
  );

  return { dispatchActions };
}
