/**
 * platform/shopify/useCheckout.ts
 *
 * Manages the Shopify in-widget checkout flow:
 *   1. Collects contact + delivery address (pre-filled from customer props /
 *      saved Shopify addresses when a customerAccessToken is supplied).
 *   2. Calls cartBuyerIdentityUpdate so Shopify can compute shipping rates.
 *   3. Fetches delivery groups and lets the customer pick a shipping method.
 *   4. Locks the chosen rate via cartSelectedDeliveryOptionsUpdate.
 *   5. Optionally collects a separate billing address.
 *   6. Opens cart.checkoutUrl in a new tab — payment on Shopify.
 *
 * storefrontFetch is imported from ./storefrontFetch (shared with useCart).
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { storefrontFetch, getStoredCartId } from "./storefrontFetch";

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
   * Calls cartBuyerIdentityUpdate then opens checkoutUrl in a new tab.
   * When billingOption is "different", appends Shopify billing pre-fill params.
   * Failure in the mutation is non-fatal — the customer is still redirected.
   */
  prefillAndRedirect: (checkoutUrl: string) => Promise<void>;
  reset: () => void;
}

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const BUYER_IDENTITY_UPDATE = /* GraphQL */ `
  mutation cartBuyerIdentityUpdate(
    $cartId: ID!
    $buyerIdentity: CartBuyerIdentityInput!
  ) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_DELIVERY_GROUPS = /* GraphQL */ `
  query cartDeliveryGroups($cartId: ID!) {
    cart(id: $cartId) {
      deliveryGroups(first: 5) {
        edges {
          node {
            id
            deliveryOptions {
              handle
              title
              estimatedCost {
                totalAmount {
                  amount
                  currencyCode
                }
              }
              description
            }
            selectedDeliveryOption {
              handle
            }
          }
        }
      }
    }
  }
`;

const SELECTED_DELIVERY_OPTIONS_UPDATE = /* GraphQL */ `
  mutation cartSelectedDeliveryOptionsUpdate(
    $cartId: ID!
    $selectedDeliveryOptions: [CartSelectedDeliveryOptionInput!]!
  ) {
    cartSelectedDeliveryOptionsUpdate(
      cartId: $cartId
      selectedDeliveryOptions: $selectedDeliveryOptions
    ) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds CartBuyerIdentityInput from a ContactAddress. Omits empty optional fields. */
function buildBuyerIdentity(address: ContactAddress) {
  return {
    ...(address.email && { email: address.email }),
    ...(address.phone && { phone: address.phone }),
    deliveryAddressPreferences: [
      {
        deliveryAddress: {
          firstName: address.firstName,
          lastName: address.lastName,
          ...(address.company && { company: address.company }),
          address1: address.address1,
          ...(address.address2 && { address2: address.address2 }),
          city: address.city,
          province: address.province,
          zip: address.zip,
          country: address.country,
          ...(address.phone && { phone: address.phone }),
        },
      },
    ],
  };
}

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
 * Appends Shopify checkout billing pre-fill query params to a URL.
 * Called only when billingOption === "different".
 */
function buildBillingQueryParams(a: ContactAddress): string {
  const p = new URLSearchParams();
  const fields: [string, string][] = [
    ["checkout[billing_address][first_name]", a.firstName],
    ["checkout[billing_address][last_name]", a.lastName],
    ["checkout[billing_address][address1]", a.address1],
    ["checkout[billing_address][address2]", a.address2],
    ["checkout[billing_address][city]", a.city],
    ["checkout[billing_address][province]", a.province],
    ["checkout[billing_address][zip]", a.zip],
    ["checkout[billing_address][country]", a.country],
    ["checkout[billing_address][phone]", a.phone],
    ["checkout[billing_address][company]", a.company],
  ];
  for (const [k, v] of fields) {
    if (v.trim()) p.set(k, v.trim());
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

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
  const fetchDeliveryOptions = useCallback(async (): Promise<void> => {
    const cartId = getStoredCartId();
    if (!cartId) {
      setDeliveryGroups([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Pre-fill address first so Shopify can compute rates for this address.
      // Non-fatal — we still attempt the delivery groups query if this fails.
      type IdentityResult = {
        cartBuyerIdentityUpdate: {
          cart: { id: string };
          userErrors: { field: string; message: string }[];
        };
      };
      await storefrontFetch<IdentityResult>(
        BUYER_IDENTITY_UPDATE,
        { cartId, buyerIdentity: buildBuyerIdentity(address) },
        shopDomain,
        storefrontToken,
      ).catch((e) =>
        console.warn("[MiraQ] buyerIdentityUpdate before delivery fetch:", e),
      );

      // Now fetch delivery groups.
      type DeliveryResult = {
        cart: {
          deliveryGroups: {
            edges: {
              node: {
                id: string;
                deliveryOptions: {
                  handle: string;
                  title: string;
                  estimatedCost: {
                    totalAmount: { amount: string; currencyCode: string };
                  };
                  description?: string;
                }[];
                selectedDeliveryOption: { handle: string } | null;
              };
            }[];
          };
        } | null;
      };

      const result = await storefrontFetch<DeliveryResult>(
        CART_DELIVERY_GROUPS,
        { cartId },
        shopDomain,
        storefrontToken,
      );

      const edges = result.data?.cart?.deliveryGroups.edges ?? [];
      setDeliveryGroups(
        edges.map(({ node }) => ({
          id: node.id,
          options: node.deliveryOptions.map((opt) => ({
            handle: opt.handle,
            title: opt.title,
            amount: opt.estimatedCost.totalAmount.amount,
            currencyCode: opt.estimatedCost.totalAmount.currencyCode,
            description: opt.description,
          })),
          selectedHandle: node.selectedDeliveryOption?.handle ?? null,
        })),
      );
    } catch (e) {
      console.warn("[MiraQ] fetchDeliveryOptions:", e);
      setError(
        "Could not load shipping options. You can still proceed to checkout.",
      );
      setDeliveryGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, shopDomain, storefrontToken]);

  // ── selectDeliveryOption ──────────────────────────────────────────────────
  const selectDeliveryOption = useCallback(
    async (groupId: string, handle: string): Promise<void> => {
      // Optimistic update — read latest groups from ref to avoid stale closure.
      const updated = deliveryGroupsRef.current.map((g) =>
        g.id === groupId ? { ...g, selectedHandle: handle } : g,
      );
      setDeliveryGroups(updated);

      const cartId = getStoredCartId();
      if (!cartId) return;

      const selectedDeliveryOptions = updated
        .filter((g) => g.selectedHandle !== null)
        .map((g) => ({
          deliveryGroupId: g.id,
          deliveryOptionHandle: g.selectedHandle!,
        }));

      try {
        type UpdateResult = {
          cartSelectedDeliveryOptionsUpdate: {
            cart: { id: string; checkoutUrl: string };
            userErrors: { field: string; message: string }[];
          };
        };
        const result = await storefrontFetch<UpdateResult>(
          SELECTED_DELIVERY_OPTIONS_UPDATE,
          { cartId, selectedDeliveryOptions },
          shopDomain,
          storefrontToken,
        );
        const userErrors =
          result.data?.cartSelectedDeliveryOptionsUpdate.userErrors ?? [];
        if (userErrors.length) {
          console.warn(
            "[MiraQ] cartSelectedDeliveryOptionsUpdate userErrors:",
            userErrors,
          );
        }
      } catch (e) {
        // Non-fatal — local state already updated optimistically.
        console.warn("[MiraQ] cartSelectedDeliveryOptionsUpdate failed:", e);
      }
    },
    [shopDomain, storefrontToken],
  );

  // ── prefillAndRedirect ────────────────────────────────────────────────────
  const prefillAndRedirect = useCallback(
    async (checkoutUrl: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      let resolvedUrl = checkoutUrl;

      try {
        const cartId = getStoredCartId();
        if (cartId) {
          type IdentityResult = {
            cartBuyerIdentityUpdate: {
              cart: { checkoutUrl: string };
              userErrors: { field: string; message: string }[];
            };
          };
          const result = await storefrontFetch<IdentityResult>(
            BUYER_IDENTITY_UPDATE,
            { cartId, buyerIdentity: buildBuyerIdentity(address) },
            shopDomain,
            storefrontToken,
          );
          const userErrors =
            result.data?.cartBuyerIdentityUpdate.userErrors ?? [];
          if (userErrors.length) {
            console.warn(
              "[MiraQ] cartBuyerIdentityUpdate userErrors:",
              userErrors,
            );
          }
          // Prefer the URL returned by the mutation — it may contain pre-fill tokens.
          const updatedUrl =
            result.data?.cartBuyerIdentityUpdate.cart.checkoutUrl;
          if (updatedUrl) resolvedUrl = updatedUrl;
        }
      } catch (e) {
        // Non-fatal — still redirect with the original URL.
        console.warn("[MiraQ] cartBuyerIdentityUpdate failed:", e);
      } finally {
        setIsLoading(false);
      }

      if (billingOption === "different") {
        resolvedUrl = resolvedUrl + buildBillingQueryParams(billingAddress);
      }

      setStep("redirecting");
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    },
    [address, billingAddress, billingOption, shopDomain, storefrontToken],
  );

  // ── reset ─────────────────────────────────────────────────────────────────
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
