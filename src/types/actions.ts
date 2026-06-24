// ============================================================================
// Chat Action — discriminated union consumed from backend `actions[]` envelope
// ============================================================================

export interface AddressDict {
  [key: string]: string | undefined;
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

/** Shape of a single line returned inside SHOW_BULK_ORDER_CONFIRMATION */
export interface BulkOrderLine {
  raw_fragment?: string;
  company_name?: string;
  product_name?: string;
  quantity: number;
  product_id?: number | null;
  variation_id?: number | null;
  customer_id?: number | null;
  customer_display_name?: string;
  shipping_address?: Record<string, string> | null;
  billing_address?: Record<string, string> | null;
  is_reorder?: boolean;
  reorder_source_order_id?: number | null;
  unresolved: boolean;
  unresolved_reason?: string | null;
  address_confirmed?: boolean;
  address_skipped?: boolean;
}

/** A single line item inside a ProductOrderHistoryItem */
export interface ProductOrderLineItem {
  product_name: string;
  product_id: number | null;
  variation_id: number;
  quantity: number;
}

/** One historical order shown in the SHOW_PRODUCT_RECENT_ORDERS card */
export interface ProductOrderHistoryItem {
  order_id: string;
  order_number: string;
  date_created: string; // "YYYY-MM-DD"
  customer_id: string;
  customer_display_name: string;
  customer_email: string;
  items: ProductOrderLineItem[];
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
      type: "SHOPIFY_ADD_TO_CART";
      payload: {
        variant_id: string;
        variant_numeric_id: string;
        quantity: number;
        name?: string;
      };
    }
  | { type: "OPEN_CART_PANEL"; payload: Record<string, never> }
  | { type: "OPEN_CHECKOUT_PANEL"; payload: Record<string, never> }
  | {
      type: "PROPOSE_CHECKOUT_ADDRESS";
      payload: { parsed: AddressDict; existing_on_file?: AddressDict };
    }
  // ── Persistent UI triggers ──────────────────────────────────────────────
  | { type: "SHOW_BULK_ORDER_BUTTON"; payload: Record<string, never> }
  | { type: "SHOW_RECENTLY_ORDERED_BUTTON"; payload: Record<string, never> }
  // ── Bulk order render actions (stored on ChatMessage, rendered in MessageRow) ──
  | {
      type: "SHOW_BULK_ORDER_CONFIRMATION";
      payload: {
        lines: BulkOrderLine[];
        resolved_count: number;
        unresolved_count: number;
      };
    }
  | {
      type: "SHOW_BULK_VARIANT_PROMPT";
      payload: {
        line_index: number;
        company: string;
        is_self_order: boolean;
        product_name: string;
        /** 0 means the user did not specify a quantity — show the qty picker */
        quantity: number;
        progress: { current: number; total: number };
        attributes: { name: string; options: string[] }[];
        variations: { id: number; attributes: Record<string, string> }[];
      };
    }
  | {
      type: "SHOW_BULK_ADDRESS_CONFIRMATION";
      payload: {
        customer_name: string;
        items_text: string;
        address: {
          address_1: string;
          address_2?: string;
          city: string;
          state: string;
          postcode: string;
        };
        addr_str: string;
        /** Full billing block for the editable panel prefill */
        billing?: AddressDict;
        /** Full shipping block for the editable panel prefill */
        shipping?: AddressDict;
        progress: { current: number; total: number };
      };
    }
  // ── Product order history — shown alongside product search results (rep only) ──
  | {
      type: "SHOW_PRODUCT_RECENT_ORDERS";
      payload: {
        orders: ProductOrderHistoryItem[];
      };
    };

export function assertNever(x: never): never {
  throw new Error(
    `[ChatAction] Unhandled action type: ${(x as { type: string }).type}`,
  );
}
