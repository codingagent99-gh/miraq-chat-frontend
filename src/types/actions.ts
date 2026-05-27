// ============================================================================
// Chat Action — discriminated union consumed from backend `actions[]` envelope
// ============================================================================

export interface AddressDict {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
  company?: string;
  project_rep?: string;
  order_notes?: string;
}

export type ChatAction =
  | {
      type: "ADD_TO_CART";
      payload: {
        product_id: number;
        name?: string;
        quantity: number;
        variation_id?: number;
        variation?: { attribute: string; value: string }[];
      };
    }
  | {
      type: "UPDATE_CART_ITEM";
      payload: {
        key?: string;
        product_id?: number;
        variation_id?: number;
        quantity: number;
      };
    }
  | {
      type: "REMOVE_CART_ITEM";
      payload: { key?: string; product_id?: number; variation_id?: number };
    }
  | {
      /**
       * Shopify-specific add-to-cart action.
       * The backend supplies a variant GID (variant_id) instead of a numeric
       * product/variation ID. useCart.ts → addItem accepts the GID directly
       * and routes it to the Storefront API cartLinesAdd mutation.
       */
      type: "SHOPIFY_ADD_TO_CART";
      payload: {
        variant_id: string; // "gid://shopify/ProductVariant/<id>"
        variant_numeric_id: string; // bare numeric ID, kept for reference
        quantity: number;
        name?: string;
      };
    }
  | { type: "OPEN_CART_PANEL"; payload: Record<string, never> }
  | { type: "OPEN_CHECKOUT_PANEL"; payload: Record<string, never> }
  | {
      type: "PROPOSE_CHECKOUT_ADDRESS";
      payload: { parsed: AddressDict; existing_on_file?: AddressDict };
    };

/**
 * Used in the default branch of action-handler switch statements to guarantee
 * exhaustive handling at compile time. TypeScript will error if a case is missing.
 */
export function assertNever(x: never): never {
  throw new Error(
    `[ChatAction] Unhandled action type: ${(x as { type: string }).type}`,
  );
}
