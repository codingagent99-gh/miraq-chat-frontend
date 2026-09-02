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
import { storefrontFetch } from "./storefrontFetch";

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

/** A country the shop's localization settings actually support — fetched
 *  live from the Storefront API rather than a hardcoded list, so it always
 *  matches what this specific store enables (see fetchAvailableCountries). */
export interface AvailableCountry {
  isoCode: string;
  name: string;
}

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
  // ── Available countries (live, Storefront API) ────────────────────────────
  /** The shop's actual enabled countries — empty while loading or if the
   *  fetch failed. Consumers should fall back to a plain text input when
   *  this is empty rather than blocking on it. */
  availableCountries: AvailableCountry[];
  availableCountriesLoading: boolean;
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
  shopDomain: string,
  storefrontToken: string,
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
  const [availableCountries, setAvailableCountries] = useState<
    AvailableCountry[]
  >([]);
  const [availableCountriesLoading, setAvailableCountriesLoading] =
    useState(false);

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
            // Only the ADDRESS-specific fields signal "the shopper already
            // has real address data" — email/firstName/lastName are seeded
            // from the logged-in customer's props above (lines 271-273)
            // before this fetch ever resolves, so for every logged-in
            // customer those three were already non-empty on first render.
            // "country" is excluded too: the fetchAvailableCountries effect
            // below independently defaults it away from EMPTY_ADDRESS as
            // soon as the shop's active localized country loads, which can
            // resolve before OR after this effect — including "country"
            // here would reintroduce the exact same bug for whichever
            // effect happens to finish second. Checking all of
            // EMPTY_ADDRESS's keys (the original behaviour) meant
            // isStillEmpty was false before this fetch even landed — the
            // saved address was fetched and mapped correctly, then
            // silently discarded, every time, for every logged-in customer.
            const addressFields: (keyof ContactAddress)[] = [
              "phone",
              "company",
              "address1",
              "address2",
              "city",
              "province",
              "zip",
            ];
            const isStillEmpty = addressFields.every(
              (k) => current[k] === EMPTY_ADDRESS[k],
            );
            return isStillEmpty
              ? {
                  ...defaultSaved.address,
                  email: current.email || defaultSaved.address.email,
                  firstName:
                    current.firstName || defaultSaved.address.firstName,
                  lastName: current.lastName || defaultSaved.address.lastName,
                }
              : current;
          });
        }
      })
      .catch((e) => console.warn("[MiraQ] fetchSavedAddresses:", e))
      .finally(() => setSavedAddressesLoading(false));
  }, []); // runs once on mount

  // ── fetchAvailableCountries ────────────────────────────────────────────
  // Replaces a hardcoded/free-text country field with the store's actual
  // enabled countries. Storefront API only, since this is public storefront
  // data and the widget already carries a storefront token for exactly this
  // kind of call — no backend round-trip needed.
  //
  // Deliberately does NOT also fetch provinces/states: the Storefront API
  // has no endpoint for a country's subdivisions (a long-standing, still-
  // open gap — confirmed against Shopify's own community/feedback threads),
  // and the Admin API's province data is both deprecated and requires
  // merchant-level credentials this public widget doesn't have. Province
  // stays free-text; only the country field gets the real list.
  useEffect(() => {
    if (!shopDomain || !storefrontToken) return;
    setAvailableCountriesLoading(true);
    storefrontFetch<{
      localization: {
        availableCountries: AvailableCountry[];
        country: { isoCode: string };
      };
    }>(
      `query AvailableCountries {
        localization {
          availableCountries { isoCode name }
          country { isoCode }
        }
      }`,
      undefined,
      shopDomain,
      storefrontToken,
    )
      .then((res) => {
        const loc = res.data?.localization;
        if (!loc) {
          console.warn(
            "[MiraQ] fetchAvailableCountries: empty response",
            res.errors,
          );
          return;
        }
        const sorted = [...loc.availableCountries].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setAvailableCountries(sorted);

        // Default new/incomplete addresses to the shop's own active
        // localized country instead of the previous hardcoded "IN" — but
        // only while the country field is still untouched, same guard
        // shape as the saved-address prefill above.
        if (loc.country?.isoCode) {
          setAddress((current: ContactAddress) =>
            current.country === EMPTY_ADDRESS.country
              ? { ...current, country: loc.country.isoCode }
              : current,
          );
        }
      })
      .catch((e) => {
        // Non-fatal: ShopifyCheckoutPanel falls back to a plain text input
        // when availableCountries is empty, so checkout is never blocked by
        // this call failing.
        console.warn("[MiraQ] fetchAvailableCountries:", e);
      })
      .finally(() => setAvailableCountriesLoading(false));
  }, [shopDomain, storefrontToken]);

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
    availableCountries,
    availableCountriesLoading,
    billingOption,
    setBillingOption,
    billingAddress,
    setBillingAddress,
    prefillAndRedirect,
    reset,
  };
}
