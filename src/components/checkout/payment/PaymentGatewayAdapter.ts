import type React from "react";
import type { PaymentPayload } from "../../../types/checkout";
import type { WCCart } from "../../../hooks/useCart";

// ============================================================================
// PaymentGatewayAdapter — pluggable payment interface
//
// Each gateway registers itself via `registerPaymentAdapter`. The `id` must
// match the WooCommerce payment_method slug exactly (e.g. 'cod', 'stripe').
// ============================================================================

export interface PaymentGatewayAdapterProps {
  cart: WCCart;
  /** Called by the adapter when its payload is ready / changes. Pass `null` to mark not-ready. */
  onPayloadChange: (payload: PaymentPayload | null) => void;
  /** Called by the adapter if it wants to surface a non-blocking notice. */
  onNotice?: (msg: string) => void;
}

export interface PaymentGatewayAdapter {
  /** Must match the WooCommerce payment_method slug exactly (e.g., 'cod', 'stripe', 'ppcp-gateway'). */
  id: string;
  /** Display label for the radio option. */
  label: string;
  /** Optional short description shown beneath the label. */
  description?: string;
  /** The component rendered when this gateway is selected. */
  Component: React.FC<PaymentGatewayAdapterProps>;
  /**
   * Optional. Called right before placeOrder. Return false (or throw) to abort.
   * Useful for adapters that need to tokenize asynchronously at the last second.
   */
  validate?: (cart: WCCart) => Promise<boolean> | boolean;
}

/** Built-in registry. Adapters register themselves via the `index.ts` barrel. */
const registry = new Map<string, PaymentGatewayAdapter>();

export function registerPaymentAdapter(adapter: PaymentGatewayAdapter): void {
  registry.set(adapter.id, adapter);
}

export function getPaymentAdapter(id: string): PaymentGatewayAdapter | undefined {
  return registry.get(id);
}

export function getRegisteredAdapterIds(): string[] {
  return Array.from(registry.keys());
}
