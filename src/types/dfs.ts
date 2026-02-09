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
  sku?: string;
  weight?: string;
  dimensions?: Record<string, any>;
  total_sales?: number;
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  products?: Product[];
  orders?: Order[];
  purchase_info?: PurchaseInfo;
  intent?: string;
  suggestions?: string[];
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  user_context?: {
    email?: string;
    customer_id?: number;
    preferences?: Record<string, any>;
  };
}

export interface ChatResponse {
  bot_message: string;
  products?: Product[];
  orders?: Order[];
  total_orders?: number;
  purchase_info?: PurchaseInfo;
  product?: Product;
  intent?: string;
  suggestions?: string[];
  success: boolean;
  session_id: string;
  metadata?: {
    products_count?: number;
    provider?: string;
    tokens_used?: number;
    confidence?: number;
    timestamp?: string;
  };
  error?: string;
}

export interface HistoryResponse {
  session_id: string;
  history: Array<{
    timestamp: string;
    user: string;
    bot: string;
    metadata?: Record<string, any>;
  }>;
  message_count: number;
  success: boolean;
}

// ============================================================================
// Category Types
// ============================================================================

export interface Category {
  id: number;
  name: string;
  slug: string;
  count: number;
}
