// ============================================================================
// Order Types (NEW)
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
}

export interface PurchaseInfo {
  purchased: boolean;
  last_purchase_date: string | null;
  total_purchases: number;
  last_price: number | null;
}

// ============================================================================
// Product Types (EXISTING)
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
// Chat API (UPDATED - added order fields)
// ============================================================================

export interface ChatRequest {
  message: string;
  session_id?: string;
  user_context?: {
    email?: string; // NEW - for order queries
    customer_id?: number; // NEW - for order queries
    preferences?: Record<string, unknown>;
  };
}

export interface ChatResponse {
  bot_message: string;
  products?: Product[]; // Made optional (was required array)
  orders?: Order[]; // NEW - for order_history intent
  total_orders?: number; // NEW - count of all orders
  purchase_info?: PurchaseInfo; // NEW - for purchase_check intent
  product?: Product; // NEW - single product for purchase_check
  filters_applied?: Record<string, unknown>; // Made optional
  suggestions?: string[]; // Made optional (was required array)
  intent?: string; // Made optional (was required)
  success: boolean;
  session_id: string;
  metadata?: {
    // Made optional
    products_count?: number;
    provider?: string;
    tokens_used?: number;
    confidence?: number;
    timestamp?: string;
  };
  error?: string;
}

// ============================================================================
// History API (EXISTING)
// ============================================================================

export interface HistoryEntry {
  timestamp: string;
  user: string;
  bot: string;
  metadata: {
    products_count?: number;
    filters?: Record<string, unknown>;
    intent?: string;
    confidence?: number;
  };
}

export interface HistoryResponse {
  session_id: string;
  history: HistoryEntry[];
  message_count: number;
  success: boolean;
}

// ============================================================================
// Internal UI (UPDATED - added order fields)
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
  timestamp: Date;
}
