import axios from "axios";
import type {
  ChatRequest,
  ChatResponse,
  HistoryResponse,
  Product,
  Order,
} from "../types/api";

const client = axios.create({
  baseURL: import.meta.env.VITE_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

/* ── /chat ── */
export async function sendChat(body: ChatRequest): Promise<ChatResponse> {
  const { data } = await client.post<ChatResponse>("/chat", body);
  return data;
}

/* ── /chat/history/:id ── */
export async function fetchHistory(
  sessionId: string,
): Promise<HistoryResponse> {
  const { data } = await client.get<HistoryResponse>(
    `/chat/history/${sessionId}`,
  );
  return data;
}

/* ── /chat/clear/:id ── */
export async function clearHistory(sessionId: string): Promise<void> {
  await client.delete(`/chat/clear/${sessionId}`);
}

/* ── /products/categories ── */
export interface Category {
  id: number;
  name: string;
  slug: string;
  count: number;
}
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await client.get<{ categories: Category[] }>(
    "/products/categories",
  );
  return data.categories;
}

/* ── /products/:id ── */
export async function fetchProduct(id: number): Promise<Product> {
  const { data } = await client.get<{ product: Product }>(`/products/${id}`);
  return data.product;
}

/* ── /order/place ── NEW: Place an order */
export interface PlaceOrderRequest {
  product_id: number;
  quantity?: number;
  session_id?: string;
  user_context?: {
    email?: string;
    customer_id?: number;
  };
}

export interface PlaceOrderResponse {
  success: boolean;
  order?: Order;
  bot_message: string;
  error?: string;
  session_id?: string;
}

export async function placeOrder(
  body: PlaceOrderRequest,
): Promise<PlaceOrderResponse> {
  const { data } = await client.post<PlaceOrderResponse>("/order/place", body);
  return data;
}

/* ── /health ── */
export async function healthCheck(): Promise<{
  status: string;
  woocommerce_connected: boolean;
}> {
  const { data } = await client.get("/health");
  return data;
}
