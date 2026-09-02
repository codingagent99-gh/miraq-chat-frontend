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
  /**
   * Which WooCommerce order this line will merge into — several products
   * for the same recipient share one index, matching order_count above.
   * Only set on resolved, non-skipped lines (backend: _order_group_key in
   * handlers/bulk/orders.py); null/absent means this line renders on its
   * own (unresolved or skipped, so it isn't part of any order's address
   * group). shipping_address/billing_address on a grouped line are the
   * EFFECTIVE address (overrides + rep default merged in) — the same
   * address that will actually be used, not necessarily the raw parsed one.
   */
  group_index?: number | null;
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
        /** See useChatActions.ts — set on multi-line bulk adds so this
         *  action doesn't also post a duplicate per-item confirmation. */
        suppress_result?: boolean;
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
        /** See ADD_TO_CART above — same meaning. */
        suppress_result?: boolean;
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
        skipped_count?: number;
        /**
         * Lines merge into ONE order per recipient, so these differ: four
         * products for one person is line_count 4, order_count 1. Optional so
         * a frontend deploy ahead of the backend still renders — the card
         * falls back to resolved_count, which is the old (line) count.
         */
        order_count?: number;
        line_count?: number;
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
        /** Axis values already resolved from the user's message; seeds the picker. */
        preselected?: Record<string, string>;
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
        /**
         * Present only when the backend rejected this line's address.
         * Maps field key → display label, per group. "meta" holds the CS
         * custom fields (order type, project name, rep), which live on the
         * billing block. The card renders these regardless of its own
         * required flags — the backend's required set is authoritative and
         * the two are deliberately not synced.
         */
        validation_errors?: {
          billing: Record<string, string>;
          shipping: Record<string, string>;
          meta: Record<string, string>;
        };
      };
    }
  // ── Product order history — shown alongside product search results (rep only) ──
  | {
      type: "SHOW_PRODUCT_RECENT_ORDERS";
      payload: {
        orders: ProductOrderHistoryItem[];
      };
    }
  | {
      type: "SHOW_DATE_RANGE_PICKER";
      payload: {
        /** Echoed back on submit so a stale/replayed card can be refused. */
        token: string;
        rep_name?: string | null;
        quick_options?: string[];
      };
    };

export function assertNever(x: never): never {
  throw new Error(
    `[ChatAction] Unhandled action type: ${(x as { type: string }).type}`,
  );
}
