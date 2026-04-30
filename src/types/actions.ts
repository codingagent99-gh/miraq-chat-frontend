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
}

export type ChatAction =
  | {
      type: "ADD_TO_CART";
      payload: {
        product_id: number;
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
