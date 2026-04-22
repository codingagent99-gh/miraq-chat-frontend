import type { AddressDict } from "./actions";
import type { WCCart } from "../hooks/useCart";
import type { StoreApiFetch } from "../hooks/useStoreApi";

// ============================================================================
// Checkout Step — discriminated union of every possible panel state
// ============================================================================

export type CheckoutStep =
  | "idle"
  | "collecting_address"
  | "selecting_rate"
  | "awaiting_payment" // reserved — not entered in this PR
  | "placing_order"
  | "complete"
  | "error";

// ============================================================================
// Shipping
// ============================================================================

export interface ShippingRate {
  rate_id: string;
  name: string;
  price: string; // Woo returns minor units as string
  delivery_time?: string;
  selected: boolean;
}

export interface ShippingPackage {
  package_id: string | number;
  name: string;
  shipping_rates: ShippingRate[];
}

// ============================================================================
// Payment
// ============================================================================

export interface PaymentPayload {
  payment_method: string; // e.g., 'cod'
  payment_data: Array<{ key: string; value: string }>; // empty for COD
}

// ============================================================================
// Order Confirmation
// ============================================================================

export interface OrderConfirmation {
  order_id: number;
  order_key: string;
  status: string;
  total: string;
  payment_result?: {
    payment_status: string;
    redirect_url?: string;
  };
}

// ============================================================================
// useCheckout — return type
// ============================================================================

export interface UseCheckoutReturn {
  step: CheckoutStep;
  customer: { billing: AddressDict; shipping: AddressDict } | null;
  shippingPackages: ShippingPackage[];
  selectedRateId: string | null;
  order: OrderConfirmation | null;
  error: { code: string; message: string; field?: string } | null;
  isLoading: boolean;

  updateCustomer: (data: {
    billing_address?: AddressDict;
    shipping_address?: AddressDict;
  }) => Promise<WCCart>;
  selectShippingRate: (
    packageId: string | number,
    rateId: string,
  ) => Promise<WCCart>;
  placeOrder: (payment: PaymentPayload) => Promise<OrderConfirmation>;

  setStep: (step: CheckoutStep) => void;
  reset: () => void;
}

// ============================================================================
// useCheckout — options
// ============================================================================

export interface UseCheckoutOptions {
  storeApiFetch: StoreApiFetch;
  cart: WCCart | null;
  onCartUpdate: (cart: WCCart) => void;
}
