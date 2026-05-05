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

        // Hydrate customer + shipping packages from the response.
        // WooCommerce only echoes back standard address fields — it silently
        // drops custom fields (project_rep, billing_field_type, etc.).
        // Merge the original input ON TOP of the WC response so placeOrder
        // always sends custom fields along with the /checkout payload.
        if (updatedCart.billing_address || updatedCart.shipping_address) {
          setCustomer({
            billing: {
              ...(updatedCart.billing_address ?? {}),
              ...(data.billing_address ?? {}),
            },
            shipping: {
              ...(updatedCart.shipping_address ?? {}),
              ...(data.shipping_address ?? {}),
            },
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
  // Uses POST /wc/store/v1/checkout (Store API).
  //
  // Custom fields (billing_project, billing_field_type, project_rep) are
  // passed in the `extensions` object rather than as top-level fields.
  // The server-side hook `woocommerce_store_api_checkout_update_order_from_request`
  // in class-api.php reads from extensions["miraq-checkout"] and saves them
  // as order meta — the correct Store API extension pattern.
  //
  // Free orders: WooCommerce still requires a non-empty payment_method even
  // when needs_payment === false. We fall back to the first available method
  // (e.g. "cod") — it won't be charged for a $0 order.
  const placeOrder = useCallback(
    async (payment: PaymentPayload): Promise<OrderConfirmation> => {
      setIsLoading(true);
      setError(null);
      setStep("placing_order");

      try {
        const billing = customer?.billing ?? cart?.billing_address ?? {};
        const shipping = customer?.shipping ?? cart?.shipping_address ?? {};

        // Always send a valid payment_method — required by the Store API even
        // when the order total is zero.
        const paymentMethod =
          payment.payment_method || cart?.payment_methods?.[0] || "cod";

        const body = {
          billing_address: {
            first_name: String(billing.first_name ?? ""),
            last_name: String(billing.last_name ?? ""),
            company: String(billing.company ?? ""),
            address_1: String(billing.address_1 ?? ""),
            address_2: String(billing.address_2 ?? ""),
            city: String(billing.city ?? ""),
            state: String(billing.state ?? ""),
            postcode: String(billing.postcode ?? ""),
            country: String(billing.country ?? ""),
            email: String(billing.email ?? ""),
            phone: String(billing.phone ?? ""),
          },
          shipping_address: {
            first_name: String(shipping.first_name ?? ""),
            last_name: String(shipping.last_name ?? ""),
            company: String(shipping.company ?? ""),
            address_1: String(shipping.address_1 ?? ""),
            address_2: String(shipping.address_2 ?? ""),
            city: String(shipping.city ?? ""),
            state: String(shipping.state ?? ""),
            postcode: String(shipping.postcode ?? ""),
            country: String(shipping.country ?? ""),
          },
          customer_note: String((billing as any).order_notes ?? ""),
          payment_method: paymentMethod,
          payment_data: payment.payment_data ?? [],
          // Custom fields — saved via woocommerce_store_api_checkout_update_order_from_request
          // in class-api.php. The namespace key must match what the PHP hook reads.
          extensions: {
            "miraq-checkout": {
              billing_project: String((billing as any).billing_project ?? ""),
              billing_field_type: String(
                (billing as any).billing_field_type ?? "",
              ),
              project_rep: String((billing as any).project_rep ?? ""),
            },
          },
        };

        const res = await storeApiFetch("/checkout", {
          method: "POST",
          body: JSON.stringify(body),
        });

        const resBody: unknown = await res.json();

        if (!res.ok) {
          const parsed = parseWooError(resBody);
          setError(parsed);
          setStep("error");
          throw new Error(parsed.message);
        }

        const result = resBody as {
          order_id?: number;
          order_key?: string;
          status?: string;
          total?: string;
          payment_result?: {
            payment_status?: string;
            redirect_url?: string;
          };
        };

        const confirmation: OrderConfirmation = {
          order_id: result.order_id ?? 0,
          order_key: result.order_key ?? "",
          status: result.status ?? "",
          total: result.total ?? "",
          payment_result: result.payment_result
            ? {
                payment_status: result.payment_result.payment_status ?? "",
                redirect_url: result.payment_result.redirect_url,
              }
            : undefined,
        };

        setOrder(confirmation);
        setStep("complete");

        // Clear address draft — order is done
        clearAddressDraft(cartToken ?? null);

        // Re-fetch cart so the frontend reflects the now-empty server cart
        try {
          const cartRes = await storeApiFetch("/cart");
          if (cartRes.ok) {
            const freshCart = (await cartRes.json()) as WCCart;
            onCartUpdate(freshCart);
          }
        } catch (cartErr) {
          console.warn(
            "[MiraQ] Could not refresh cart after checkout:",
            cartErr,
          );
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
