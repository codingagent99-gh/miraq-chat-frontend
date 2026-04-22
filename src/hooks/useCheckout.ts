import { useState, useCallback } from "react";
import type { AddressDict } from "../types/actions";
import type {
  CheckoutStep,
  ShippingPackage,
  PaymentPayload,
  OrderConfirmation,
  UseCheckoutReturn,
  UseCheckoutOptions,
} from "../types/checkout";
import type { WCCart } from "./useCart";
import { clearAddressDraft } from "../utils/addressDraft";

// ── Helper: extract the first field-level error from a Woo Store API error ──

function parseWooError(body: unknown): {
  code: string;
  message: string;
  field?: string;
} {
  if (!body || typeof body !== "object") {
    return { code: "unknown_error", message: "An unexpected error occurred." };
  }

  const err = body as {
    code?: string;
    message?: string;
    data?: { details?: Record<string, { code: string; message: string }> };
  };

  const code = err.code ?? "unknown_error";
  const message = err.message ?? "An unexpected error occurred.";

  // Surface first field-level error if present
  const details = err.data?.details;
  if (details) {
    const firstField = Object.keys(details)[0];
    if (firstField) {
      return {
        code: details[firstField].code ?? code,
        message: details[firstField].message ?? message,
        field: firstField,
      };
    }
  }

  return { code, message };
}

// ── Helper: extract shippingPackages from the updated cart ──────────────────

function extractShippingPackages(cart: WCCart): ShippingPackage[] {
  return cart.shipping_rates ?? [];
}

// ── Helper: find the currently selected rate id across all packages ─────────

function findSelectedRateId(packages: ShippingPackage[]): string | null {
  for (const pkg of packages) {
    const selected = pkg.shipping_rates.find((r) => r.selected);
    if (selected) return selected.rate_id;
  }
  return null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCheckout({
  storeApiFetch,
  cart,
  onCartUpdate,
  cartToken,
}: UseCheckoutOptions): UseCheckoutReturn {
  const [step, setStep] = useState<CheckoutStep>("idle");
  const [customer, setCustomer] = useState<{
    billing: AddressDict;
    shipping: AddressDict;
  } | null>(null);
  const [shippingPackages, setShippingPackages] = useState<ShippingPackage[]>(
    () => extractShippingPackages(cart ?? ({} as WCCart)),
  );
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderConfirmation | null>(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
    field?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── updateCustomer ─────────────────────────────────────────────────────────
  const updateCustomer = useCallback(
    async (data: {
      billing_address?: AddressDict;
      shipping_address?: AddressDict;
    }): Promise<WCCart> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await storeApiFetch("/cart/update-customer", {
          method: "POST",
          body: JSON.stringify(data),
        });

        const body: unknown = await res.json();

        if (!res.ok) {
          const parsed = parseWooError(body);
          setError(parsed);
          setStep("error");
          throw new Error(parsed.message);
        }

        const updatedCart = body as WCCart;
        onCartUpdate(updatedCart);

        // Hydrate customer + shipping packages from the response
        if (updatedCart.billing_address || updatedCart.shipping_address) {
          setCustomer({
            billing: updatedCart.billing_address ?? {},
            shipping: updatedCart.shipping_address ?? {},
          });
        }

        const packages = extractShippingPackages(updatedCart);
        setShippingPackages(packages);
        setSelectedRateId(findSelectedRateId(packages));

        return updatedCart;
      } finally {
        setIsLoading(false);
      }
    },
    [storeApiFetch, onCartUpdate],
  );

  // ── selectShippingRate ─────────────────────────────────────────────────────
  const selectShippingRate = useCallback(
    async (packageId: string | number, rateId: string): Promise<WCCart> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await storeApiFetch("/cart/select-shipping-rate", {
          method: "POST",
          body: JSON.stringify({ package_id: packageId, rate_id: rateId }),
        });

        const body: unknown = await res.json();

        if (!res.ok) {
          const parsed = parseWooError(body);
          setError(parsed);
          throw new Error(parsed.message);
        }

        const updatedCart = body as WCCart;
        onCartUpdate(updatedCart);

        const packages = extractShippingPackages(updatedCart);
        setShippingPackages(packages);

        // Find the newly selected rate id from the response
        const newSelectedId = findSelectedRateId(packages) ?? rateId;
        setSelectedRateId(newSelectedId);

        return updatedCart;
      } finally {
        setIsLoading(false);
      }
    },
    [storeApiFetch, onCartUpdate],
  );

  // ── placeOrder ─────────────────────────────────────────────────────────────
  const placeOrder = useCallback(
    async (payment: PaymentPayload): Promise<OrderConfirmation> => {
      setIsLoading(true);
      setError(null);
      setStep("placing_order");
      try {
        const billing = customer?.billing ?? cart?.billing_address ?? {};
        const shipping = customer?.shipping ?? cart?.shipping_address ?? {};

        const res = await storeApiFetch("/checkout", {
          method: "POST",
          body: JSON.stringify({
            billing_address: billing,
            shipping_address: shipping,
            customer_note: "",
            payment_method: payment.payment_method,
            payment_data: payment.payment_data,
          }),
        });

        const body: unknown = await res.json();

        if (!res.ok) {
          const parsed = parseWooError(body);
          setError(parsed);
          setStep("error");
          throw new Error(parsed.message);
        }

        const confirmation = body as OrderConfirmation;
        setOrder(confirmation);
        setStep("complete");

        // Clear address draft — order is done
        clearAddressDraft(cartToken ?? null);

        // Update cart in parent (Woo returns the new empty cart on checkout)
        if ((body as { cart?: WCCart }).cart) {
          onCartUpdate((body as { cart: WCCart }).cart);
        }

        return confirmation;
      } finally {
        setIsLoading(false);
      }
    },
    [storeApiFetch, customer, cart, cartToken, onCartUpdate],
  );

  // ── clearError ──────────────────────────────────────────────────────────────
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ── reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStep("idle");
    setCustomer(null);
    setShippingPackages([]);
    setSelectedRateId(null);
    setOrder(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    step,
    customer,
    shippingPackages,
    selectedRateId,
    order,
    error,
    isLoading,
    updateCustomer,
    selectShippingRate,
    placeOrder,
    setStep,
    clearError,
    reset,
  };
}
