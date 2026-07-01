import { useState, useCallback, useEffect } from "react";
import type { AddressDict } from "../../types/actions";
import type {
  CheckoutStep,
  ShippingPackage,
  PaymentPayload,
  OrderConfirmation,
  UseCheckoutReturn,
  UseCheckoutOptions,
} from "../../types/checkout";
import type { WCCart } from "../../hooks/useCart";
import type { MultiShipGroup } from "../../types/multiAddress";
import { clearAddressDraft } from "../../utils/addressDraft";

// ── Extend the base options type locally so types/checkout.ts needs no changes ─

interface UseCheckoutOptionsExtended extends UseCheckoutOptions {
  /**
   * A ref populated by CheckoutPanel with the current multi-address groups.
   * placeOrder reads it at call-time — no signature change required.
   */
  multiShipGroupsRef?: React.MutableRefObject<MultiShipGroup[] | undefined>;
  /** Called after a successful order so ChatWidget can show the similar products prompt. */
  onOrderComplete?: (productId: number, productName: string) => void;
  resetCartToken?: () => void;
}

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

// ── Helper: serialise multi-ship groups for the extensions payload ───────────

function serializeMultiShip(groups: MultiShipGroup[]): string {
  if (!groups.length) return "";
  return JSON.stringify(
    groups.map((g) => ({
      address: g.address,
      rate_id: g.selected_rate_id ?? "",
      items: g.items.map((i) => ({
        cart_key: i.cart_key,
        name: i.product_name,
        qty: i.quantity,
      })),
    })),
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCheckout({
  storeApiFetch,
  cart,
  onCartUpdate,
  cartToken,
  multiShipGroupsRef,
  onOrderComplete,
  resetCartToken,
}: UseCheckoutOptionsExtended): UseCheckoutReturn {
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
  // Multi-ship groups are read from the ref injected by CheckoutPanel.
  // The ref is written during CheckoutPanel's render (safe for refs) so it is
  // always current by the time the user clicks "Place Order".
  const placeOrder = useCallback(
    async (payment: PaymentPayload): Promise<OrderConfirmation> => {
      setIsLoading(true);
      setError(null);
      setStep("placing_order");

      // Snapshot cart items now — before any async clears/refreshes the cart
      const _cartItemsSnapshot = cart?.items ? [...cart.items] : [];

      try {
        const billing = customer?.billing ?? cart?.billing_address ?? {};
        const shipping = customer?.shipping ?? cart?.shipping_address ?? {};

        // When no payment is needed, send an empty string so WooCommerce skips
        // payment-method validation entirely. Sending any real slug (e.g. "cod")
        // causes a 400 if that gateway isn't valid for a zero-total order.
        const paymentMethod =
          cart?.needs_payment === false
            ? ""
            : payment.payment_method || cart?.payment_methods?.[0] || "cod";

        // Read multi-ship groups from the ref at call-time
        const multiShipGroups = multiShipGroupsRef?.current;
        const multiShippingStr =
          multiShipGroups && multiShipGroups.length > 0
            ? serializeMultiShip(multiShipGroups)
            : "";

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
          payment_data:
            cart?.needs_payment === false ? [] : (payment.payment_data ?? []),
          extensions: {
            "miraq-checkout": {
              billing_project: String((billing as any).billing_project ?? ""),
              billing_field_type: String(
                (billing as any).billing_field_type ?? "",
              ),
              project_rep: String((billing as any).project_rep ?? ""),
              // ── Multi-address shipping data ──────────────────────────────
              // Serialised JSON; PHP hook (class-api.php) parses and saves
              // per-shipment order meta from this string.
              multi_shipping: multiShippingStr,
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

        // ── Force-clear cart UI immediately ──────────────────────────────────────────
        // Must happen synchronously here, before any awaits below.
        // The cart token still points to the old WooCommerce session at this moment —
        // any /cart fetch using it may return stale items and re-populate the cart.
        onCartUpdate({
          ...(cart ?? ({} as WCCart)),
          items: [],
          items_count: 0,
          totals: {
            ...(cart?.totals ?? {
              currency_code: "",
              currency_symbol: "",
              currency_minor_unit: 2,
            }),
            total_items: "0",
            total_items_tax: "0",
            total_shipping: "0",
            total_tax: "0",
            total_price: "0",
          } as WCCart["totals"],
        });

        // Fire similar products nudge using snapshotted first cart item
        if (onOrderComplete && _cartItemsSnapshot.length) {
          const firstItem = _cartItemsSnapshot[0];
          onOrderComplete(Number(firstItem.id), firstItem.name);
        }

        clearAddressDraft(cartToken ?? null);

        console.log(
          "[MiraQ DEBUG] placeOrder complete — resetCartToken wired?",
          typeof resetCartToken === "function" ? "yes" : "NO — prop missing!",
        );
        resetCartToken?.();

        // Silent /cart ping — only purpose is to receive the new Cart-Token header
        // that WooCommerce issues for the fresh session. We do NOT call onCartUpdate
        // here; the cart is already cleared above.
        try {
          const pingRes = await storeApiFetch("/cart");
          const pingBody = await pingRes.json().catch(() => null);
          console.log("[MiraQ DEBUG] post-order /cart ping:", {
            status: pingRes.status,
            items_count: pingBody?.items_count,
            items: pingBody?.items?.map((i: any) => i.name),
          });
        } catch (cartErr) {
          console.warn("[MiraQ] Could not ping cart after checkout:", cartErr);
        }

        return confirmation;
      } finally {
        setIsLoading(false);
      }
    },
    // multiShipGroupsRef intentionally omitted — refs are stable and need no deps
    [storeApiFetch, customer, cart, cartToken, onCartUpdate], // eslint-disable-line react-hooks/exhaustive-deps
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

  // useCheckout.ts — after the shippingPackages useState
  useEffect(() => {
    if (!cart) return;
    const packages = extractShippingPackages(cart);
    if (packages.length > 0) {
      setShippingPackages(packages);
      setSelectedRateId(findSelectedRateId(packages));
    }
  }, [cart]);

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
