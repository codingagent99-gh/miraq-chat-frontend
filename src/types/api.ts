import type { ChatAction } from "./actions";

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationData {
  page: number;
  per_page: number;
  total_items: number | null;
  total_pages: number | null;
  has_more: boolean;
}

// ============================================================================
// Order Types
// ============================================================================

export interface OrderItem {
  id?: number;
  name: string;
  product_id?: number;
  variation_id?: number;
  quantity: number;
  price: number;
  total?: number;
  sku?: string;
  image?: string;
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  currency?: string;
  total: number;
  subtotal?: number;
  shipping_total?: number;
  tax_total?: number;
  discount_total?: number;
  date_created: string;
  date_paid?: string | null;
  date_completed?: string | null;
  customer_id?: number;
  customer_email?: string;
  customer_name?: string;
  payment_method?: string;
  items: OrderItem[];
  item_count: number;
  billing?: Record<string, any>;
  shipping?: Record<string, any>;
  payment_url?: string;
}

export interface PurchaseInfo {
  purchased: boolean;
  last_purchase_date: string | null;
  total_purchases: number;
  last_price: number | null;
}

// ============================================================================
// Product Types
// ============================================================================

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price: number;
  regular_price: number;
  sale_price: number | null;
  on_sale: boolean;
  stock_status: string;
  in_stock: boolean;
  images: string[];
  categories: string[];
  permalink: string;
  average_rating: string;
  rating_count: number;
  sku: string;
  weight: string;
  dimensions: { height: string; length: string; width: string };
  total_sales: number;
}

// ============================================================================
// Cart Types
// ============================================================================

export interface CartItem {
  product_id: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface CartData {
  items: CartItem[];
  totals: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
  };
  item_count: number;
}

// ============================================================================
// Filter Suggestion Types
// ============================================================================

export interface FilterSuggestion {
  label: string;
  type: "tag" | "category" | "attribute" | "broaden";
  tag_slugs: string[];
  category_slug: string;
  extra_category_slugs: string[];
  attributes: Record<string, string>;
}

// ============================================================================
// Flow State — Guided Conversation
// ============================================================================

/** Must match the FlowState enum values in backend conversation_flow.py */
export type FlowState =
  | "idle"
  | "awaiting_intent_choice"
  | "awaiting_product_or_category"
  | "showing_results"
  | "awaiting_quantity"
  | "awaiting_order_confirm"
  | "awaiting_final_confirm"
  | "awaiting_shipping_confirm"
  | "awaiting_new_address"
  | "awaiting_address_confirm"
  | "order_complete"
  | "awaiting_anything_else"
  | "closing"
  | "awaiting_variant_selection"
  | "awaiting_filter_clarification";

/** Context carried across turns for multi-step flows */
export interface FlowContext {
  flow_state: FlowState;
  pending_product_id?: number;
  pending_product_name?: string;
  pending_quantity?: number;
  pending_variation_id?: number;
  pending_shipping_address?: string;
  use_existing_address?: boolean;
  use_new_address?: boolean;
  /** Variant attributes resolved so far across turns (e.g. {Colors: "ALLSPICE Beleza"}) */
  resolved_attributes?: Record<string, string>;
  /** Order ID for detail view — set when user clicks an order or asks for a specific order */
  pending_order_id?: number;
  pending_semantic_match?: Record<string, any>;
}

// ============================================================================
// Chat Message — unified UI type
// ============================================================================

export type MessageRole = "user" | "bot";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  products?: Product[];
  orders?: Order[];
  purchase_info?: PurchaseInfo;
  intent?: string;
  suggestions?: string[];
  /** Filter suggestions for zero-result searches */
  filterSuggestions?: FilterSuggestion[];
  categories?: Category[];
  cart?: CartData;
  paymentUrl?: string;
  timestamp: Date;
  /** If true, suggestions render as prominent flow-action buttons */
  isFlowPrompt?: boolean;
  /** Pagination data for product results */
  pagination?: PaginationData;
  /** Pagination data for order results */
  orderPagination?: PaginationData;
  /** Actions dispatched by this message (only set for live responses, never history) */
  actions?: ChatAction[];
}

// ============================================================================
// Chat API
// ============================================================================

export interface ChatRequest {
  message: string;
  session_id?: string;
  /** Page number for paginated product results (default: 1) */
  page?: number;
  /** Full filter suggestion object to retry a zero-result search */
  suggestion_retry?: FilterSuggestion;
  user_context?: {
    email?: string;
    customer_id?: number;
    preferences?: Record<string, unknown>;
    flow_state?: FlowState;
    pending_product_id?: number;
    pending_product_name?: string;
    pending_quantity?: number;
    pending_variation_id?: number;
    pending_shipping_address?: string;
    use_existing_address?: boolean;
    use_new_address?: boolean;
    resolved_attributes?: Record<string, string>;
    pending_order_id?: number;
    pending_semantic_match?: Record<string, any>;
    last_product?: { id: number; name: string };
  };
}

/** Shape of the metadata object returned inside ChatResponse */
export interface ChatResponseMetadata {
  products_count?: number;
  provider?: string;
  tokens_used?: number;
  confidence?: number;
  timestamp?: string;
  flow_state?: FlowState;
  pending_product_name?: string;
  categories?: Category[];
  pending_product_id?: number;
  pending_quantity?: number;
  pending_variation_id?: number;
  pending_shipping_address?: string;
  use_existing_address?: boolean;
  use_new_address?: boolean;
  /** Variant attributes resolved so far across turns */
  resolved_attributes?: Record<string, string>;
  /** Order ID when entering order detail flow */
  pending_order_id?: number;
  pending_semantic_match?: Record<string, any>;
  product_id?: number;
  variation_id?: number;
  quantity?: number;
  response_time_ms?: number;
  variation_attributes?: { attribute: string; value: string }[];
}

export interface ChatResponse {
  bot_message: string;
  products?: Product[];
  orders?: Order[];
  total_orders?: number;
  categories?: Category[];
  purchase_info?: PurchaseInfo;
  product?: Product;
  filters_applied?: Record<string, unknown>;
  suggestions?: string[];
  /** Filter suggestions for zero-result searches — empty array when results exist */
  filter_suggestions?: FilterSuggestion[];
  intent?: string;
  success: boolean;
  session_id: string;
  flow_state?: FlowState;
  metadata?: ChatResponseMetadata;
  order?: Order;
  cart?: CartData;
  payment_url?: string;
  error?: string;
  /** Pagination metadata for product results */
  pagination?: PaginationData;
  /** Pagination metadata for order results */
  order_pagination?: PaginationData;
  action?: string;
  /** New actions envelope — primary signal channel (supersedes legacy `action` field) */
  actions?: ChatAction[];
}

// ============================================================================
// History API
// ============================================================================

export interface HistoryEntry {
  role: "user" | "bot";
  message: string;
  intent?: string;
  timestamp: string;
}

export interface HistoryResponse {
  messages: HistoryEntry[];
  has_more: boolean;
  next_page: number | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

// ============================================================================
// Product Types
// ============================================================================

/** Product attribute (e.g. Finish → ["Matte", "Polished"]) */
export interface ProductAttribute {
  name: string;
  options: string[];
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price: number;
  regular_price: number;
  sale_price: number | null;
  on_sale: boolean;
  stock_status: string;
  in_stock: boolean;
  images: string[];
  categories: string[];
  permalink: string;
  average_rating: string;
  rating_count: number;
  sku: string;
  weight: string;
  dimensions: { height: string; length: string; width: string };
  total_sales: number;
  /** Product attributes — available when fetched via /products/:id detail */
  attributes?: ProductAttribute[];
  /** Tag names */
  tags?: string[];
  /** Variation IDs (for variable products) */
  variations?: number[];
  /** Product type: "simple" | "variable" | "variation" etc. */
  type?: string;
  /** Stock quantity (may be null if not tracked) */
  stock_quantity?: number | null;
}

export interface WidgetOptions {
  appId?: string;
  apiKey?: string;
  apiUrl?: string;
  customerId?: string | number;
  customerEmail?: string;
  customerName?: string;
  customerRole?: string;
  assetBaseUrl?: string;
  nonce?: string;
  nonceExpires?: number; // JS timestamp in ms
  cartToken?: string;
}
