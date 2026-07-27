/**
 * platform/shopify/useCheckout.ts
 *
 * Shopify in-widget checkout: REVIEW AND REDIRECT.
 *
 *   1. Collect + validate contact and delivery address (pre-filled from the
 *      customer props, or from saved Shopify addresses fetched through the
 *      backend /customer-addresses route for logged-in customers).
 *   2. Review the cart.
 *   3. Redirect to Shopify's hosted checkout, which owns delivery-rate
 *      selection, taxes and payment.
 *
 * Why not compute rates here?
 * The widget shares the THEME's session cart via the Ajax Cart API
 * (see platform/shopify/useCart.ts) precisely so the widget cart and the
 * theme cart can never diverge. Storefront cart mutations
 * (cartBuyerIdentityUpdate / cartDeliveryGroups) operate on a *different*,
 * isolated cart, so they cannot be used here — the previous implementation
 * called them against a cart id that no longer exists and silently produced
 * an empty delivery step. Shopify's checkout computes rates authoritatively,
 * so we hand off instead of half-reimplementing it.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ─── Public types ─────────────────────────────────────────────────────────────

export type CheckoutStep =
  | "collecting_shipping" // renamed from "collecting_address"
  | "selecting_shipping" // unchanged
  | "collecting_billing" // NEW
  | "review"
  | "redirecting"
  | "error";

export interface ContactAddress {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  /** State / province name or abbreviation — Shopify accepts both. */
  province: string;
  zip: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "IN", "US", "GB". */
  country: string;
}

export const EMPTY_ADDRESS: ContactAddress = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  zip: "",
  country: "IN",
};

export interface SavedAddress {
  /** Shopify customer address GID, e.g. "gid://shopify/MailingAddress/…" */
  id: string;
  isDefault: boolean;
  /** Single-line display label built from address fields */
  label: string;
  address: ContactAddress;
}

export type BillingOption = "same_as_shipping" | "different";

/** A single carrier / rate option within a delivery group. */
export interface DeliveryOption {
  handle: string;
  title: string;
  /** Decimal string, e.g. "370.00". Zero means free shipping. */
  amount: string;
  currencyCode: string;
  /** Delivery window, e.g. "3 to 5 business days". */
  description?: string;
}

/** A logical shipping group — most stores have exactly one. */
export interface DeliveryGroup {
  id: string;
  options: DeliveryOption[];
  /** handle of the currently selected option, or null if none chosen yet. */
  selectedHandle: string | null;
}

/** Optional seed values pre-filled from ChatWidget customer props. */
export interface CheckoutInitialValues {
  email?: string;
  firstName?: string;
  lastName?: string;
  /** NEW — triggers saved address fetch on mount */
  customerAccessToken?: string;
}

export interface CheckoutInitialValues {
  email?: string;
  firstName?: string;
  lastName?: string;
  customerId?: string | number;
  apiUrl?: string;
}

export interface UseCheckoutReturn {
  step: CheckoutStep;
  setStep: (step: CheckoutStep) => void;
  address: ContactAddress;
  setAddress: React.Dispatch<React.SetStateAction<ContactAddress>>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  // ── Delivery ──────────────────────────────────────────────────────────────
  deliveryGroups: DeliveryGroup[];
  /**
   * Convenience: the first selected DeliveryOption across all groups.
   * Used by the order-summary footer and ReviewStep.
   */
  selectedDeliveryOption: DeliveryOption | null;
  /**
   * Pre-fills buyer identity on the cart then fetches delivery groups.
   * Called automatically when the ShippingStep mounts.
   */
  fetchDeliveryOptions: () => Promise<void>;
  /** Optimistically selects a rate locally and locks it on the Shopify cart. */
  selectDeliveryOption: (groupId: string, handle: string) => Promise<void>;
  // ── Saved addresses ───────────────────────────────────────────────────────
  savedAddresses: SavedAddress[];
  savedAddressesLoading: boolean;
  // ── Billing ───────────────────────────────────────────────────────────────
  billingOption: BillingOption;
  setBillingOption: (opt: BillingOption) => void;
  billingAddress: ContactAddress;
  setBillingAddress: React.Dispatch<React.SetStateAction<ContactAddress>>;
  // ── Redirect ──────────────────────────────────────────────────────────────
  /**
   * Calls cartBuyerIdentityUpdate then opens checkoutUrl in a new tab with
   * Shopify checkout pre-fill params for shipping and billing.
   * checkout[billing_address_selector] is set explicitly to shipping_address
   * or custom_billing_address so Shopify selects the correct radio button.
   * When "custom_billing_address", billing address fields are also pre-filled.
   * Failure in the mutation is non-fatal — the customer is still redirected.
   */
  prefillAndRedirect: (checkoutUrl: string) => Promise<void>;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds CartBuyerIdentityInput from a ContactAddress. Omits empty optional fields. */
/** Builds a single-line display label for a saved address. Pure, no side effects. */
function buildSavedAddressLabel(a: ContactAddress): string {
  return [
    [a.firstName, a.lastName].filter(Boolean).join(" "),
    a.address1,
    [a.city, a.province, a.zip].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Builds Shopify checkout URL pre-fill query params.
 *
 * BILLING RADIO SELECTION — checkout[billing_address_selector]:
 * The billing section on Shopify's checkout has two radio buttons whose
 * form name is "billing_address_selector". We control which one is pre-
 * selected via the corresponding URL param:
 *
 *   checkout[billing_address_selector]=shipping_address
 *     → selects "Same as shipping address"
 *
 *   checkout[billing_address_selector]=custom_billing_address
 *     → selects "Use a different billing address"
 *
 * Setting this explicitly avoids the flip-flop that occurs when Shopify
 * tries to infer the radio state from whether billing fields are present
 * or from cartBuyerIdentityUpdate's deliveryAddressPreferences.
 *
 * When "custom_billing_address" is selected, the billing address fields are
 * also included so the form is pre-filled and the customer doesn't have to
 * re-enter the address they already provided in our checkout panel.
 *
 * Returns a raw query string (no leading "?") so the caller can append with
 * either "?" or "&" depending on whether the base URL already has params.
 */
function buildCheckoutPrefillParams(
  shipping: ContactAddress,
  billingOption: BillingOption,
  billing: ContactAddress,
): string {
  const p = new URLSearchParams();

  // Email
  if (shipping.email.trim()) {
    p.set("checkout[email]", shipping.email.trim());
  }

  // Shipping address — always included
  const shippingFields: [string, string][] = [
    ["checkout[shipping_address][first_name]", shipping.firstName],
    ["checkout[shipping_address][last_name]", shipping.lastName],
    ["checkout[shipping_address][company]", shipping.company],
    ["checkout[shipping_address][address1]", shipping.address1],
    ["checkout[shipping_address][address2]", shipping.address2],
    ["checkout[shipping_address][city]", shipping.city],
    ["checkout[shipping_address][province]", shipping.province],
    ["checkout[shipping_address][zip]", shipping.zip],
    ["checkout[shipping_address][country]", shipping.country],
    ["checkout[shipping_address][phone]", shipping.phone],
  ];
  for (const [k, v] of shippingFields) {
    if (v.trim()) p.set(k, v.trim());
  }

  // Billing radio — explicit selector so Shopify doesn't have to infer it
  if (billingOption === "same_as_shipping") {
    p.set("checkout[billing_address_selector]", "shipping_address");
    // No billing address fields needed; Shopify copies the shipping address.
  } else {
    p.set("checkout[billing_address_selector]", "custom_billing_address");
    // Also pre-fill the billing form so the customer doesn't re-enter data.
    const billingFields: [string, string][] = [
      ["checkout[billing_address][first_name]", billing.firstName],
      ["checkout[billing_address][last_name]", billing.lastName],
      ["checkout[billing_address][company]", billing.company],
      ["checkout[billing_address][address1]", billing.address1],
      ["checkout[billing_address][address2]", billing.address2],
      ["checkout[billing_address][city]", billing.city],
      ["checkout[billing_address][province]", billing.province],
      ["checkout[billing_address][zip]", billing.zip],
      ["checkout[billing_address][country]", billing.country],
      ["checkout[billing_address][phone]", billing.phone],
    ];
    for (const [k, v] of billingFields) {
      if (v.trim()) p.set(k, v.trim());
    }
  }

  return p.toString(); // raw qs, no leading "?"
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param _shopDomain      Accepted for API compatibility — unused since the
 *                         Storefront cart path was removed. Same convention as
 *                         useCart, so no call-site changes are needed.
 * @param _storefrontToken Likewise unused. Nothing in the Shopify widget calls
 *                         the Storefront API any more, so the install no longer
 *                         needs a Storefront access token.
 */
export function useCheckout(
  _shopDomain: string,
  _storefrontToken: string,
  initialValues?: CheckoutInitialValues,
): UseCheckoutReturn {
  const [step, setStep] = useState<CheckoutStep>("collecting_shipping");

  // Seed address from customer props so the form is pre-filled on first open.
  const [address, setAddress] = useState<ContactAddress>(() => ({
    ...EMPTY_ADDRESS,
    ...(initialValues?.email && { email: initialValues.email }),
    ...(initialValues?.firstName && { firstName: initialValues.firstName }),
    ...(initialValues?.lastName && { lastName: initialValues.lastName }),
  }));

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryGroups, setDeliveryGroups] = useState<DeliveryGroup[]>([]);

  const [billingOption, setBillingOption] =
    useState<BillingOption>("same_as_shipping");
  const [billingAddress, setBillingAddress] =
    useState<ContactAddress>(EMPTY_ADDRESS);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [savedAddressesLoading, setSavedAddressesLoading] = useState(false);

  // Ref so selectDeliveryOption always reads the latest groups synchronously.
  const deliveryGroupsRef = useRef<DeliveryGroup[]>([]);
  deliveryGroupsRef.current = deliveryGroups;

  const clearError = useCallback(() => setError(null), []);

  // ── selectedDeliveryOption (derived) ─────────────────────────────────────
  const selectedDeliveryOption = useMemo<DeliveryOption | null>(() => {
    for (const group of deliveryGroups) {
      if (!group.selectedHandle) continue;
      const opt = group.options.find((o) => o.handle === group.selectedHandle);
      if (opt) return opt;
    }
    return null;
  }, [deliveryGroups]);

  useEffect(() => {
    const { customerId, apiUrl } = initialValues ?? {};
    if (!customerId || !apiUrl) return;

    setSavedAddressesLoading(true);
    fetch(`${apiUrl}/customer-addresses?customer_id=${customerId}`)
      .then((r) => r.json())
      .then((data) => {
        const mapped: SavedAddress[] = (data.addresses ?? []).map(
          (node: any) => {
            const contactAddress: ContactAddress = {
              email: "",
              firstName: node.firstName ?? "",
              lastName: node.lastName ?? "",
              phone: node.phone ?? "",
              company: node.company ?? "",
              address1: node.address1 ?? "",
              address2: node.address2 ?? "",
              city: node.city ?? "",
              province: node.province ?? "",
              zip: node.zip ?? "",
              country: node.country ?? "IN",
            };
            return {
              id: node.id,
              isDefault: node.isDefault,
              label: buildSavedAddressLabel(contactAddress),
              address: contactAddress,
            };
          },
        );

        setSavedAddresses(mapped);

        const defaultSaved = mapped.find((a) => a.isDefault) ?? mapped[0];
        if (defaultSaved) {
          setAddress((current) => {
            const isStillEmpty = Object.keys(EMPTY_ADDRESS).every(
              (k) =>
                current[k as keyof ContactAddress] ===
                EMPTY_ADDRESS[k as keyof ContactAddress],
            );
            return isStillEmpty ? defaultSaved.address : current;
          });
        }
      })
      .catch((e) => console.warn("[MiraQ] fetchSavedAddresses:", e))
      .finally(() => setSavedAddressesLoading(false));
  }, []); // runs once on mount

  // ── fetchDeliveryOptions ──────────────────────────────────────────────────
  // ── Delivery (not available in the review-and-redirect flow) ─────────────
  // Shipping rates require a Storefront cart (cartDeliveryGroups /
  // cartSelectedDeliveryOptionsUpdate). The widget deliberately shares the
  // THEME's session cart via the Ajax Cart API instead, so no Storefront cart
  // exists to query — the previous implementation silently returned nothing
  // because getStoredCartId() is always null after the useCart migration.
  //
  // Rates are therefore chosen on Shopify's checkout, which computes them
  // authoritatively. These stubs remain so the panel keeps a stable interface
  // (and so restoring a rate preview later is a contained change).
  const fetchDeliveryOptions = useCallback(async (): Promise<void> => {
    setDeliveryGroups([]);
  }, []);

  const selectDeliveryOption = useCallback(
    async (_groupId: string, _handle: string): Promise<void> => {
      /* no-op — rates are selected on Shopify's checkout */
    },
    [],
  );

  // ── Redirect to Shopify's hosted checkout ────────────────────────────────
  const prefillAndRedirect = useCallback(
    async (checkoutUrl: string): Promise<void> => {
      setError(null);

      // Best-effort pre-fill via query params. Under Checkout Extensibility
      // these checkout[...] params may be ignored (open item C4); they are
      // harmless either way, and logged-in customers get Shopify's own
      // prefill regardless. The collected address is still validated here
      // and shown on the review step, so nothing depends on this working.
      let resolvedUrl = checkoutUrl || "/checkout";
      const prefillQs = buildCheckoutPrefillParams(
        address,
        billingOption,
        billingAddress,
      );
      if (prefillQs) {
        resolvedUrl = resolvedUrl.includes("?")
          ? `${resolvedUrl}&${prefillQs}`
          : `${resolvedUrl}?${prefillQs}`;
      }

      setStep("redirecting");
      // Same-tab navigation: the checkout lives on the same storefront the
      // widget is embedded in, matching how the widget already navigates to
      // /cart, and avoiding pop-up blockers that can swallow window.open().
      window.location.assign(resolvedUrl);
    },
    [address, billingAddress, billingOption],
  );

  const reset = useCallback(() => {
    setStep("collecting_shipping");
    setAddress({
      ...EMPTY_ADDRESS,
      ...(initialValues?.email && { email: initialValues.email }),
      ...(initialValues?.firstName && { firstName: initialValues.firstName }),
      ...(initialValues?.lastName && { lastName: initialValues.lastName }),
    });
    setDeliveryGroups([]);
    setError(null);
    setIsLoading(false);
    setBillingOption("same_as_shipping");
    setBillingAddress(EMPTY_ADDRESS);
    // savedAddresses intentionally not cleared — still valid for next checkout
  }, [initialValues]);

  return {
    step,
    setStep,
    address,
    setAddress,
    isLoading,
    error,
    clearError,
    deliveryGroups,
    selectedDeliveryOption,
    fetchDeliveryOptions,
    selectDeliveryOption,
    savedAddresses,
    savedAddressesLoading,
    billingOption,
    setBillingOption,
    billingAddress,
    setBillingAddress,
    prefillAndRedirect,
    reset,
  };
}
